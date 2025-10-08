import { and, desc, eq } from "drizzle-orm";
import { FastifyInstance } from "fastify";
import { db } from "../database/connection.js";
import { jobs } from "../database/schema.js";
import { authenticateInstallation } from "../middleware/auth.js";
import { queueService } from "../services/queue.js";

export async function jobRoutes(fastify: FastifyInstance) {
  fastify.get(
    "/installations/:installationId/jobs",
    {
      preHandler: [authenticateInstallation],
      schema: {
        params: {
          type: "object",
          properties: {
            installationId: { type: "string" },
          },
          required: ["installationId"],
        },
        querystring: {
          type: "object",
          properties: {
            limit: { type: "number", minimum: 1, maximum: 100, default: 20 },
            offset: { type: "number", minimum: 0, default: 0 },
            status: {
              type: "string",
              enum: [
                "queued",
                "in_progress",
                "completed",
                "failed",
                "cancelled",
              ],
            },
            repoOwner: { type: "string" },
            repoName: { type: "string" },
          },
        },
      },
    },
    async (request, reply) => {
      const { installationId } = request.params as { installationId: string };
      const {
        limit = 20,
        offset = 0,
        status,
        repoOwner,
        repoName,
      } = request.query as any;

      let whereConditions = [
        eq(jobs.installationId, parseInt(installationId, 10)),
      ];

      if (status) {
        whereConditions.push(eq(jobs.status, status));
      }

      if (repoOwner) {
        whereConditions.push(eq(jobs.repoOwner, repoOwner));
      }

      if (repoName) {
        whereConditions.push(eq(jobs.repoName, repoName));
      }

      const jobsList = await db
        .select()
        .from(jobs)
        .where(and(...whereConditions))
        .orderBy(desc(jobs.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send({
        jobs: jobsList,
        pagination: {
          limit,
          offset,
          total: jobsList.length,
        },
      });
    },
  );

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
    async (request, reply) => {
      const { installationId, jobId } = request.params as {
        installationId: string;
        jobId: string;
      };

      const job = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.installationId, parseInt(installationId, 10)),
          ),
        )
        .limit(1);

      if (!job[0]) {
        return reply.code(404).send({ error: "Job not found" });
      }

      return reply.send({ job: job[0] });
    },
  );

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
    async (request, reply) => {
      const { installationId, jobId } = request.params as {
        installationId: string;
        jobId: string;
      };

      const job = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.installationId, parseInt(installationId, 10)),
          ),
        )
        .limit(1);

      if (!job[0]) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (!["queued", "in_progress"].includes(job[0].status)) {
        return reply.code(400).send({ error: "Job cannot be cancelled" });
      }

      await queueService.updateJobStatus(jobId, "cancelled");

      await db
        .update(jobs)
        .set({
          status: "cancelled",
          completedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      return reply.send({ success: true, message: "Job cancelled" });
    },
  );

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
    async (request, reply) => {
      const { installationId, jobId } = request.params as {
        installationId: string;
        jobId: string;
      };

      const job = await db
        .select()
        .from(jobs)
        .where(
          and(
            eq(jobs.id, jobId),
            eq(jobs.installationId, parseInt(installationId, 10)),
          ),
        )
        .limit(1);

      if (!job[0]) {
        return reply.code(404).send({ error: "Job not found" });
      }

      if (job[0].status !== "failed") {
        return reply
          .code(400)
          .send({ error: "Only failed jobs can be retried" });
      }

      await queueService.retryJob(jobId);

      return reply.send({ success: true, message: "Job queued for retry" });
    },
  );

  fastify.get(
    "/installations/:installationId/stats",
    {
      preHandler: [authenticateInstallation],
      schema: {
        params: {
          type: "object",
          properties: {
            installationId: { type: "string" },
          },
          required: ["installationId"],
        },
      },
    },
    async (request, reply) => {
      const { installationId } = request.params as { installationId: string };

      const statsQuery = await db
        .select({
          status: jobs.status,
          count: jobs.id,
        })
        .from(jobs)
        .where(eq(jobs.installationId, parseInt(installationId, 10)));

      const stats = {
        total: 0,
        queued: 0,
        in_progress: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
      };

      statsQuery.forEach((row) => {
        stats.total++;
        stats[row.status as keyof typeof stats]++;
      });

      return reply.send({ stats });
    },
  );
}
