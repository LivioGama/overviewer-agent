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
const app: FastifyInstance = Fastify({ logger: loggerConfig });

/* -------------------------------------------------------------------------- */
/* Plugins registration                                                       */
/* -------------------------------------------------------------------------- */
async function registerPlugins(server: FastifyInstance): Promise<void> {
  try {
    await server.register(helmet, { contentSecurityPolicy: false });
    await server.register(cors, { origin: isDev });
    await server.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW,
    });
  } catch (err) {
    server.log.error(err, "Failed to register plugins");
    throw err;
  }
}

/* -------------------------------------------------------------------------- */
/* Routes registration                                                        */
/* -------------------------------------------------------------------------- */
async function registerRoutes(server: FastifyInstance): Promise<void> {
  // Register route collections sequentially to preserve encapsulation order
  await server.register(authRoutes);
  await server.register(webhookRoutes);
  await server.register(jobRoutes);

  server.get("/health", healthHandler);
}

/** Health‑check endpoint */
function healthHandler(
  _req: FastifyRequest,
  reply: FastifyReply
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

/* -------------------------------------------------------------------------- */
/* Graceful shutdown of external resources                                    */
/* -------------------------------------------------------------------------- */
app.addHook("onClose", async () => {
  try {
    await queueService.disconnect();
  } catch (err) {
    app.log.error(err, "Failed to disconnect queue service");
  }
});

/* -------------------------------------------------------------------------- */
/* Application bootstrap                                                     */
/* -------------------------------------------------------------------------- */
async function start(): Promise<void> {
  try {
    await registerPlugins(app);
    await registerRoutes(app);
    await queueService.createConsumerGroup();

    const address = await app.listen({
      host: "0.0.0.0",
      port: env.PORT,
    });

    app.log.info(`Server listening at ${address}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    app.log.info(`Log level: ${env.LOG_LEVEL}`);
  } catch (err) {
    app.log.error(err, "Failed to start application");
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/* Process signal handling                                                    */
/* -------------------------------------------------------------------------- */
async function handleSignal(signal: NodeJS.Signals): Promise<void> {
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
/* Global error handling                                                      */
/* -------------------------------------------------------------------------- */
process.on("unhandledRejection", (reason) => {
  app.log.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  app.log.error(err, "Uncaught exception");
  process.exit(1);
});

/* -------------------------------------------------------------------------- */
/* Signal listeners                                                            */
/* -------------------------------------------------------------------------- */
process.once("SIGTERM", () => void handleSignal("SIGTERM"));
process.once("SIGINT", () => void handleSignal("SIGINT"));

/* -------------------------------------------------------------------------- */
/* Entry point                                                                */
/* -------------------------------------------------------------------------- */
void start();
```