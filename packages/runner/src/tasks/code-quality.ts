import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { CodeAnalysisService } from "../services/code-analysis.js";
import { LLMService } from "../services/llm.js";
import { BaseTask, TaskResult } from "./base-task.js";

export class CodeQualityTask extends BaseTask {
  private codeAnalysis = new CodeAnalysisService();
  private llm = new LLMService();

  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    this.workspace = workspace;
    this.octokit = octokit;
    try {
      await this.updateStatus(
        job,
        octokit,
        "analyzing",
        "🔍 Analyzing code quality issues...",
      );
      const codeContext = await this.codeAnalysis.analyzeRepository(workspace);
      const improvements = await this.llm.generateCodeFix(
        {
          title: "Code Quality Improvements",
          body: "Improve code quality, fix linting issues, and optimize performance",
        },
        codeContext,
        {
          taskType: "code_quality",
          confidence: 85,
          description: "Code quality improvements",
          priority: "medium",
          estimatedComplexity: "moderate",
          affectedFiles: [],
          suggestions: [
            "Fix linting issues",
            "Improve code structure",
            "Add type safety",
          ],
        },
      );
      await this.updateStatus(
        job,
        octokit,
        "applying",
        "📝 Applying quality improvements...",
      );
      const appliedFiles = await this.applyChanges(workspace, improvements);
      const branchName = await this.createWorkingBranch(
        job,
        "quality/code_quality",
      );
      const commitMessage = await this.llm.generateCommitMessage(improvements);
      await this.commitAndPush(job, branchName, commitMessage, octokit);
      const prUrl = await this.createPullRequest(
        job,
        branchName,
        "Improve code quality and fix linting issues",
        improvements.summary,
      );
      return {
        success: true,
        changes: {
          files: appliedFiles,
          additions: appliedFiles.length * 10,
          deletions: appliedFiles.length * 2,
        },
        summary: `Applied code quality improvements to ${appliedFiles.length} files`,
        branchName,
        prUrl,
      };
    } catch (error) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: `Code quality task failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  private async applyChanges(
    workspace: string,
    changes: any,
  ): Promise<string[]> {
    const appliedFiles: string[] = [];
    for (const change of changes.files) {
      const filePath = path.join(workspace, change.path);
      try {
        if (change.action === "create" || change.action === "modify") {
          const dir = path.dirname(filePath);
          try {
            await fs.mkdir(dir, { recursive: true });
          } catch (mkdirError: any) {
            if (mkdirError.code !== "EEXIST") {
              throw mkdirError;
            }
          }
          await fs.writeFile(filePath, change.content, "utf-8");
        } else if (change.action === "delete") {
          try {
            await fs.unlink(filePath);
          } catch (unlinkError: any) {
            if (unlinkError.code !== "ENOENT") {
              throw unlinkError;
            }
          }
        }
        appliedFiles.push(change.path);
      } catch (error) {
        console.error(`Failed to apply change to ${change.path}:`, error);
      }
    }
    return appliedFiles;
  }
}
