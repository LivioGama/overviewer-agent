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

import { env } from "./config/env";
import { authRoutes } from "./routes/auth";
import { jobRoutes } from "./routes/jobs";
import { webhookRoutes } from "./routes/webhooks";
import { queueService } from "./services/queue";

/* -------------------------------------------------------------------------- */
/* Logger configuration                                                       */
/* -------------------------------------------------------------------------- */
const isDev = env.NODE_ENV === "development";

const loggerConfig = {
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
} as const;

/* -------------------------------------------------------------------------- */
/* Fastify instance creation                                                  */
/* -------------------------------------------------------------------------- */
const fastify: FastifyInstance = Fastify({ logger: loggerConfig });

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
  await Promise.all([
    app.register(authRoutes),
    app.register(webhookRoutes),
    app.register(jobRoutes),
  ]);

  app.get(
    "/health",
    async (_req: FastifyRequest, reply: FastifyReply) => {
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
/* Centralized error handling                                                 */
/* -------------------------------------------------------------------------- */
fastify.setErrorHandler(
  (error: FastifyError & { validation?: unknown }, _req: FastifyRequest, reply: FastifyReply) => {
    fastify.log.error(error);

    if (error.validation) {
      reply.status(400).send({
        error: "Validation error",
        details: error.validation,
      });
      return;
    }

    if (error.statusCode) {
      reply.status(error.statusCode).send({ error: error.message });
      return;
    }

    reply.status(500).send({ error: "Internal server error" });
  }
);

/* -------------------------------------------------------------------------- */
/* Graceful shutdown of external resources                                    */
/* -------------------------------------------------------------------------- */
fastify.addHook("onClose", async () => {
  try {
    await queueService.disconnect();
  } catch (err) {
    fastify.log.error(err, "Failed to disconnect queue service");
  }
});

/* -------------------------------------------------------------------------- */
/* Application bootstrap                                                     */
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

    fastify.log.info(`Server listening at ${address}`);
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
async function handleSignal(signal: NodeJS.Signals): Promise<void> {
  fastify.log.info(`Received ${signal} – shutting down`);
  try {
    await fastify.close();
    process.exit(0);
  } catch (err) {
    fastify.log.error(err, "Error during graceful shutdown");
    process.exit(1);
  }
}

/* -------------------------------------------------------------------------- */
/* Global error handling                                                      */
/* -------------------------------------------------------------------------- */
process.on("unhandledRejection", (reason) => {
  fastify.log.error({ reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  fastify.log.error(err, "Uncaught exception");
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