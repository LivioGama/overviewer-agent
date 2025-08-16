import { z } from 'zod'

export const validateEnv = <T extends z.ZodRawShape>(schema: z.ZodObject<T>) => {
  const result = schema.safeParse(process.env)
  
  if (!result.success) {
    const errors = result.error.format()
    throw new Error(`Environment validation failed: ${JSON.stringify(errors, null, 2)}`)
  }
  
  return result.data
}

export const safeParseJson = (json: string): unknown => {
  try {
    return JSON.parse(json)
  } catch {
    return null
  }
}

export const validateWebhookSignature = (
  payload: string,
  signature: string,
  secret: string
): boolean => {
  const crypto = require('crypto')
  const expectedSignature = `sha256=${crypto
    .createHmac('sha256', secret)
    .update(payload, 'utf8')
    .digest('hex')}`
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}


