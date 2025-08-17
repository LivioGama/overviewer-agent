```ts
/*───────────────────────────────────────────────────────────────
 * Ollama Turbo Agent – Backend entry point
 *───────────────────────────────────────────────────────────────*/

import Fastify, {
  FastifyInstance,
  FastifyError,
  FastifyReply,
  FastifyRequest,
  FastifyLoggerOptions,
  FastifyPluginAsync,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env } from './apps/backend/config/env.js';
import { authRoutes } from './apps/backend/routes/auth.js';
import { jobRoutes } from './apps/backend/routes/jobs.js';
import { webhookRoutes } from './apps/backend/routes/webhooks.js';
import { queueService } from './apps/backend/services/queue.js';

/*───────────────────────────────────────────────────────────────
 * Types & Constants
 *───────────────────────────────────────────────────────────────*/

enum TermSignal {
  SIGINT = 'SIGINT',
  SIGTERM = 'SIGTERM',
}

/** Payload for the health‑check endpoint. */
interface HealthResponse {
  status: 'healthy';
  timestamp: string;
  version: string;
  environment: string;
}

/*───────────────────────────────────────────────────────────────
 * Logger configuration
 *───────────────────────────────────────────────────────────────*/

function buildLoggerOptions(): FastifyLoggerOptions {
  const base = { level: env.LOG_LEVEL } as const;

  // Enable pretty printing only in development.
  return env.NODE_ENV === 'development'
    ? {
        ...base,
        transport: {
          target: 'pino-pretty',
          options: {
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname',
          },
        },
      }
    : base;
}

/*───────────────────────────────────────────────────────────────
 * Fastify application factory
 *───────────────────────────────────────────────────────────────*/

function createApp(): FastifyInstance {
  return Fastify({ logger: buildLoggerOptions() });
}

/*───────────────────────────────────────────────────────────────
 * Plugins registration
 *───────────────────────────────────────────────────────────────*/

const registerPlugins: FastifyPluginAsync = async (app) => {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.NODE_ENV === 'development' });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
};

/*───────────────────────────────────────────────────────────────
 * Routes registration
 *───────────────────────────────────────────────────────────────*/

async function healthHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const payload: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
  };
  reply.code(200).send(payload);
}

const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);
  app.get('/health', healthHandler);
};

/*───────────────────────────────────────────────────────────────
 * Centralised error handling
 *───────────────────────────────────────────────────────────────*/

function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      app.log.error(error);

      // Validation errors from Fastify schema
      if (error.validation) {
        reply.status(400).send({
          error: 'Validation error',
          details: error.validation,
        });
        return;
      }

      // Any FastifyError that carries a statusCode
      if ('statusCode' in error && typeof error.statusCode === 'number') {
        reply.status(error.statusCode).send({ error: error.message });
        return;
      }

      // Fallback – unexpected error
      reply.status(500).send({ error: 'Internal server error' });
    },
  );
}

/*───────────────────────────────────────────────────────────────
 * Graceful shutdown utilities
 *───────────────────────────────────────────────────────────────*/

async function closeQueue(app: FastifyInstance): Promise<void> {
  try {
    await queueService.disconnect();
  } catch (e) {
    app.log.error({ err: e }, 'Failed to disconnect queue service');
  }
}

/** Register an `onClose` hook that takes care of background resources. */
function attachCloseHook(app: FastifyInstance): void {
  app.addHook('onClose', async () => {
    await closeQueue(app);
  });
}

/*───────────────────────────────────────────────────────────────
 * Process signal handling
 *───────────────────────────────────────────────────────────────*/

function bindSignalHandlers(app: FastifyInstance): void {
  const shutdown = async (signal: TermSignal) => {
    app.log.info(`Received ${signal} – shutting down gracefully`);
    await app.close(); // Triggers the `onClose` hook
    process.exit(0);
  };

  // `once` ensures the handler is executed only for the first signal.
  for (const signal of Object.values(TermSignal)) {
    process.once(signal, () => void shutdown(signal));
  }
}

/*───────────────────────────────────────────────────────────────
 * Process‑wide error handling
 *───────────────────────────────────────────────────────────────*/

function bindProcessErrorHandlers(app: FastifyInstance): void {
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.once('uncaughtException', (err) => {
    app.log.error(err, 'Uncaught exception – terminating');
    void app.close().finally(() => process.exit(1));
  });
}

/*───────────────────────────────────────────────────────────────
 * Bootstrap
 *───────────────────────────────────────────────────────────────*/

async function bootstrap(): Promise<void> {
  const app = createApp();

  try {
    // Register core plugins and routes
    await app.register(registerPlugins);
    await app.register(registerRoutes);

    // Global error handling & lifecycle hooks
    setErrorHandler(app);
    attachCloseHook(app);
    bindProcessErrorHandlers(app);

    // Initialise background services before the server starts listening
    await queueService.createConsumerGroup();

    await app.ready();

    const address = await app.listen({
      host: '0.0.0.0',
      port: env.PORT,
    });

    app.log.info(`Ollama Turbo Agent backend listening at ${address}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    app.log.info(`Log level: ${env.LOG_LEVEL}`);

    bindSignalHandlers(app);
  } catch (err) {
    // Fallback to console if logger hasn't been initialised.
    const logger = (app?.log ?? console) as {
      error: (obj: unknown, msg?: string) => void;
    };
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

/*───────────────────────────────────────────────────────────────
 * Run
 *───────────────────────────────────────────────────────────────*/

await bootstrap();
```