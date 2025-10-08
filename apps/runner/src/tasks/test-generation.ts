import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { CodeAnalysisService } from "../services/code-analysis.js";
import { LLMService } from "../services/llm.js";
import { BaseTask, TaskResult } from "./base-task.js";

export class TestGenerationTask extends BaseTask {
  private codeAnalysis = new CodeAnalysisService();
  private llm = new LLMService();

  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    console.log(`Starting test generation for job ${job.id}`);

    try {
      const codeContext = await this.codeAnalysis.analyzeRepository(workspace);

      const testGeneration = await this.llm.generateCodeFix(
        {
          title: "Generate Tests",
          body: "Generate comprehensive test coverage for the codebase",
        },
        codeContext,
        {
          taskType: "test_generation",
          confidence: 85,
          description: "Test generation and coverage improvement",
          priority: "medium",
          estimatedComplexity: "moderate",
          affectedFiles: [],
          suggestions: [
            "Add unit tests",
            "Improve test coverage",
            "Add integration tests",
          ],
        },
      );

      const branchName = await this.createWorkingBranch(
        job,
        "tests/generation",
      );
      const commitMessage =
        await this.llm.generateCommitMessage(testGeneration);

      await this.commitAndPush(job, branchName, commitMessage, octokit);

      const prUrl = await this.createPullRequest(
        job,
        branchName,
        "Add comprehensive test coverage",
        testGeneration.summary,
      );

      return {
        success: true,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: "Test generation completed",
        branchName,
        prUrl,
      };
    } catch (error) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: `Test generation failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }
}
