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
/* Application factory & bootstrap                                            */
/* -------------------------------------------------------------------------- */
const createApp = async (): Promise<FastifyInstance> => {
  const app = Fastify({ logger: loggerConfig });

  // ------------------------------------------------------------------------
  // Plugins
  // ------------------------------------------------------------------------
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: isDevelopment });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });

  // ------------------------------------------------------------------------
  // Routes
  // ------------------------------------------------------------------------
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);
  app.get("/health", healthHandler);

  // ------------------------------------------------------------------------
  // Error handling
  // ------------------------------------------------------------------------
  app.setErrorHandler(
    (
      err: FastifyError & { validation?: unknown },
      _req: FastifyRequest,
      reply: FastifyReply
    ) => {
      app.log.error(err);
      if (err.validation) {
        return reply.status(400).send({
          error: "Validation error",
          details: err.validation,
        });
      }
      const status = err.statusCode ?? 500;
      const message = status === 500 ? "Internal server error" : err.message;
      return reply.status(status).send({ error: message });
    }
  );

  // ------------------------------------------------------------------------
  // Graceful shutdown
  // ------------------------------------------------------------------------
  app.addHook("onClose", async () => {
    try {
      await queueService.disconnect();
    } catch (e) {
      app.log.error(e, "Failed to disconnect queue service");
    }
  });

  // ------------------------------------------------------------------------
  // External resources
  // ------------------------------------------------------------------------
  await queueService.createConsumerGroup();

  return app;
};

/* -------------------------------------------------------------------------- */
/* Health‑check handler                                                       */
/* -------------------------------------------------------------------------- */
type HealthResponse = {
  status: "healthy";
  timestamp: string;
  version: string;
  environment: string;
};

const healthHandler = (
  _req: FastifyRequest,
  reply: FastifyReply
): FastifyReply<HealthResponse> =>
  reply.send({
    status: "healthy",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? "0.1.0",
    environment: env.NODE_ENV,
  });

/* -------------------------------------------------------------------------- */
/* Signal handling                                                            */
/* -------------------------------------------------------------------------- */
const handleSignal = async (app: FastifyInstance, signal: NodeJS.Signals) => {
  app.log.info(`Received ${signal} – shutting down`);
  try {
    await app.close();
    process.exit(0);
  } catch (e) {
    app.log.error(e, "Error during graceful shutdown");
    process.exit(1);
  }
};

process.once("SIGTERM", () => void handleSignal(server, "SIGTERM"));
process.once("SIGINT", () => void handleSignal(server, "SIGINT"));

/* -------------------------------------------------------------------------- */
/* Global unhandled rejections / exceptions                                    */
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
const start = async () => {
  try {
    const server = await createApp();

    const address = await server.listen({
      host: "0.0.0.0",
      port: env.PORT,
    });

    server.log.info(`Server listening at ${address}`);
    server.log.info(`Environment: ${env.NODE_ENV}`);
    server.log.info(`Log level: ${env.LOG_LEVEL}`);
  } catch (err) {
    console.error(err, "Failed to start application");
    process.exit(1);
  }
};

void start();
```