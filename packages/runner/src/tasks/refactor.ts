import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { CodeAnalysisService } from "../services/code-analysis.js";
import { LLMService } from "../services/llm.js";
import { BaseTask, TaskResult } from "./base-task.js";

export class RefactorTask extends BaseTask {
  private codeAnalysis = new CodeAnalysisService();
  private llm = new LLMService();

  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    console.log(`Starting refactoring for job ${job.id}`);

    try {
      const codeContext = await this.codeAnalysis.analyzeRepository(workspace);

      const refactoring = await this.llm.generateCodeFix(
        {
          title: "Code Refactoring",
          body: "Refactor code for better maintainability and structure",
        },
        codeContext,
        {
          taskType: "refactor",
          confidence: 75,
          description: "Code refactoring improvements",
          priority: "medium",
          estimatedComplexity: "complex",
          affectedFiles: [],
          suggestions: [
            "Improve code structure",
            "Extract common functionality",
            "Optimize performance",
          ],
        },
      );

      const branchName = await this.createWorkingBranch(
        job,
        "refactor/improvement",
      );
      const commitMessage = await this.llm.generateCommitMessage(refactoring);
      await this.commitAndPush(job, branchName, commitMessage, octokit);
      const prUrl = await this.createPullRequest(
        job,
        branchName,
        "Refactor code for better maintainability",
        refactoring.summary,
      );

      return {
        success: true,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: "Code refactoring completed",
        branchName,
        prUrl,
      };
    } catch (error) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: `Refactoring failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
