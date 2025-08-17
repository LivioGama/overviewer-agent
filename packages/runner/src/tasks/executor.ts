import { Octokit } from "@octokit/rest";
import type { Job } from "@ollama-turbo-agent/shared";
import type { OllamaService } from "../services/ollama.js";
import { BaseTask, TaskResult } from "./base-task.js";
import { BugFixTask } from "./bug-fix.js";
import { CodeQualityTask } from "./code-quality.js";
import { DocumentationTask } from "./documentation.js";
import { RefactorTask } from "./refactor.js";
import { SecurityAuditTask } from "./security-audit.js";
import { TestGenerationTask } from "./test-generation.js";

export class TaskExecutor {
  private tasks: Map<
    string,
    (ollama: OllamaService, octokit: Octokit, workspace: string) => BaseTask
  >;

  constructor(private ollama: OllamaService) {
    this.tasks = new Map();
    this.tasks.set(
      "refactor",
      (ollama, octokit, workspace) =>
        new RefactorTask(ollama, octokit, workspace),
    );
    this.tasks.set(
      "test_generation",
      (ollama, octokit, workspace) =>
        new TestGenerationTask(ollama, octokit, workspace),
    );
    this.tasks.set(
      "documentation",
      (ollama, octokit, workspace) =>
        new DocumentationTask(ollama, octokit, workspace),
    );
    this.tasks.set(
      "security_audit",
      (ollama, octokit, workspace) =>
        new SecurityAuditTask(ollama, octokit, workspace),
    );
    this.tasks.set(
      "bug_fix",
      (ollama, octokit, workspace) =>
        new BugFixTask(ollama, octokit, workspace),
    );
    this.tasks.set(
      "code_quality",
      (ollama, octokit, workspace) =>
        new CodeQualityTask(ollama, octokit, workspace),
    );
  }

  async executeTask(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    const taskFactory = this.tasks.get(job.taskType);

    if (!taskFactory) {
      throw new Error(`Unknown task type: ${job.taskType}`);
    }

    const task = taskFactory(this.ollama, octokit, workspace);

    try {
      const result = await task.execute(job);

      if (result.success) {
        const summary = `✅ **${job.taskType}** completed successfully!\n\n${result.summary}`;
        // Note: postComment is protected, would need to make it public or use a different approach
        console.log("Task completed:", summary);
      }

      return result;
    } catch (error) {
      const errorMessage = `❌ **${job.taskType}** failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error("Task failed:", errorMessage);
      throw error;
    }
  }

  getSupportedTasks(): string[] {
    return Array.from(this.tasks.keys());
  }
}

// Re-export for backward compatibility
export { BaseTask, TaskResult } from "./base-task.js";
