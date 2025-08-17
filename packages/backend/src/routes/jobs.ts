```ts
import { and, desc, eq, gt, count as sqlCount } from "drizzle-orm";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RouteHandlerMethod,
} from "fastify";

import { db } from "../database/connection.js";
import { jobs } from "../database/schema.js";
import { authenticateInstallation } from "../middleware/auth.js";
import { queueService } from "../services/queue.js";

/* -------------------------------------------------------------------------- */
/*                               Types & Enums                               */
/* -------------------------------------------------------------------------- */

type InstallationParams = { installationId: string };
type JobParams = InstallationParams & { jobId: string };

type JobsQuery = {
  limit?: number;
  offset?: number;
  status?: typeof jobs.status._type;
  repoOwner?: string;
  repoName?: string;
};

enum JobStatus {
  Queued = "queued",
  InProgress = "in_progress",
  Completed = "completed",
  Failed = "failed",
  Cancelled = "cancelled",
}

/* -------------------------------------------------------------------------- */
/*                               Helper Utils                                 */
/* -------------------------------------------------------------------------- */

/**
 * Safely parses a numeric string/number to integer.
 * Returns `null` if parsing fails.
 */
function toInt(value: string | number): number | null {
  const num = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Returns a reusable Fastify `preHandler` that validates and converts
 * `installationId` param to a number, exposing it as `request.installationId`.
 */
function validateInstallationId<
  Params extends InstallationParams,
  Query = unknown,
  Body = unknown,
  Headers = unknown,
>() {
  return async (
    request: FastifyRequest<{
      Params: Params;
      Querystring: Query;
      Body: Body;
      Headers: Headers;
    }>,
    reply: FastifyReply,
  ) => {
    const id = toInt(request.params.installationId);
    if (id === null) {
      reply.code(400).send({ error: "Invalid installationId" });
      return;
    }
    // @ts-expect-error – augment request for downstream handlers
    request.installationId = id;
  };
}

/**
 * Retrieves a job belonging to the validated installation.
 */
async function getJob(
  installationId: number,
  jobId: string,
) {
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.installationId, installationId)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Constructs filters for job queries based on optional parameters.
 */
function jobFilters(
  installationId: number,
  query: JobsQuery,
) {
  const filters = [eq(jobs.installationId, installationId)] as const;

  if (query.status) filters.push(eq(jobs.status, query.status));
  if (query.repoOwner) filters.push(eq(jobs.repoOwner, query.repoOwner));
  if (query.repoName) filters.push(eq(jobs.repoName, query.repoName));

  return filters;
}

/* -------------------------------------------------------------------------- */
/*                               Route Handlers                                */
/* -------------------------------------------------------------------------- */

export async function jobRoutes(fastify: FastifyInstance): Promise<void> {
  const basePath = "/installations/:installationId";

  /* ------------------------------- LIST ----------------------------------- */
  fastify.get<{
    Params: InstallationParams;
    Querystring: JobsQuery;
  }>(`${basePath}/jobs`, {
    preHandler: [authenticateInstallation, validateInstallationId()],
    schema: {
      params: {
        type: "object",
        properties: { installationId: { type: "string" } },
        required: ["installationId"],
      },
      querystring: {
        type: "object",
        properties: {
          limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          offset: { type: "integer", minimum: 0, default: 0 },
          status: {
            type: "string",
            enum: Object.values(JobStatus),
          },
          repoOwner: { type: "string" },
          repoName: { type: "string" },
        },
      },
    },
  } as RouteHandlerMethod, async (req, reply) => {
    const installationId = (req as any).installationId as number;
    const { limit = 20, offset = 0 } = req.query;

    const filters = jobFilters(installationId, req.query);

    const [jobsRows, [{ total }]] = await Promise.all([
      db
        .select()
        .from(jobs)
        .where(and(...filters))
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .offset(offset),

      db
        .select({ total: sqlCount() })
        .from(jobs)
        .where(and(...filters)),
    ]);

    reply.send({ jobs: jobsRows, pagination: { limit, offset, total } });
  });

  /* -------------------------------- GET ONE ------------------------------ */
  fastify.get<{
    Params: JobParams;
  }>(`${basePath}/jobs/:jobId`, {
    preHandler: [authenticateInstallation, validateInstallationId()],
    schema: {
      params: {
        type: "object",
        properties: {
          installationId: { type: "string" },
          jobId: { type: "string" },
        },
        required: ["installationId", "jobId"],
      },
    },
  } as RouteHandlerMethod, async (req, reply) => {
    const installationId = (req as any).installationId as number;
    const { jobId } = req.params;

    const job = await getJob(installationId, jobId);
    if (!job) {
      reply.code(404).send({ error: "Job not found" });
      return;
    }

    reply.send({ job });
  });

  /* ------------------------------- CANCEL -------------------------------- */
  fastify.post<{
    Params: JobParams;
  }>(`${basePath}/jobs/:jobId/cancel`, {
    preHandler: [authenticateInstallation, validateInstallationId()],
    schema: {
      params: {
        type: "object",
        properties: {
          installationId: { type: "string" },
          jobId: { type: "string" },
        },
        required: ["installationId", "jobId"],
      },
    },
  } as RouteHandlerMethod, async (req, reply) => {
    const installationId = (req as any).installationId as number;
    const { jobId } = req.params;

    const job = await getJob(installationId, jobId);
    if (!job) {
      reply.code(404).send({ error: "Job not found" });
      return;
    }

    if (![JobStatus.Queued, JobStatus.InProgress].includes(job.status as JobStatus)) {
      reply.code(400).send({ error: "Job cannot be cancelled" });
      return;
    }

    await Promise.all([
      queueService.updateJobStatus(jobId, JobStatus.Cancelled),
      db
        .update(jobs)
        .set({ status: JobStatus.Cancelled, completedAt: new Date() })
        .where(eq(jobs.id, jobId)),
    ]);

    reply.send({ success: true, message: "Job cancelled" });
  });

  /* --------------------------------- RETRY -------------------------------- */
  fastify.post<{
    Params: JobParams;
  }>(`${basePath}/jobs/:jobId/retry`, {
    preHandler: [authenticateInstallation, validateInstallationId()],
    schema: {
      params: {
        type: "object",
        properties: {
          installationId: { type: "string" },
          jobId: { type: "string" },
        },
        required: ["installationId", "jobId"],
      },
    },
  } as RouteHandlerMethod, async (req, reply) => {
    const installationId = (req as any).installationId as number;
    const { jobId } = req.params;

    const job = await getJob(installationId, jobId);
    if (!job) {
      reply.code(404).send({ error: "Job not found" });
      return;
    }

    if (job.status !== JobStatus.Failed) {
      reply.code(400).send({ error: "Only failed jobs can be retried" });
      return;
    }

    await queueService.retryJob(jobId);
    reply.send({ success: true, message: "Job queued for retry" });
  });

  /* --------------------------------- STATS -------------------------------- */
  fastify.get<{
    Params: InstallationParams;
  }>(`${basePath}/stats`, {
    preHandler: [authenticateInstallation, validateInstallationId()],
    schema: {
      params: {
        type: "object",
        properties: { installationId: { type: "string" } },
        required: ["installationId"],
      },
    },
  } as RouteHandlerMethod, async (req, reply) => {
    const installationId = (req as any).installationId as number;

    const rows = await db
      .select({
        status: jobs.status,
        count: sqlCount(),
      })
      .from(jobs)
      .where(eq(jobs.installationId, installationId))
      .groupBy(jobs.status);

    const stats = {
      total: 0,
      [JobStatus.Queued]: 0,
      [JobStatus.InProgress]: 0,
      [JobStatus.Completed]: 0,
      [JobStatus.Failed]: 0,
      [JobStatus.Cancelled]: 0,
    };

    for (const { status, count } of rows) {
      const key = status as keyof typeof stats;
      const value = Number(count);
      stats[key] = value;
      stats.total += value;
    }

    reply.send({ stats });
  });
}
```