```ts
import Fastify, { FastifyInstance, FastifyError } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { env } from "./config/env";
import { authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";
import { webhookRoutes } from "./routes/webhooks";
import { queueService } from "./services/queue";

/* -------------------------------------------------------------------------- */
/* Logger configuration                                                       */
/* -------------------------------------------------------------------------- */
const loggerConfig =
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
    : { level: env.LOG_LEVEL };

/* -------------------------------------------------------------------------- */
/* Fastify instance creation                                                  */
/* -------------------------------------------------------------------------- */
const fastify: FastifyInstance = Fastify({ logger: loggerConfig });

/* -------------------------------------------------------------------------- */
/* Plugin registration                                                         */
/* -------------------------------------------------------------------------- */
async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, {
    origin: env.NODE_ENV === "development", // true in dev, false otherwise
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
}

/* -------------------------------------------------------------------------- */
/* Route registration                                                          */
/* -------------------------------------------------------------------------- */
async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);

  app.get("/health", async (_, reply) => {
    return reply.send({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? "0.1.0",
      environment: env.NODE_ENV,
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Centralised error handling                                                 */
/* -------------------------------------------------------------------------- */
fastify.setErrorHandler((error: FastifyError, _request, reply) => {
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

/* -------------------------------------------------------------------------- */
/* Graceful shutdown hook for external resources                              */
/* -------------------------------------------------------------------------- */
fastify.addHook("onClose", async () => {
  await queueService.disconnect();
});

/* -------------------------------------------------------------------------- */
/* Application start                                                          */
/* -------------------------------------------------------------------------- */
async function start(): Promise<void> {
  try {
    await registerPlugins(fastify);
    await registerRoutes(fastify);

    await queueService.createConsumerGroup();

    const address = await fastify.listen({
      host: "0.0.0.0",
      port: env.PORT,
    });

    fastify.log.info(`Ollama Turbo Agent backend listening at ${address}`);
    fastify.log.info(`Environment: ${env.NODE_ENV}`);
    fastify.log.info(`Log level: ${env.LOG_LEVEL}`);
  } catch (err) {
    fastify.log.error(err, "Failed to start application");
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/* Process signal handling                                                    */
/* -------------------------------------------------------------------------- */
function handleSignal(signal: NodeJS.Signals): void {
  fastify.log.info(`Received ${signal}, shutting down gracefully`);
  // Fastify will trigger `onClose` hook where we disconnect from the queue
  fastify.close().then(() => process.exit(0)).catch((e) => {
    fastify.log.error(e, "Error during shutdown");
    process.exit(1);
  });
}

process.once("SIGTERM", () => handleSignal("SIGTERM"));
process.once("SIGINT", () => handleSignal("SIGINT"));

process.on("unhandledRejection", (reason) => {
  fastify.log.error({ reason }, "Unhandled Promise Rejection");
});

process.on("uncaughtException", (err) => {
  fastify.log.error(err, "Uncaught Exception");
  process.exit(1);
});

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */
void start();
```