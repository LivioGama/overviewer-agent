import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const jobs = pgTable("jobs", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  installationId: bigint("installation_id", { mode: "number" }).notNull(),
  repoOwner: varchar("repo_owner", { length: 255 }).notNull(),
  repoName: varchar("repo_name", { length: 255 }).notNull(),
  commitSha: varchar("commit_sha", { length: 40 }),
  refName: varchar("ref_name", { length: 255 }),
  triggerType: varchar("trigger_type", { length: 50 }).notNull(),
  triggerPayload: jsonb("trigger_payload").notNull(),
  taskType: varchar("task_type", { length: 100 }).notNull(),
  taskParams: jsonb("task_params").notNull(),
  status: varchar("status", { length: 50 }).default("queued").notNull(),
  createdAt: timestamp("created_at")
    .default(sql`NOW()`)
    .notNull(),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  result: jsonb("result"),
  logs: text("logs"),
});

export const issues = pgTable("issues", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  githubIssueNumber: integer("github_issue_number").notNull(),
  repositoryId: bigint("repository_id", { mode: "number" }).notNull(),
  installationId: bigint("installation_id", { mode: "number" }).notNull(),
  issueTitle: varchar("issue_title", { length: 500 }).notNull(),
  issueBody: text("issue_body"),
  analysisResult: jsonb("analysis_result"),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  assignedJobId: uuid("assigned_job_id").references(() => jobs.id),
  createdAt: timestamp("created_at")
    .default(sql`NOW()`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`NOW()`)
    .notNull(),
});

export const prReviews = pgTable("pr_reviews", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  jobId: uuid("job_id")
    .notNull()
    .references(() => jobs.id),
  prNumber: integer("pr_number").notNull(),
  reviewResult: jsonb("review_result"),
  approved: boolean("approved").default(false),
  reviewComments: jsonb("review_comments"),
  createdAt: timestamp("created_at")
    .default(sql`NOW()`)
    .notNull(),
});

export const installations = pgTable("installations", {
  id: bigint("id", { mode: "number" }).primaryKey(),
  accountId: bigint("account_id", { mode: "number" }).notNull(),
  accountLogin: varchar("account_login", { length: 255 }).notNull(),
  accountType: varchar("account_type", { length: 50 }).notNull(),
  permissions: jsonb("permissions").notNull(),
  createdAt: timestamp("created_at")
    .default(sql`NOW()`)
    .notNull(),
  updatedAt: timestamp("updated_at")
    .default(sql`NOW()`)
    .notNull(),
});

export const policies = pgTable("policies", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  installationId: bigint("installation_id", { mode: "number" }).notNull(),
  repoPattern: varchar("repo_pattern", { length: 255 }),
  allowedTriggers: text("allowed_triggers").array(),
  allowedUsers: text("allowed_users").array(),
  requireApproval: boolean("require_approval").default(true).notNull(),
  maxRuntimeSeconds: integer("max_runtime_seconds").default(300).notNull(),
  config: jsonb("config").notNull(),
  createdAt: timestamp("created_at")
    .default(sql`NOW()`)
    .notNull(),
});

export type Job = typeof jobs.$inferSelect;
export type JobInsert = typeof jobs.$inferInsert;
export type Issue = typeof issues.$inferSelect;
export type IssueInsert = typeof issues.$inferInsert;
export type PRReview = typeof prReviews.$inferSelect;
export type PRReviewInsert = typeof prReviews.$inferInsert;
export type Installation = typeof installations.$inferSelect;
export type InstallationInsert = typeof installations.$inferInsert;
export type Policy = typeof policies.$inferSelect;
export type PolicyInsert = typeof policies.$inferInsert;