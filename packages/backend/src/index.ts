```ts
/*─────────────────────────────────────────────────────────────────────────────
 * Ollama Turbo Agent – Backend entry point
 *─────────────────────────────────────────────────────────────────────────────*/

import Fastify, {
  type FastifyInstance,
  type FastifyError,
  type FastifyReply,
  type FastifyRequest,
  type FastifyLoggerOptions,
  type FastifyPluginAsync,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env } from './apps/backend/config/env.js';
import { authRoutes } from './apps/backend/routes/auth.js';
import { jobRoutes } from './apps/backend/routes/jobs.js';
import { webhookRoutes } from './apps/backend/routes/webhooks.js';
import { queueService } from './apps/backend/services/queue.js';

/*─────────────────────────────────────────────────────────────────────────────
 * Types & Constants
 *─────────────────────────────────────────────────────────────────────────────*/

enum TermSignal {
  SIGINT = 'SIGINT',
  SIGTERM = 'SIGTERM',
}

/** Health‑check response payload */
interface HealthResponse {
  status: 'healthy';
  timestamp: string;
  version: string;
  environment: string;
}

/*─────────────────────────────────────────────────────────────────────────────
 * Logger configuration
 *─────────────────────────────────────────────────────────────────────────────*/

function buildLoggerOptions(): FastifyLoggerOptions {
  const base = { level: env.LOG_LEVEL } as const;

  if (env.NODE_ENV === 'development') {
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

  return base;
}

/*─────────────────────────────────────────────────────────────────────────────
 * Fastify instance factory
 *─────────────────────────────────────────────────────────────────────────────*/

function createApp(): FastifyInstance {
  return Fastify({ logger: buildLoggerOptions() });
}

/*─────────────────────────────────────────────────────────────────────────────
 * Plugins
 *─────────────────────────────────────────────────────────────────────────────*/

const registerPlugins: FastifyPluginAsync = async (app) => {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.NODE_ENV === 'development' });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
};

/*─────────────────────────────────────────────────────────────────────────────
 * Routes
 *─────────────────────────────────────────────────────────────────────────────*/

const healthHandler = (
  _req: FastifyRequest,
  reply: FastifyReply,
): void => {
  const payload: HealthResponse = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
  };
  reply.code(200).send(payload);
};

const registerRoutes: FastifyPluginAsync = async (app) => {
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);
  app.get('/health', healthHandler);
};

/*─────────────────────────────────────────────────────────────────────────────
 * Global error handling
 *─────────────────────────────────────────────────────────────────────────────*/

function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      app.log.error(error);

      // Validation errors raised by Fastify schema validation
      if (error.validation) {
        void reply
          .code(400)
          .send({ error: 'Validation error', details: error.validation });
        return;
      }

      // Fastify‑generated HTTP errors
      if (error.statusCode && error.message) {
        void reply.code(error.statusCode).send({ error: error.message });
        return;
      }

      // Fallback – unexpected internal error
      void reply.code(500).send({ error: 'Internal server error' });
    },
  );
}

/*─────────────────────────────────────────────────────────────────────────────
 * Graceful shutdown helpers
 *─────────────────────────────────────────────────────────────────────────────*/

async function closeQueue(app: FastifyInstance): Promise<void> {
  try {
    await queueService.disconnect();
  } catch (e) {
    app.log.error({ err: e }, 'Failed to disconnect queue service');
  }
}

async function closeServer(app: FastifyInstance): Promise<void> {
  try {
    await app.close();
  } catch (e) {
    app.log.error({ err: e }, 'Failed to close Fastify server');
  }
}

/** Run all shutdown tasks, logging any failures. */
async function shutdown(app: FastifyInstance): Promise<void> {
  const tasks = [closeQueue(app), closeServer(app)];
  const results = await Promise.allSettled(tasks);

  for (const result of results) {
    if (result.status === 'rejected') {
      app.log.error({ err: result.reason }, 'Shutdown task failed');
    }
  }
}

/*─────────────────────────────────────────────────────────────────────────────
 * Signal handling
 *─────────────────────────────────────────────────────────────────────────────*/

function bindSignalHandlers(app: FastifyInstance): void {
  const handle = async (signal: TermSignal) => {
    app.log.info(`Received ${signal} – initiating graceful shutdown`);
    await shutdown(app);
    process.exit(0);
  };

  for (const sig of Object.values(TermSignal)) {
    process.once(sig, () => void handle(sig));
  }
}

/*─────────────────────────────────────────────────────────────────────────────
 * Process‑wide error handling
 *─────────────────────────────────────────────────────────────────────────────*/

function bindProcessErrorHandlers(app: FastifyInstance): void {
  process.on('unhandledRejection', (reason) => {
    app.log.error({ err: reason }, 'Unhandled promise rejection');
  });

  process.once('uncaughtException', (err) => {
    app.log.error(err, 'Uncaught exception – terminating');
    void app.close().finally(() => process.exit(1));
  });
}

/*─────────────────────────────────────────────────────────────────────────────
 * Bootstrap
 *─────────────────────────────────────────────────────────────────────────────*/

async function bootstrap(): Promise<void> {
  const app = createApp();

  try {
    await app.register(registerPlugins);
    await app.register(registerRoutes);
    setErrorHandler(app);
    bindProcessErrorHandlers(app);

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
  } catch (error) {
    // Logger may not be ready – fallback to console.
    const logger = (app?.log ?? console) as {
      error: (obj: unknown, msg?: string) => void;
    };
    logger.error({ err: error }, 'Failed to start server');
    process.exit(1);
  }
}

/*─────────────────────────────────────────────────────────────────────────────
 * Run
 *─────────────────────────────────────────────────────────────────────────────*/

await bootstrap();
```