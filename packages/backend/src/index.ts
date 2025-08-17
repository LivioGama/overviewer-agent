```ts
import Fastify, {
  FastifyInstance,
  FastifyError,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";

import { env } from "./apps/backend/config/env.js";
import { authRoutes } from "./apps/backend/routes/auth.js";
import { jobRoutes } from "./apps/backend/routes/jobs.js";
import { webhookRoutes } from "./apps/backend/routes/webhooks.js";
import { queueService } from "./apps/backend/services/queue.js";

/* -------------------------------------------------------------------------- */
/*                              Server Factory                                 */
/* -------------------------------------------------------------------------- */
function buildServer(): FastifyInstance {
  const isDev = env.NODE_ENV === "development";

  const logger = isDev
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

  return Fastify({ logger });
}

/* -------------------------------------------------------------------------- */
/*                              Plugin Registration                             */
/* -------------------------------------------------------------------------- */
async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: false });

  await app.register(cors, {
    origin: env.NODE_ENV === "development",
  });

  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
}

/* -------------------------------------------------------------------------- */
/*                              Route Registration                              */
/* -------------------------------------------------------------------------- */
async function registerRoutes(app: FastifyInstance): Promise<void> {
  await Promise.all([
    app.register(authRoutes),
    app.register(webhookRoutes),
    app.register(jobRoutes),
  ]);

  // Simple health‑check endpoint
  app.get(
    "/health",
    async (_: FastifyRequest, reply: FastifyReply) => {
      reply.send({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "0.1.0",
        environment: env.NODE_ENV,
      });
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                        Global Error Handling Middleware                     */
/* -------------------------------------------------------------------------- */
function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      app.log.error(error);

      // Validation errors are thrown by Fastify schema validation
      if (error.validation) {
        return reply
          .status(400)
          .send({ error: "Validation error", details: error.validation });
      }

      // Respect explicit status codes (e.g., from auth libraries)
      if (error.statusCode && error.message) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      // Fallback for unexpected errors
      return reply.status(500).send({ error: "Internal server error" });
    }
  );
}

/* -------------------------------------------------------------------------- */
/*                              Graceful Shutdown                               */
/* -------------------------------------------------------------------------- */
async function gracefulShutdown(app: FastifyInstance): Promise<void> {
  try {
    await queueService.disconnect();
  } finally {
    await app.close();
    process.exit(0);
  }
}

/* -------------------------------------------------------------------------- */
/*                              Server Bootstrap                                 */
/* -------------------------------------------------------------------------- */
async function start(): Promise<void> {
  const app = buildServer();

  // Close hook for Fastify‑initiated shutdowns (e.g., SIGTERM)
  app.addHook("onClose", async () => queueService.disconnect());

  try {
    await registerPlugins(app);
    await registerRoutes(app);
    setErrorHandler(app);

    // Initialise background consumer before accepting traffic
    await queueService.createConsumerGroup();

    const address = await app.listen({
      port: env.PORT,
      host: "0.0.0.0",
    });

    app.log.info(`Ollama Turbo Agent backend listening at ${address}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    app.log.info(`Log level: ${env.LOG_LEVEL}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/*                                Signal Handling                               */
/* -------------------------------------------------------------------------- */
["SIGINT", "SIGTERM"].forEach((sig) => {
  process.once(sig as NodeJS.Signals, async () => {
    const app = Fastify(); // a minimal instance to log shutdown info
    app.log.info(`Received ${sig}, commencing graceful shutdown`);
    await gracefulShutdown(app);
  });
});

/* -------------------------------------------------------------------------- */
/*                                   Run                                        */
/* -------------------------------------------------------------------------- */
await start();
```