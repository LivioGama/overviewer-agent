```ts
import { and, desc, eq, gt, count as sqlCount } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

import { db } from "../database/connection.js";
import { jobs } from "../database/schema.js";
import { authenticateInstallation } from "../middleware/auth.js";
import { queueService } from "../services/queue.js";

/* -------------------------------------------------------------------------- */
/*                              Helper Types                                 */
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

/* -------------------------------------------------------------------------- */
/*                              Helper Functions                               */
/* -------------------------------------------------------------------------- */

/**
 * Parses a numeric string param to an integer.
 * Returns `null` if parsing fails.
 */
function parseIntParam(value: string): number | null {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/**
 * Common logic for fetching a single job belonging to an installation.
 */
async function findJob(
  installationId: number,
  jobId: string,
): Promise<typeof jobs.$inferSelect | null> {
  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(eq(jobs.id, jobId), eq(jobs.installationId, installationId)),
    )
    .limit(1);

  return rows[0] ?? null;
}

/**
 * Builds a WHERE clause array based on optional query parameters.
 */
function buildJobFilters(
  installationId: number,
  query: JobsQuery,
): Array<ReturnType<typeof eq>> {
  const filters: Array<ReturnType<typeof eq>> = [
    eq(jobs.installationId, installationId),
  ];

  if (query.status) filters.push(eq(jobs.status, query.status));
  if (query.repoOwner) filters.push(eq(jobs.repoOwner, query.repoOwner));
  if (query.repoName) filters.push(eq(jobs.repoName, query.repoName));

  return filters;
}

/* -------------------------------------------------------------------------- */
/*                              Route Handlers                                 */
/* -------------------------------------------------------------------------- */

export async function jobRoutes(fastify: FastifyInstance): Promise<void> {
  /* ------------------------------- GET LIST ------------------------------- */
  fastify.get(
    "/installations/:installationId/jobs",
    {
      preHandler: [authenticateInstallation],
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
              enum: ["queued", "in_progress", "completed", "failed", "cancelled"],
            },
            repoOwner: { type: "string" },
            repoName: { type: "string" },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: InstallationParams; Querystring: JobsQuery }>, reply: FastifyReply) => {
      const installationIdNum = parseIntParam(request.params.installationId);
      if (installationIdNum === null) {
        return reply.code(400).send({ error: "Invalid installationId" });
      }

      const { limit = 20, offset = 0 } = request.query;

      const rows = await db
        .select()
        .from(jobs)
        .where(and(...buildJobFilters(installationIdNum, request.query)))
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .offset(offset);

      // Optional: total count for pagination (separate query)
      const [{ total }] = await db
        .select({ total: sqlCount() })
        .from(jobs)
        .where(and(...buildJobFilters(installationIdNum, request.query)));

      return reply.send({
        jobs: rows,
        pagination: { limit, offset, total },
      });
    },
  );

  /* -------------------------------- GET ONE ------------------------------- */
  fastify.get(
    "/installations/:installationId/jobs/:jobId",
    {
      preHandler: [authenticateInstallation],
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
    },
    async (request: FastifyRequest<{ Params: JobParams }>, reply: FastifyReply) => {
      const { installationId, jobId } = request.params;
      const installationIdNum = parseIntParam(installationId);
      if (installationIdNum === null) {
        return reply.code(400).send({ error: "Invalid installationId" });
      }

      const job = await findJob(installationIdNum, jobId);
      if (!job) {
        return reply.code(404).send({ error: "Job not found" });
      }

      return reply.send({ job });
    },
  );

  /* ------------------------------- CANCEL JOB ---------------------------- */
  fastify.post(
    "/installations/:installationId/jobs/:jobId/cancel",
    {
      preHandler: [authenticateInstallation],
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
    },
    async (request: FastifyRequest<{ Params: JobParams }>, reply: FastifyReply) => {
      const { installationId, jobId } = request.params;
      const installationIdNum = parseIntParam(installationId);
      if (installationIdNum === null) {
        return reply.code(400).send({ error: "Invalid installationId" });
      }

      const job = await findJob(installationIdNum, jobId);
      if (!job) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (!["queued", "in_progress"].includes(job.status)) {
        return reply.code(400).send({ error: "Job cannot be cancelled" });
      }

      await Promise.all([
        queueService.updateJobStatus(jobId, "cancelled"),
        db
          .update(jobs)
          .set({ status: "cancelled", completedAt: new Date() })
          .where(eq(jobs.id, jobId)),
      ]);

      return reply.send({ success: true, message: "Job cancelled" });
    },
  );

  /* --------------------------------- RETRY -------------------------------- */
  fastify.post(
    "/installations/:installationId/jobs/:jobId/retry",
    {
      preHandler: [authenticateInstallation],
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
    },
    async (request: FastifyRequest<{ Params: JobParams }>, reply: FastifyReply) => {
      const { installationId, jobId } = request.params;
      const installationIdNum = parseIntParam(installationId);
      if (installationIdNum === null) {
        return reply.code(400).send({ error: "Invalid installationId" });
      }

      const job = await findJob(installationIdNum, jobId);
      if (!job) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (job.status !== "failed") {
        return reply.code(400).send({ error: "Only failed jobs can be retried" });
      }

      await queueService.retryJob(jobId);
      return reply.send({ success: true, message: "Job queued for retry" });
    },
  );

  /* --------------------------------- STATS -------------------------------- */
  fastify.get(
    "/installations/:installationId/stats",
    {
      preHandler: [authenticateInstallation],
      schema: {
        params: {
          type: "object",
          properties: { installationId: { type: "string" } },
          required: ["installationId"],
        },
      },
    },
    async (request: FastifyRequest<{ Params: InstallationParams }>, reply: FastifyReply) => {
      const installationIdNum = parseIntParam(request.params.installationId);
      if (installationIdNum === null) {
        return reply.code(400).send({ error: "Invalid installationId" });
      }

      const rows = await db
        .select({
          status: jobs.status,
          count: sqlCount(),
        })
        .from(jobs)
        .where(eq(jobs.installationId, installationIdNum))
        .groupBy(jobs.status);

      const stats = {
        total: 0,
        queued: 0,
        in_progress: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };

      rows.forEach((row) => {
        const statusKey = row.status as keyof typeof stats;
        stats[statusKey] = Number(row.count);
        stats.total += Number(row.count);
      });

      return reply.send({ stats });
    },
  );
}
```