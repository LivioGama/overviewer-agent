```ts
import { and, desc, eq, count as drizzleCount } from "drizzle-orm";
import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { db } from "../database/connection.js";
import { jobs } from "../database/schema.js";
import { authenticateInstallation } from "../middleware/auth.js";
import { queueService } from "../services/queue.js";

type InstallationParams = { installationId: string };
type JobParams = InstallationParams & { jobId: string };

type ListJobsQuery = {
  limit?: number;
  offset?: number;
  status?: keyof typeof jobStatusMap;
  repoOwner?: string;
  repoName?: string;
};

const jobStatusMap = {
  queued: "queued",
  in_progress: "in_progress",
  completed: "completed",
  failed: "failed",
  cancelled: "cancelled",
} as const;

class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/* --------------------------------------------------------------------------
   Helper utilities
   -------------------------------------------------------------------------- */
function parseInstallationId(id: string): number {
  const num = Number(id);
  if (!Number.isInteger(num) || num < 0) {
    throw new BadRequestError("Invalid installationId");
  }
  return num;
}

async function findJob(installationId: number, jobId: string) {
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.id, jobId), eq(jobs.installationId, installationId)))
    .limit(1);
  return rows[0] ?? null;
}

async function requireJob(
  installationId: number,
  jobId: string,
  reply: FastifyReply,
) {
  const job = await findJob(installationId, jobId);
  if (!job) {
    reply.code(404).send({ error: "Job not found" });
    return null;
  }
  return job;
}

/**
 * Wrap route handlers to centralise error handling.
 */
function asyncHandler<
  Req extends FastifyRequest = FastifyRequest,
  Res extends FastifyReply = FastifyReply,
>(fn: (req: Req, res: Res) => Promise<unknown>) {
  return async (req: Req, res: Res) => {
    try {
      await fn(req, res);
    } catch (err) {
      const message = (err as Error).message ?? "Internal server error";
      const status = err instanceof BadRequestError ? 400 : 500;
      res.code(status).send({ error: message });
    }
  };
}

/* --------------------------------------------------------------------------
   JSON Schemas (Fastify validation)
   -------------------------------------------------------------------------- */
const installationParamSchema = {
  type: "object",
  properties: { installationId: { type: "string" } },
  required: ["installationId"] as const,
};

const jobParamSchema = {
  type: "object",
  properties: {
    installationId: { type: "string" },
    jobId: { type: "string" },
  },
  required: ["installationId", "jobId"] as const,
};

const listJobsQuerySchema = {
  type: "object",
  properties: {
    limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
    offset: { type: "integer", minimum: 0, default: 0 },
    status: {
      type: "string",
      enum: Object.keys(jobStatusMap) as (keyof typeof jobStatusMap)[],
    },
    repoOwner: { type: "string" },
    repoName: { type: "string" },
  },
  additionalProperties: false,
};

/* --------------------------------------------------------------------------
   Route definitions
   -------------------------------------------------------------------------- */
export async function jobRoutes(fastify: FastifyInstance) {
  // ------------------------------------------------------------------------
  // List jobs
  // ------------------------------------------------------------------------
  fastify.get(
    "/installations/:installationId/jobs",
    {
      preHandler: [authenticateInstallation],
      schema: {
        params: installationParamSchema,
        querystring: listJobsQuerySchema,
      },
    },
    asyncHandler(async (request, reply) => {
      const installationId = parseInstallationId(
        request.params.installationId,
      );
      const { limit = 20, offset = 0, status, repoOwner, repoName } =
        request.query as ListJobsQuery;

      const conditions = [eq(jobs.installationId, installationId)];
      if (status) conditions.push(eq(jobs.status, status));
      if (repoOwner) conditions.push(eq(jobs.repoOwner, repoOwner));
      if (repoName) conditions.push(eq(jobs.repoName, repoName));

      const [items, [{ total }]] = await Promise.all([
        db
          .select()
          .from(jobs)
          .where(and(...conditions))
          .orderBy(desc(jobs.createdAt))
          .limit(limit)
          .offset(offset),
        db
          .select({ total: drizzleCount() })
          .from(jobs)
          .where(and(...conditions)),
      ]);

      reply.send({ jobs: items, pagination: { limit, offset, total } });
    }),
  );

  // ------------------------------------------------------------------------
  // Get single job
  // ------------------------------------------------------------------------
  fastify.get(
    "/installations/:installationId/jobs/:jobId",
    {
      preHandler: [authenticateInstallation],
      schema: { params: jobParamSchema },
    },
    asyncHandler(async (request, reply) => {
      const installationId = parseInstallationId(
        request.params.installationId,
      );
      const job = await requireJob(
        installationId,
        request.params.jobId,
        reply,
      );
      if (!job) return;
      reply.send({ job });
    }),
  );

  // ------------------------------------------------------------------------
  // Cancel job
  // ------------------------------------------------------------------------
  fastify.post(
    "/installations/:installationId/jobs/:jobId/cancel",
    {
      preHandler: [authenticateInstallation],
      schema: { params: jobParamSchema },
    },
    asyncHandler(async (request, reply) => {
      const installationId = parseInstallationId(
        request.params.installationId,
      );
      const job = await requireJob(
        installationId,
        request.params.jobId,
        reply,
      );
      if (!job) return;

      if (!["queued", "in_progress"].includes(job.status)) {
        reply.code(400).send({ error: "Job cannot be cancelled" });
        return;
      }

      await Promise.all([
        queueService.updateJobStatus(job.id, "cancelled"),
        db
          .update(jobs)
          .set({ status: "cancelled", completedAt: new Date() })
          .where(eq(jobs.id, job.id)),
      ]);

      reply.send({ success: true, message: "Job cancelled" });
    }),
  );

  // ------------------------------------------------------------------------
  // Retry job
  // ------------------------------------------------------------------------
  fastify.post(
    "/installations/:installationId/jobs/:jobId/retry",
    {
      preHandler: [authenticateInstallation],
      schema: { params: jobParamSchema },
    },
    asyncHandler(async (request, reply) => {
      const installationId = parseInstallationId(
        request.params.installationId,
      );
      const job = await requireJob(
        installationId,
        request.params.jobId,
        reply,
      );
      if (!job) return;

      if (job.status !== "failed") {
        reply
          .code(400)
          .send({ error: "Only failed jobs can be retried" });
        return;
      }

      await queueService.retryJob(job.id);
      reply.send({ success: true, message: "Job queued for retry" });
    }),
  );

  // ------------------------------------------------------------------------
  // Installation stats
  // ------------------------------------------------------------------------
  fastify.get(
    "/installations/:installationId/stats",
    {
      preHandler: [authenticateInstallation],
      schema: { params: installationParamSchema },
    },
    asyncHandler(async (request, reply) => {
      const installationId = parseInstallationId(
        request.params.installationId,
      );

      const rows = await db
        .select({
          status: jobs.status,
          count: drizzleCount(),
        })
        .from(jobs)
        .where(eq(jobs.installationId, installationId))
        .groupBy(jobs.status);

      const stats = {
        total: 0,
        queued: 0,
        in_progress: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };

      for (const { status, count } of rows) {
        const key = status as keyof typeof stats;
        const cnt = Number(count);
        stats[key] = cnt;
        stats.total += cnt;
      }

      reply.send({ stats });
    }),
  );
}
```