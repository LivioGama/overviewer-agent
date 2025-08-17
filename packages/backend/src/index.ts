```ts
/*────────────────────────────────────────────────────────────────────────────*/
/*  Server entry‑point for the Ollama Turbo Agent backend                      */
/*────────────────────────────────────────────────────────────────────────────*/

import Fastify, {
  FastifyInstance,
  FastifyError,
  FastifyReply,
  FastifyRequest,
} from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env } from './apps/backend/config/env.js';
import { authRoutes } from './apps/backend/routes/auth.js';
import { jobRoutes } from './apps/backend/routes/jobs.js';
import { webhookRoutes } from './apps/backend/routes/webhooks.js';
import { queueService } from './apps/backend/services/queue.js';

type Signal = NodeJS.Signals;

/*───────────────────────────────────────*/
/*  Server factory                       */
/*───────────────────────────────────────*/
function createServer(): FastifyInstance {
  const isDev = env.NODE_ENV === 'development';

  const logger = {
    level: env.LOG_LEVEL,
    ...(isDev && {
      transport: {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss Z',
          ignore: 'pid,hostname',
        },
      },
    }),
  };

  return Fastify({ logger });
}

/*───────────────────────────────────────*/
/*  Plugin registration (async)           */
/*───────────────────────────────────────*/
async function registerPlugins(app: FastifyInstance): Promise<void> {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.NODE_ENV === 'development' });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
}

/*───────────────────────────────────────*/
/*  Route registration (async)            */
/*───────────────────────────────────────*/
async function registerRoutes(app: FastifyInstance): Promise<void> {
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);

  app.get('/health', healthHandler);
}

/** Health‑check endpoint */
async function healthHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  reply.send({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
  });
}

/*───────────────────────────────────────*/
/*  Global error handler (sync)           */
/*───────────────────────────────────────*/
function setErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      app.log.error(error);

      if (error.validation) {
        void reply.status(400).send({
          error: 'Validation error',
          details: error.validation,
        });
        return;
      }

      if (error.statusCode && error.message) {
        void reply.status(error.statusCode).send({ error: error.message });
        return;
      }

      void reply.status(500).send({ error: 'Internal server error' });
    },
  );
}

/*───────────────────────────────────────*/
/*  Graceful shutdown helpers             */
/*───────────────────────────────────────*/
async function closeResources(app: FastifyInstance): Promise<void> {
  await Promise.allSettled([queueService.disconnect(), app.close()]);
}

/*───────────────────────────────────────*/
/*  Application bootstrap                 */
/*───────────────────────────────────────*/
async function bootstrap(): Promise<void> {
  const app = createServer();

  // Ensure queue is closed when Fastify shuts down
  app.addHook('onClose', async () => {
    await queueService.disconnect();
  });

  await registerPlugins(app);
  await registerRoutes(app);
  setErrorHandler(app);

  await queueService.createConsumerGroup();

  const address = await app.listen({
    host: '0.0.0.0',
    port: env.PORT,
  });

  app.log.info(`Ollama Turbo Agent backend listening at ${address}`);
  app.log.info(`Environment: ${env.NODE_ENV}`);
  app.log.info(`Log level: ${env.LOG_LEVEL}`);

  // Signal handling
  const handleSignal = async (signal: Signal): Promise<void> => {
    app.log.info(`Received ${signal}, commencing graceful shutdown`);
    await closeResources(app);
    process.exit(0);
  };

  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sig, () => handleSignal(sig));
  }
}

/*───────────────────────────────────────*/
/*  Run entry point                       */
/*───────────────────────────────────────*/
bootstrap().catch((err: unknown) => {
  // Fatal startup error
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
```