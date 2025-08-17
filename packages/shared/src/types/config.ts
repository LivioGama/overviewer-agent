import { z } from "zod";
import { TriggerType } from "./job.js";

export const TaskConfigSchema = z.object({
  command: z.string(),
  model: z.string().optional(),
  maxTokens: z.number().int().positive().optional(),
  timeout: z.number().int().positive().default(300),
  autoFix: z.boolean().default(false),
  params: z.record(z.any()).optional(),
});

export const ApprovalConfigSchema = z.object({
  required: z.boolean().default(true),
  maintainersOnly: z.boolean().default(true),
  reviewers: z.array(z.string()).optional(),
});

export const OutputConfigSchema = z.object({
  openPr: z.boolean().default(true),
  pushDirect: z.boolean().default(false),
  createBranch: z.boolean().default(true),
  branchPrefix: z.string().default("automation/"),
});

export const AutomationConfigSchema = z.object({
  triggers: z.array(TriggerType),
  tasks: z.record(TaskConfigSchema),
  approval: ApprovalConfigSchema,
  output: OutputConfigSchema,
  rateLimits: z
    .object({
      maxJobsPerHour: z.number().int().positive().default(10),
      maxJobsPerDay: z.number().int().positive().default(50),
    })
    .optional(),
});

export const RepoConfigSchema = z.object({
  automation: AutomationConfigSchema,
  version: z.string().default("1.0"),
  enabled: z.boolean().default(true),
});

export type TaskConfig = z.infer<typeof TaskConfigSchema>;
export type ApprovalConfig = z.infer<typeof ApprovalConfigSchema>;
export type OutputConfig = z.infer<typeof OutputConfigSchema>;
export type AutomationConfig = z.infer<typeof AutomationConfigSchema>;
export type RepoConfig = z.infer<typeof RepoConfigSchema>;
