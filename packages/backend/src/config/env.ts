import { validateEnv } from '@ollama-turbo-agent/shared'
import { z } from 'zod'

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().int().positive()).default('3001'),
  
  GITHUB_APP_ID: z.string().min(1),
  GITHUB_APP_PRIVATE_KEY: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  
  OLLAMA_API_URL: z.string().url().default('https://ollama.com'),
  OLLAMA_API_KEY: z.string().optional(),
  
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  
  RATE_LIMIT_MAX: z.string().transform(Number).pipe(z.number().int().positive()).default('100'),
  RATE_LIMIT_WINDOW: z.string().default('1 minute')
})

export const env = validateEnv(EnvSchema)
export type Env = z.infer<typeof EnvSchema>


