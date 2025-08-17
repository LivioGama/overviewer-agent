```ts
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";

import { env } from "./config/env";
import { authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";
import { webhookRoutes } from "./routes/webhooks";
import { queueService } from "./services/queue";

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
    await fastify.register(helmet, { contentSecurityPolicy: false });
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
        version: process.env.npm_package_version ?? "0.1.0",
        environment: env.NODE_ENV,
      });
    });

    fastify.setErrorHandler((error, _, reply) => {
      fastify.log.error(error);

      if ((error as any).validation) {
        return reply.status(400).send({
          error: "Validation error",
          details: (error as any).validation,
        });
      }

      if ((error as any).statusCode) {
        return reply.status((error as any).statusCode).send({
          error: (error as any).message,
        });
      }

      return reply.status(500).send({
        error: "Internal server error",
      });
    });

    await queueService.createConsumerGroup();

    const address = await fastify.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    fastify.log.info(`Ollama Turbo Agent backend listening at ${address}`);
    fastify.log.info(`Environment: ${env.NODE_ENV}`);
    fastify.log.info(`Log level: ${env.LOG_LEVEL}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

const shutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully`);
  try {
    await queueService.disconnect();
    await fastify.close();
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, "Error during shutdown");
    process.exit(1);
  }
};

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  fastify.log.error({ reason }, "Unhandled Promise Rejection");
});
process.on("uncaughtException", (err) => {
  fastify.log.error(err, "Uncaught Exception");
  process.exit(1);
});

start();
```