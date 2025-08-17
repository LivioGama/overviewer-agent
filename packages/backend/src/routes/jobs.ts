```ts
import { and, desc, eq, count as drizzleCount } from "drizzle-orm";
import {
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";

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

/* -------------------------------------------------
   Helpers
--------------------------------------------------- */
function parseInstallationId(id: string): number {
  const num = Number(id);
  if (!Number.isInteger(num) || num < 0) {
    throw new Error("Invalid installationId");
  }
  return num;
}

async function findJob(installationId: number, jobId: string) {
  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.id, jobId), eq(jobs.installationId, installationId)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/* -------------------------------------------------
   Reusable JSON Schemas
--------------------------------------------------- */
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

/* -------------------------------------------------
   Route definitions
--------------------------------------------------- */
export async function jobRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/installations/:installationId/jobs",
    {
      preHandler: [authenticateInstallation],
      schema: {
        params: installationParamSchema,
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "integer", minimum: 0, default: 0 },
            status: {
              type: "string",
              enum: Object.keys(jobStatusMap) as unknown as string[],
            },
            repoOwner: { type: "string" },
            repoName: { type: "string" },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Params: InstallationParams;
        Querystring: ListJobsQuery;
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const installationId = parseInstallationId(request.params.installationId);
        const { limit = 20, offset = 0, status, repoOwner, repoName } = request.query;

        const where = [eq(jobs.installationId, installationId)];
        if (status) where.push(eq(jobs.status, status));
        if (repoOwner) where.push(eq(jobs.repoOwner, repoOwner));
        if (repoName) where.push(eq(jobs.repoName, repoName));

        const [list, [{ total }]] = await Promise.all([
          db
            .select()
            .from(jobs)
            .where(and(...where))
            .orderBy(desc(jobs.createdAt))
            .limit(limit)
            .offset(offset),
          db
            .select({ total: drizzleCount() })
            .from(jobs)
            .where(and(...where)),
        ]);

        reply.send({ jobs: list, pagination: { limit, offset, total } });
      } catch (err) {
        reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  fastify.get(
    "/installations/:installationId/jobs/:jobId",
    {
      preHandler: [authenticateInstallation],
      schema: { params: jobParamSchema },
    },
    async (
      request: FastifyRequest<{ Params: JobParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const installationId = parseInstallationId(request.params.installationId);
        const job = await findJob(installationId, request.params.jobId);
        if (!job) return reply.code(404).send({ error: "Job not found" });
        reply.send({ job });
      } catch (err) {
        reply.code(400).send({ error: (err as Error).message });
      }
    },
  );

  fastify.post(
    "/installations/:installationId/jobs/:jobId/cancel",
    {
      preHandler: [authenticateInstallation],
      schema: { params: jobParamSchema },
    },
    async (
      request: FastifyRequest<{ Params: JobParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const installationId = parseInstallationId(request.params.installationId);
        const job = await findJob(installationId, request.params.jobId);
        if (!job) return reply.code(404).send({ error: "Job not found" });

        if (!["queued", "in_progress"].includes(job.status)) {
          return reply.code(400).send({ error: "Job cannot be cancelled" });
        }

        await Promise.all([
          queueService.updateJobStatus(job.id, "cancelled"),
          db
            .update(jobs)
            .set({ status: "cancelled", completedAt: new Date() })
            .where(eq(jobs.id, job.id)),
        ]);

        reply.send({ success: true, message: "Job cancelled" });
      } catch (err) {
        reply.code(500).send({ error: (err as Error).message });
      }
    },
  );

  fastify.post(
    "/installations/:installationId/jobs/:jobId/retry",
    {
      preHandler: [authenticateInstallation],
      schema: { params: jobParamSchema },
    },
    async (
      request: FastifyRequest<{ Params: JobParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const installationId = parseInstallationId(request.params.installationId);
        const job = await findJob(installationId, request.params.jobId);
        if (!job) return reply.code(404).send({ error: "Job not found" });

        if (job.status !== "failed") {
          return reply
            .code(400)
            .send({ error: "Only failed jobs can be retried" });
        }

        await queueService.retryJob(job.id);
        reply.send({ success: true, message: "Job queued for retry" });
      } catch (err) {
        reply.code(500).send({ error: (err as Error).message });
      }
    },
  );

  fastify.get(
    "/installations/:installationId/stats",
    {
      preHandler: [authenticateInstallation],
      schema: { params: installationParamSchema },
    },
    async (
      request: FastifyRequest<{ Params: InstallationParams }>,
      reply: FastifyReply,
    ) => {
      try {
        const installationId = parseInstallationId(request.params.installationId);
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

        rows.forEach((r) => {
          const key = r.status as keyof typeof stats;
          const cnt = Number(r.count);
          stats[key] = cnt;
          stats.total += cnt;
        });

        reply.send({ stats });
      } catch (err) {
        reply.code(500).send({ error: (err as Error).message });
      }
    },
  );
}
```