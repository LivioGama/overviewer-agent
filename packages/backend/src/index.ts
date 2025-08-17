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

enum Signal {
  SIGINT = 'SIGINT',
  SIGTERM = 'SIGTERM',
}
type HealthResponse = {
  status: 'healthy';
  timestamp: string;
  version: string;
  environment: string;
};

/*─────────────────────────────────────────────────────────────────────────────
 * Logger configuration
 *─────────────────────────────────────────────────────────────────────────────*/

function createLoggerConfig(): FastifyLoggerOptions {
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

function makeApp(): FastifyInstance {
  return Fastify({ logger: createLoggerConfig() });
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

      if (error.validation) {
        void reply.code(400).send({
          error: 'Validation error',
          details: error.validation,
        });
        return;
      }

      if (error.statusCode && error.message) {
        void reply.code(error.statusCode).send({ error: error.message });
        return;
      }

      void reply.code(500).send({ error: 'Internal server error' });
    },
  );
}

/*─────────────────────────────────────────────────────────────────────────────
 * Graceful shutdown
 *─────────────────────────────────────────────────────────────────────────────*/

async function shutdown(app: FastifyInstance): Promise<void> {
  const tasks = [
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

/*─────────────────────────────────────────────────────────────────────────────
 * Signal handling
 *─────────────────────────────────────────────────────────────────────────────*/

function handleSignals(app: FastifyInstance): void {
  const handler = async (signal: Signal) => {
    app.log.info(`Received ${signal} – starting graceful shutdown`);
    await shutdown(app);
    process.exit(0);
  };

  for (const sig of Object.values(Signal)) {
    process.once(sig, () => void handler(sig));
  }
}

/*─────────────────────────────────────────────────────────────────────────────
 * Process‑wide error handling
 *─────────────────────────────────────────────────────────────────────────────*/

function handleProcessErrors(app: FastifyInstance): void {
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
  const app = makeApp();

  try {
    await app.register(registerPlugins);
    await app.register(registerRoutes);
    setErrorHandler(app);
    handleProcessErrors(app);
    await queueService.createConsumerGroup();

    await app.ready();

    const address = await app.listen({
      host: '0.0.0.0',
      port: env.PORT,
    });

    app.log.info(`Ollama Turbo Agent backend listening at ${address}`);
    app.log.info(`Environment: ${env.NODE_ENV}`);
    app.log.info(`Log level: ${env.LOG_LEVEL}`);

    handleSignals(app);
  } catch (err) {
    // Fastify logger may not be available yet – fallback to console.
    const logger = (app?.log ?? console) as {
      error: (obj: unknown, msg?: string) => void;
    };
    logger.error({ err }, 'Failed to start server');
    process.exit(1);
  }
}

/*─────────────────────────────────────────────────────────────────────────────
 * Run
 *─────────────────────────────────────────────────────────────────────────────*/

void (async () => {
  await bootstrap();
})();
```