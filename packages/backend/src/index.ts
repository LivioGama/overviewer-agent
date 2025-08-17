```ts
/* ─────────────────────────────────────────────────────────────────────────────
 * Ollama Turbo Agent – Backend entry point
 * ───────────────────────────────────────────────────────────────────────────── */

import Fastify, {
  type FastifyInstance,
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
  type FastifyLoggerOptions,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env } from './apps/backend/config/env.js';
import { authRoutes } from './apps/backend/routes/auth.js';
import { jobRoutes } from './apps/backend/routes/jobs.js';
import { webhookRoutes } from './apps/backend/routes/webhooks.js';
import { queueService } from './apps/backend/services/queue.js';

/* ─────────────────────────────────────────────────────────────────────────────
 * Types & Constants
 * ───────────────────────────────────────────────────────────────────────────── */

const SIGNALS = ['SIGINT', 'SIGTERM'] as const;
type Signal = (typeof SIGNALS)[number];

/* ─────────────────────────────────────────────────────────────────────────────
 * Logger configuration
 * ───────────────────────────────────────────────────────────────────────────── */

function createLoggerConfig(): FastifyLoggerOptions {
  const base = { level: env.LOG_LEVEL } as const;

  if (env.NODE_ENV !== 'development') return base;

  return {
    ...base,
    transport: {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
  };
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Server factory
 * ───────────────────────────────────────────────────────────────────────────── */

function buildServer(): FastifyInstance {
  return Fastify({ logger: createLoggerConfig() });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Plugin registration
 * ───────────────────────────────────────────────────────────────────────────── */

async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.NODE_ENV === 'development' });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Route registration
 * ───────────────────────────────────────────────────────────────────────────── */

async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);
  app.get('/health', healthHandler);
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Health‑check handler
 * ───────────────────────────────────────────────────────────────────────────── */

function healthHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): void {
  reply.send({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Global error handling
 * ───────────────────────────────────────────────────────────────────────────── */

function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      app.log.error(error);

      // Fastify schema validation errors
      if (error.validation) {
        void reply
          .status(400)
          .send({ error: 'Validation error', details: error.validation });
        return;
      }

      // Fastify‑generated HTTP errors (e.g., NotFound, BadRequest)
      if (error.statusCode && error.message) {
        void reply.status(error.statusCode).send({ error: error.message });
        return;
      }

      // Unexpected errors
      void reply.status(500).send({ error: 'Internal server error' });
    },
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Graceful shutdown helpers
 * ───────────────────────────────────────────────────────────────────────────── */

async function closeResources(app: FastifyInstance): Promise<void> {
  const tasks: Promise<unknown>[] = [
    queueService.disconnect(),
    app.close(),
  ];

  const results = await Promise.allSettled(tasks);

  for (const result of results) {
    if (result.status === 'rejected') {
      app.log.error(
        { err: result.reason },
        'Shutdown task failed',
      );
    }
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Signal handling
 * ───────────────────────────────────────────────────────────────────────────── */

function registerSignalHandlers(app: FastifyInstance): void {
  for (const sig of SIGNALS) {
    process.once(sig as Signal, async () => {
      app.log.info(`Received ${sig}, initiating graceful shutdown`);
      await closeResources(app);
      process.exit(0);
    });
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Uncaught errors handling (process‑wide)
 * ───────────────────────────────────────────────────────────────────────────── */

function registerProcessErrorHandlers(app: FastifyInstance): void {
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled Promise rejection');
  });

  process.on('uncaughtException', (err) => {
    app.log.error(err, 'Uncaught exception');
    // Allow the process to exit after logging.
    process.exit(1);
  });
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Application bootstrap
 * ───────────────────────────────────────────────────────────────────────────── */

async function bootstrap(): Promise<void> {
  const app = buildServer();

  try {
    await registerPlugins(app);
    await registerRoutes(app);
    setErrorHandler(app);
    registerProcessErrorHandlers(app);

    // Initialise queue consumer before the HTTP server starts listening
    await queueService.createConsumerGroup();

    await app.ready();

    const address = await app.listen({
      host: '0.0.0.0',
      port: env.PORT,
    });

    app.log.info(`Ollama Turbo Agent backend listening at ${address}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    app.log.info(`Log level: ${env.LOG_LEVEL}`);

    registerSignalHandlers(app);
  } catch (err) {
    // Fastify logger may not be initialised; fallback to console
    const logger = (app?.log ?? console) as {
      error: (obj: unknown, msg?: string) => void;
    };
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

/* ─────────────────────────────────────────────────────────────────────────────
 * Run entry point
 * ───────────────────────────────────────────────────────────────────────────── */

void bootstrap();
```