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
/*                               Server Factory                                */
/* -------------------------------------------------------------------------- */
function createServer(): FastifyInstance {
  const isDev = env.NODE_ENV === "development";

  const logger = {
    level: env.LOG_LEVEL,
    ...(isDev && {
      transport: {
        target: "pino-pretty",
        options: {
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      },
    }),
  };

  return Fastify({ logger });
}

/* -------------------------------------------------------------------------- */
/*                         Plugin Registration (Async)                         */
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
/*                          Route Registration (Async)                         */
/* -------------------------------------------------------------------------- */
async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);

  app.get(
    "/health",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      reply.send({
        status: "healthy",
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version ?? "0.1.0",
        environment: env.NODE_ENV,
      });
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                     Global Error‑Handling Middleware (Sync)                 */
/* -------------------------------------------------------------------------- */
function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      app.log.error(error);

      if (error.validation) {
        return reply.status(400).send({
          error: "Validation error",
          details: error.validation,
        });
      }

      if (error.statusCode && error.message) {
        return reply.status(error.statusCode).send({ error: error.message });
      }

      return reply.status(500).send({ error: "Internal server error" });
    },
  );
}

/* -------------------------------------------------------------------------- */
/*                        Graceful Shutdown Helper (Async)                     */
/* -------------------------------------------------------------------------- */
async function shutdown(app: FastifyInstance): Promise<void> {
  try {
    await queueService.disconnect();
  } finally {
    await app.close();
    process.exit(0);
  }
}

/* -------------------------------------------------------------------------- */
/*                               Server Bootstrap                               */
/* -------------------------------------------------------------------------- */
async function start(): Promise<void> {
  const app = createServer();

  // Fastify hook – called when Fastify initiates a shutdown (e.g., SIGTERM)
  app.addHook("onClose", async () => {
    await queueService.disconnect();
  });

  // Register everything before accepting traffic
  await registerPlugins(app);
  await registerRoutes(app);
  setErrorHandler(app);

  // Background consumer must be ready first
  await queueService.createConsumerGroup();

  const address = await app.listen({
    port: env.PORT,
    host: "0.0.0.0",
  });

  app.log.info(`Ollama Turbo Agent backend listening at ${address}`);
  app.log.info(`Environment: ${env.NODE_ENV}`);
  app.log.info(`Log level: ${env.LOG_LEVEL}`);

  // Signal handling – reuse the same Fastify instance
  const graceful = async (signal: NodeJS.Signals) => {
    app.log.info(`Received ${signal}, commencing graceful shutdown`);
    await shutdown(app);
  };

  ["SIGINT", "SIGTERM"].forEach((sig) => {
    process.once(sig as NodeJS.Signals, () => graceful(sig as NodeJS.Signals));
  });
}

/* -------------------------------------------------------------------------- */
/*                                 Run Entry                                    */
/* -------------------------------------------------------------------------- */
start().catch((err) => {
  // Fallback for unexpected bootstrap errors
  console.error("Failed to start server:", err);
  process.exit(1);
});
```