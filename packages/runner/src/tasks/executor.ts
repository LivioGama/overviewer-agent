import { Octokit } from "@octokit/rest";
import type { Job } from "@overviewer-agent/shared";
import { BaseTask, TaskResult } from "./base-task.js";
import { BugFixTask } from "./bug-fix.js";
import { CodeQualityTask } from "./code-quality.js";
import { DocumentationTask } from "./documentation.js";
import { RefactorTask } from "./refactor.js";
import { SecurityAuditTask } from "./security-audit.js";
import { TestGenerationTask } from "./test-generation.js";

export class TaskExecutor {
  private taskClasses: Map<string, new () => BaseTask>;

  constructor() {
    this.taskClasses = new Map();
    this.taskClasses.set("bug_fix", BugFixTask);
    this.taskClasses.set("code_quality", CodeQualityTask);
    this.taskClasses.set("documentation", DocumentationTask);
    this.taskClasses.set("refactor", RefactorTask);
    this.taskClasses.set("security_audit", SecurityAuditTask);
    this.taskClasses.set("test_generation", TestGenerationTask);
  }

  async executeTask(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    const TaskClass = this.taskClasses.get(job.taskType);

    if (!TaskClass) {
      throw new Error(`Unknown task type: ${job.taskType}`);
    }

    console.log(`Executing ${job.taskType} task for job ${job.id}`);

    try {
      const task = new TaskClass();
      const result = await task.execute(job, workspace, octokit);

      console.log(`Task ${job.taskType} completed with result:`, {
        success: result.success,
        filesChanged: result.changes.files.length,
        summary: result.summary,
      });

      return result;
    } catch (error) {
      console.error(`Task ${job.taskType} failed:`, error);
      throw error;
    }
  }
}

export { BaseTask } from "./base-task.js";
export type { TaskResult } from "./base-task.js";

