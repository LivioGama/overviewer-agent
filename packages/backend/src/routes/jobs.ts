```ts
import {
  and,
  desc,
  eq,
  gt,
  count as sqlCount,
  type SQL,
} from "drizzle-orm";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
  RouteHandlerMethod,
  preValidationHookHandler,
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
/*                               Request Augmentation                         */
/* -------------------------------------------------------------------------- */

declare module "fastify" {
  interface FastifyRequest {
    /** Installation id is guaranteed to be a number after `validateInstallationId`. */
    installationId: number;
  }
}

/* -------------------------------------------------------------------------- */
/*                               Helper Utils                                 */
/* -------------------------------------------------------------------------- */

/**
 * Safely parses a numeric string or number to an integer.
 * Returns `null` when parsing fails.
 */
function toInt(value: string | number): number | null {
  const num = typeof value === "number" ? value : Number.parseInt(value, 10);
  return Number.isNaN(num) ? null : num;
}

/**
 * Fastify pre‑handler that validates `installationId` URL param and decorates
 * the request with a numeric `installationId` property.
 */
const validateInstallationId: preValidationHookHandler<{
  Params: InstallationParams;
}> = async (request, reply) => {
  const id = toInt(request.params.installationId);
  if (id === null) {
    reply.code(400).send({ error: "Invalid installationId" });
    return;
  }
  request.installationId = id;
};

/**
 * Retrieves a job belonging to the provided installation.
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
 * Builds an array of SQL filters for job queries.
 */
function jobFilters(
  installationId: number,
  query: JobsQuery,
): SQL[] {
  const filters: SQL[] = [eq(jobs.installationId, installationId)];

  if (query.status) filters.push(eq(jobs.status, query.status));
  if (query.repoOwner) filters.push(eq(jobs.repoOwner, query.repoOwner));
  if (query.repoName) filters.push(eq(jobs.repoName, query.repoName));

  return filters;
}

/* -------------------------------------------------------------------------- */
/*                               Schemas (Fastify)                           */
/* -------------------------------------------------------------------------- */

const installationParamsSchema = {
  type: "object",
  properties: { installationId: { type: "string" } },
  required: ["installationId"],
} as const;

const jobParamsSchema = {
  type: "object",
  properties: {
    installationId: { type: "string" },
    jobId: { type: "string" },
  },
  required: ["installationId", "jobId"],
} as const;

const jobsQuerySchema = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    offset: { type: "integer", minimum: 0, default: 0 },
    status: { type: "string", enum: Object.values(JobStatus) },
    repoOwner: { type: "string" },
    repoName: { type: "string" },
  },
} as const;

/* -------------------------------------------------------------------------- */
/*                               Route Handlers                                */
/* -------------------------------------------------------------------------- */

export async function jobRoutes(fastify: FastifyInstance): Promise<void> {
  const basePath = "/installations/:installationId";
  const commonPreHandlers = [authenticateInstallation, validateInstallationId];

  /** LIST jobs */
  fastify.get<{
    Params: InstallationParams;
    Querystring: JobsQuery;
  }>(`${basePath}/jobs`, {
    preHandler: commonPreHandlers,
    schema: {
      params: installationParamsSchema,
      querystring: jobsQuerySchema,
    },
  } as RouteHandlerMethod, async (req, reply) => {
    const { limit = 20, offset = 0 } = req.query;
    const filters = jobFilters(req.installationId, req.query);

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

  /** GET single job */
  fastify.get<{
    Params: JobParams;
  }>(`${basePath}/jobs/:jobId`, {
    preHandler: commonPreHandlers,
    schema: { params: jobParamsSchema },
  } as RouteHandlerMethod, async (req, reply) => {
    const job = await getJob(req.installationId, req.params.jobId);
    if (!job) {
      reply.code(404).send({ error: "Job not found" });
      return;
    }
    reply.send({ job });
  });

  /** CANCEL job */
  fastify.post<{
    Params: JobParams;
  }>(`${basePath}/jobs/:jobId/cancel`, {
    preHandler: commonPreHandlers,
    schema: { params: jobParamsSchema },
  } as RouteHandlerMethod, async (req, reply) => {
    const job = await getJob(req.installationId, req.params.jobId);
    if (!job) {
      reply.code(404).send({ error: "Job not found" });
      return;
    }

    const cancellable = [
      JobStatus.Queued,
      JobStatus.InProgress,
    ] as const;

    if (!cancellable.includes(job.status as typeof cancellable[number])) {
      reply.code(400).send({ error: "Job cannot be cancelled" });
      return;
    }

    await Promise.all([
      queueService.updateJobStatus(req.params.jobId, JobStatus.Cancelled),
      db
        .update(jobs)
        .set({ status: JobStatus.Cancelled, completedAt: new Date() })
        .where(eq(jobs.id, req.params.jobId)),
    ]);

    reply.send({ success: true, message: "Job cancelled" });
  });

  /** RETRY job */
  fastify.post<{
    Params: JobParams;
  }>(`${basePath}/jobs/:jobId/retry`, {
    preHandler: commonPreHandlers,
    schema: { params: jobParamsSchema },
  } as RouteHandlerMethod, async (req, reply) => {
    const job = await getJob(req.installationId, req.params.jobId);
    if (!job) {
      reply.code(404).send({ error: "Job not found" });
      return;
    }

    if (job.status !== JobStatus.Failed) {
      reply.code(400).send({ error: "Only failed jobs can be retried" });
      return;
    }

    await queueService.retryJob(req.params.jobId);
    reply.send({ success: true, message: "Job queued for retry" });
  });

  /** STATS */
  fastify.get<{
    Params: InstallationParams;
  }>(`${basePath}/stats`, {
    preHandler: commonPreHandlers,
    schema: { params: installationParamsSchema },
  } as RouteHandlerMethod, async (req, reply) => {
    const rows = await db
      .select({
        status: jobs.status,
        count: sqlCount(),
      })
      .from(jobs)
      .where(eq(jobs.installationId, req.installationId))
      .groupBy(jobs.status);

    const stats = rows.reduce(
      (acc, { status, count }) => {
        const key = status as keyof typeof acc;
        const value = Number(count);
        acc[key] = value;
        acc.total += value;
        return acc;
      },
      {
        total: 0,
        [JobStatus.Queued]: 0,
        [JobStatus.InProgress]: 0,
        [JobStatus.Completed]: 0,
        [JobStatus.Failed]: 0,
        [JobStatus.Cancelled]: 0,
      } as Record<JobStatus | "total", number>,
    );

    reply.send({ stats });
  });
}
```