import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { env } from './config/env.js'
import { jobRoutes } from './routes/jobs.js'
import { webhookRoutes } from './routes/webhooks.js'
import { queueService } from './services/queue.js'

const fastify = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    transport: env.NODE_ENV === 'development' ? {
      target: 'pino-pretty',
      options: {
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname'
      }
    } : undefined
  }
})

const start = async () => {
  try {
    await fastify.register(helmet, {
      contentSecurityPolicy: false
    })

    await fastify.register(cors, {
      origin: env.NODE_ENV === 'development' ? true : false
    })

    await fastify.register(rateLimit, {
      max: env.RATE_LIMIT_MAX,
      timeWindow: env.RATE_LIMIT_WINDOW
    })

    await fastify.register(webhookRoutes)
    await fastify.register(jobRoutes)

    fastify.get('/health', async (request, reply) => {
      return reply.send({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '0.1.0',
        environment: env.NODE_ENV
      })
    })

    fastify.setErrorHandler((error, request, reply) => {
      fastify.log.error(error)
      
      if (error.validation) {
        return reply.status(400).send({
          error: 'Validation error',
          details: error.validation
        })
      }
      
      if (error.statusCode) {
        return reply.status(error.statusCode).send({
          error: error.message
        })
      }
      
      return reply.status(500).send({
        error: 'Internal server error'
      })
    })

    await queueService.createConsumerGroup()
    
    const address = await fastify.listen({
      port: env.PORT,
      host: '0.0.0.0'
    })

    fastify.log.info(`Ollama Turbo Agent backend listening at ${address}`)
    fastify.log.info(`Environment: ${env.NODE_ENV}`)
    fastify.log.info(`Log level: ${env.LOG_LEVEL}`)

  } catch (err) {
    fastify.log.error(err)
    process.exit(1)
  }
}

const shutdown = async (signal: string) => {
  fastify.log.info(`Received ${signal}, shutting down gracefully`)
  
  try {
    await queueService.disconnect()
    await fastify.close()
    process.exit(0)
  } catch (err) {
    fastify.log.error('Error during shutdown:', err)
    process.exit(1)
  }
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))

start()


