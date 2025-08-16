import { z } from 'zod'
import { TriggerType } from './job.js'

export const PolicySchema = z.object({
  id: z.string().uuid(),
  installationId: z.number().int().positive(),
  repoPattern: z.string().optional(),
  allowedTriggers: z.array(TriggerType),
  allowedUsers: z.array(z.string()),
  requireApproval: z.boolean().default(true),
  maxRuntimeSeconds: z.number().int().positive().default(300),
  config: z.record(z.any()),
  createdAt: z.date()
})

export const PolicyCreateSchema = PolicySchema.omit({
  id: true,
  createdAt: true
})

export const PolicyUpdateSchema = PolicySchema.partial().extend({
  id: z.string().uuid()
})

export type Policy = z.infer<typeof PolicySchema>
export type PolicyCreate = z.infer<typeof PolicyCreateSchema>
export type PolicyUpdate = z.infer<typeof PolicyUpdateSchema>


