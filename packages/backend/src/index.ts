```ts
import Fastify, { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { env } from "./apps/backend/config/env.js";
import { authRoutes } from "./apps/backend/routes/auth.js";
import { jobRoutes } from "./apps/backend/routes/jobs.js";
import { webhookRoutes } from "./apps/backend/routes/webhooks.js";
import { queueService } from "./apps/backend/services/queue.js";

/* -------------------------------------------------------------------------- */
/*                         Server & Logger Configuration                       */
/* -------------------------------------------------------------------------- */
function createFastifyInstance(): FastifyInstance {
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

  return Fastify({ logger: loggerConfig });
}

/* -------------------------------------------------------------------------- */
/*                               Plugin Registration                           */
/* -------------------------------------------------------------------------- */
async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, {
    origin: env.NODE_ENV === "development" ? true : false,
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
}

/* -------------------------------------------------------------------------- */
/*                               Route Registration                            */
/* -------------------------------------------------------------------------- */
async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);

  app.get(
    "/health",
    async (_: FastifyRequest, reply: FastifyReply) =>
      reply.send({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "0.1.0",
        environment: env.NODE_ENV,
      })
  );
}

/* -------------------------------------------------------------------------- */
/*                              Global Error Handler                           */
/* -------------------------------------------------------------------------- */
function setGlobalErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error: FastifyError, _: FastifyRequest, reply: FastifyReply) => {
    app.log.error(error);

    if (error.validation) {
      return reply.status(400).send({
        error: "Validation error",
        details: error.validation,
      });
    }

    if (error.statusCode) {
      return reply.status(error.statusCode).send({ error: error.message });
    }

    return reply.status(500).send({ error: "Internal server error" });
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Server Startup                               */
/* -------------------------------------------------------------------------- */
async function start(): Promise<void> {
  const app = createFastifyInstance();

  // Graceful shutdown hook
  app.addHook("onClose", async () => {
    await queueService.disconnect();
  });

  try {
    await registerPlugins(app);
    await registerRoutes(app);
    setGlobalErrorHandler(app);

    await queueService.createConsumerGroup();

    const address = await app.listen({ port: env.PORT, host: "0.0.0.0" });

    app.log.info(`Ollama Turbo Agent backend listening at ${address}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    app.log.info(`Log level: ${env.LOG_LEVEL}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/*                               Signal Handling                               */
/* -------------------------------------------------------------------------- */
function handleSignal(signal: NodeJS.Signals): void {
  process.once(signal, async () => {
    console.info(`Received ${signal}, shutting down gracefully`);
    try {
      await queueService.disconnect();
    } catch (e) {
      console.error(e);
    } finally {
      process.exit(0);
    }
  });
}

handleSignal("SIGTERM");
handleSignal("SIGINT");

/* -------------------------------------------------------------------------- */
/*                                   Run                                      */
/* -------------------------------------------------------------------------- */
start();
```