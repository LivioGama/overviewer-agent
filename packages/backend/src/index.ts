```ts
import Fastify, {
  FastifyInstance,
  FastifyError,
  FastifyReply,
  FastifyRequest,
  FastifyLoggerOptions,
} from "fastify";
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
const isDev = env.NODE_ENV === "development";

const loggerConfig: FastifyLoggerOptions = {
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

/* -------------------------------------------------------------------------- */
/* Fastify instance creation                                                  */
/* -------------------------------------------------------------------------- */
function createApp(): FastifyInstance {
  return Fastify({ logger: loggerConfig });
}

/* -------------------------------------------------------------------------- */
/* Plugins registration                                                       */
/* -------------------------------------------------------------------------- */
async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: isDev });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
}

/* -------------------------------------------------------------------------- */
/* Routes registration                                                        */
/* -------------------------------------------------------------------------- */
async function registerRoutes(app: FastifyInstance): Promise<void> {
  // Order matters – keep public routes before protected ones
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);
  app.get("/health", healthHandler);
}

/** Health‑check endpoint */
function healthHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): FastifyReply {
  return reply.send({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    environment: env.NODE_ENV,
  });
}

/* -------------------------------------------------------------------------- */
/* Centralized error handling                                                 */
/* -------------------------------------------------------------------------- */
function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (
      error: FastifyError & { validation?: unknown },
      _req: FastifyRequest,
      reply: FastifyReply,
    ) => {
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
    },
  );
}

/* -------------------------------------------------------------------------- */
/* Graceful shutdown of external resources                                    */
/* -------------------------------------------------------------------------- */
function addShutdownHook(app: FastifyInstance): void {
  app.addHook("onClose", async () => {
    try {
      await queueService.disconnect();
    } catch (err) {
      app.log.error(err, "Failed to disconnect queue service");
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Signal handling                                                            */
/* -------------------------------------------------------------------------- */
async function handleSignal(app: FastifyInstance, signal: NodeJS.Signals) {
  app.log.info(`Received ${signal} – shutting down`);
  try {
    await app.close();
    process.exit(0);
  } catch (err) {
    app.log.error(err, "Error during graceful shutdown");
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/* Application bootstrap                                                     */
/* -------------------------------------------------------------------------- */
async function start(): Promise<void> {
  const app = createApp();

  setErrorHandler(app);
  addShutdownHook(app);

  try {
    await Promise.all([
      registerPlugins(app),
      registerRoutes(app),
      queueService.createConsumerGroup(),
    ]);

    const address = await app.listen({ host: "0.0.0.0", port: env.PORT });
    app.log.info(`Server listening at ${address}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    app.log.info(`Log level: ${env.LOG_LEVEL}`);
  } catch (err) {
    app.log.error(err, "Failed to start application");
    process.exit(1);
  }

  // Process termination signals
  process.once("SIGTERM", () => void handleSignal(app, "SIGTERM"));
  process.once("SIGINT", () => void handleSignal(app, "SIGINT"));
}

/* -------------------------------------------------------------------------- */
/* Global promise/exception handling                                          */
/* -------------------------------------------------------------------------- */
process.on("unhandledRejection", (reason) => {
  console.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  console.error(err, "Uncaught exception");
  process.exit(1);
});

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */
void start();
```