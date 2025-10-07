import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { env } from "./config/env.js";
import { authRoutes } from "./routes/auth.js";
import { jobRoutes } from "./routes/jobs.js";
import { webhookRoutes } from "./routes/webhooks.js";
import { queueService } from "./services/queue.js";

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
    await fastify.listen({ port: env.PORT, host: "0.0.0.0" });
    console.log(`Server listening on ${env.PORT}`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();