import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { authRoutes } from "./routes/auth.js";
import { jobRoutes } from "./routes/jobs.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { queueService } from "./services/queue.js";

const fastify = Fastify({
  logger:
    env.NODE_ENV === "development"
      ? {
          level: env.LOG_LEVEL,
          transport: {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          },
        }
      : {
          level: env.LOG_LEVEL,
        },
});

const start = async () => {
  try {
    await fastify.register(helmet, {
      contentSecurityPolicy: false,
    });

    await fastify.register(cors, {
      origin: env.NODE_ENV === "development" ? true : false,
    });

    await fastify.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW,
    });

    await fastify.register(authRoutes);
    await fastify.register(webhookRoutes);
    await fastify.register(jobRoutes);

    fastify.get("/health", async (_, reply) => {
      return reply.send({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || "0.1.0",
        environment: env.NODE_ENV,
      });
    });

    fastify.setErrorHandler((error, _, reply) => {
      fastify.log.error(error);

      if (error.validation) {
        return reply.status(400).send({
          error: "Validation error",
          details: error.validation,
        });
      }

      if (error.statusCode) {
        return reply.status(error.statusCode).send({
          error: error.message,
        });
      }

      return reply.status(500).send({
        error: "Internal server error",
      });
    });

    await queueService.createCo...

  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
};

start();
