```ts
/*────────────────────────────────────────────────────────────────────────────*/
/*  Ollama Turbo Agent – Backend entry point                                   */
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

/*───────────────────────────────────────*/
/*  Types & Constants                      */
/*───────────────────────────────────────*/
type Signal = NodeJS.Signals;
const SIGNALS = ['SIGINT', 'SIGTERM'] as const satisfies readonly Signal[];

/*───────────────────────────────────────*/
/*  Logger configuration                    */
/*───────────────────────────────────────*/
function createLoggerConfig() {
  const base = { level: env.LOG_LEVEL } as const;

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

/*───────────────────────────────────────*/
/*  Server factory                         */
/*───────────────────────────────────────*/
function buildServer(): FastifyInstance {
  return Fastify({ logger: createLoggerConfig() });
}

/*───────────────────────────────────────*/
/*  Plugin registration                    */
/*───────────────────────────────────────*/
async function registerPlugins(app: FastifyInstance) {
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: env.NODE_ENV === 'development' });
  await app.register(rateLimit, {
    max: env.RATE_LIMIT_MAX,
    timeWindow: env.RATE_LIMIT_WINDOW,
  });
}

/*───────────────────────────────────────*/
/*  Route registration                     */
/*───────────────────────────────────────*/
async function registerRoutes(app: FastifyInstance) {
  await app.register(authRoutes);
  await app.register(webhookRoutes);
  await app.register(jobRoutes);
  app.get('/health', healthHandler);
}

/*───────────────────────────────────────*/
/*  Health‑check handler                   */
/*───────────────────────────────────────*/
function healthHandler(
  _req: FastifyRequest,
  reply: FastifyReply,
) {
  reply.send({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version ?? '0.1.0',
    environment: env.NODE_ENV,
  });
}

/*───────────────────────────────────────*/
/*  Global error handling                  */
/*───────────────────────────────────────*/
function setErrorHandler(app: FastifyInstance) {
  app.setErrorHandler(
    (error: FastifyError, _req: FastifyRequest, reply: FastifyReply) => {
      app.log.error(error);

      // Validation errors (Fastify schema)
      if (error.validation) {
        void reply.status(400).send({
          error: 'Validation error',
          details: error.validation,
        });
        return;
      }

      // Fastify‑thrown HTTP errors (statusCode & message)
      if (error.statusCode && error.message) {
        void reply.status(error.statusCode).send({ error: error.message });
        return;
      }

      // Fallback – unexpected errors
      void reply.status(500).send({ error: 'Internal server error' });
    },
  );
}

/*───────────────────────────────────────*/
/*  Graceful shutdown                      */
/*───────────────────────────────────────*/
async function closeResources(app: FastifyInstance) {
  const tasks = [
    queueService.disconnect(),
    app.close(),
  ];

  const results = await Promise.allSettled(tasks);

  for (const result of results) {
    if (result.status === 'rejected') {
      app.log.error({ err: result.reason }, 'Shutdown task failed');
    }
  }
}

/*───────────────────────────────────────*/
/*  Signal handling                        */
/*───────────────────────────────────────*/
function registerSignalHandlers(app: FastifyInstance) {
  for (const sig of SIGNALS) {
    process.once(sig, async () => {
      app.log.info(`Received ${sig}, commencing graceful shutdown`);
      await closeResources(app);
      process.exit(0);
    });
  }
}

/*───────────────────────────────────────*/
/*  Application bootstrap                  */
/*───────────────────────────────────────*/
async function bootstrap() {
  const app = buildServer();

  await registerPlugins(app);
  await registerRoutes(app);
  setErrorHandler(app);

  // Initialise consumer group before listening
  await queueService.createConsumerGroup();

  const address = await app.listen({
    host: '0.0.0.0',
    port: env.PORT,
  });

  app.log.info(`Ollama Turbo Agent backend listening at ${address}`);
  app.log.info(`Environment: ${env.NODE_ENV}`);
  app.log.info(`Log level: ${env.LOG_LEVEL}`);

  registerSignalHandlers(app);
}

/*───────────────────────────────────────*/
/*  Run entry point                        */
/*───────────────────────────────────────*/
bootstrap().catch((err: unknown) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
```