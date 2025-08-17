```ts
import Fastify, {
  FastifyInstance,
  FastifyError,
  FastifyRequest,
  FastifyReply,
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
const isDevelopment = env.NODE_ENV === "development";

const loggerConfig: FastifyLoggerOptions = {
  level: env.LOG_LEVEL,
  ...(isDevelopment && {
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
/* Application factory                                                        */
/* -------------------------------------------------------------------------- */
const createApp = (): FastifyInstance => Fastify({ logger: loggerConfig });

/* -------------------------------------------------------------------------- */
/* Plugins registration                                                       */
/* -------------------------------------------------------------------------- */
const registerPlugins = async (app: FastifyInstance): Promise<void> => {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: isDevelopment });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
};

/* -------------------------------------------------------------------------- */
/* Routes registration                                                        */
/* -------------------------------------------------------------------------- */
const registerRoutes = async (app: FastifyInstance): Promise<void> => {
  // Public routes first
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);

  // Health‑check endpoint
  app.get("/health", healthHandler);
};

/** Health‑check handler */
const healthHandler = (
  _req: FastifyRequest,
  reply: FastifyReply
): FastifyReply => {
  return reply.send({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    environment: env.NODE_ENV,
  });
};

/* -------------------------------------------------------------------------- */
/* Centralised error handling                                                */
/* -------------------------------------------------------------------------- */
const setErrorHandler = (app: FastifyInstance): void => {
  app.setErrorHandler(
    (
      error: FastifyError & { validation?: unknown },
      _req: FastifyRequest,
      reply: FastifyReply
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
    }
  );
};

/* -------------------------------------------------------------------------- */
/* Graceful shutdown of external resources                                    */
/* -------------------------------------------------------------------------- */
const addShutdownHook = (app: FastifyInstance): void => {
  app.addHook("onClose", async () => {
    try {
      await queueService.disconnect();
    } catch (e) {
      app.log.error(e, "Failed to disconnect queue service");
    }
  });
};

/* -------------------------------------------------------------------------- */
/* Signal handling                                                            */
/* -------------------------------------------------------------------------- */
const handleSignal = async (
  app: FastifyInstance,
  signal: NodeJS.Signals
): Promise<void> => {
  app.log.info(`Received ${signal} – shutting down`);
  try {
    await app.close();
    process.exit(0);
  } catch (e) {
    app.log.error(e, "Error during graceful shutdown");
    process.exit(1);
  }
};

/* -------------------------------------------------------------------------- */
/* Process termination signal registration                                     */
/* -------------------------------------------------------------------------- */
const registerProcessSignals = (app: FastifyInstance): void => {
  process.once("SIGTERM", () => void handleSignal(app, "SIGTERM"));
  process.once("SIGINT", () => void handleSignal(app, "SIGINT"));
};

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
/* Application bootstrap                                                     */
/* -------------------------------------------------------------------------- */
const start = async (): Promise<void> => {
  const app = createApp();

  setErrorHandler(app);
  addShutdownHook(app);

  try {
    // Plugins must be registered before routes
    await registerPlugins(app);
    await registerRoutes(app);
    await queueService.createConsumerGroup();

    const address = await app.listen({ host: "0.0.0.0", port: env.PORT });
    app.log.info(`Server listening at ${address}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    app.log.info(`Log level: ${env.LOG_LEVEL}`);

    registerProcessSignals(app);
  } catch (e) {
    app.log.error(e, "Failed to start application");
    process.exit(1);
  }
};

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */
void start();
```