import { z } from 'zod'

export const JobStatus = z.enum([
  'queued',
  'in_progress',
  'completed',
  'failed',
  'cancelled'
])

export const TriggerType = z.enum([
  'comment',
  'issue_opened',
  'issue_closed',
  'pr_opened',
  'pr_closed',
  'pr_review',
  'push',
  'schedule'
])

export const TaskType = z.enum([
  'refactor',
  'test_generation',
  'documentation',
  'dependency_update',
  'code_quality',
  'bug_fix',
  'security_audit'
])

export const JobSchema = z.object({
  id: z.string().uuid(),
  installationId: z.number().int().positive(),
  repoOwner: z.string().min(1),
  repoName: z.string().min(1),
  commitSha: z.string().optional(),
  refName: z.string().optional(),
  triggerType: TriggerType,
  triggerPayload: z.record(z.any()),
  taskType: TaskType,
  taskParams: z.record(z.any()),
  status: JobStatus,
  createdAt: z.date(),
  startedAt: z.date().optional(),
  completedAt: z.date().optional(),
  result: z.record(z.any()).optional(),
  logs: z.string().optional()
})

export const JobCreateSchema = JobSchema.omit({
  id: true,
  createdAt: true,
  startedAt: true,
  completedAt: true,
  result: true,
  logs: true
}).extend({
  status: JobStatus.default('queued')
})

export const JobUpdateSchema = JobSchema.partial().extend({
  id: z.string().uuid()
})

export type Job = z.infer<typeof JobSchema>
export type JobCreate = z.infer<typeof JobCreateSchema>
export type JobUpdate = z.infer<typeof JobUpdateSchema>
export type JobStatusType = z.infer<typeof JobStatus>
export type TriggerTypeType = z.infer<typeof TriggerType>
export type TaskTypeType = z.infer<typeof TaskType>


