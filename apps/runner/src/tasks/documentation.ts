import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { CodeAnalysisService } from "../services/code-analysis.js";
import { LLMService } from "../services/llm.js";
import { BaseTask, TaskResult } from "./base-task.js";

export class DocumentationTask extends BaseTask {
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
        "📚 Analyzing code for documentation needs...",
      );
      const codeContext = await this.codeAnalysis.analyzeRepository(workspace);
      const documentation = await this.llm.generateCodeFix(
        {
          title: "Generate Documentation",
          body: "Add comprehensive documentation including README updates, code comments, and API docs",
        },
        codeContext,
        {
          taskType: "documentation",
          confidence: 90,
          description: "Documentation generation",
          priority: "medium",
          estimatedComplexity: "simple",
          affectedFiles: [],
          suggestions: [
            "Update README",
            "Add code comments",
            "Generate API docs",
          ],
        },
      );
      await this.updateStatus(
        job,
        octokit,
        "applying",
        "📝 Generating documentation...",
      );
      const appliedFiles = await this.applyChanges(workspace, documentation);
      const branchName = await this.createWorkingBranch(
        job,
        "docs/documentation",
      );
      const commitMessage = await this.llm.generateCommitMessage(documentation);
      await this.commitAndPush(job, branchName, commitMessage, octokit);
      const prUrl = await this.createPullRequest(
        job,
        branchName,
        "Add comprehensive documentation",
        documentation.summary,
      );
      return {
        success: true,
        changes: {
          files: appliedFiles,
          additions: appliedFiles.length * 10,
          deletions: appliedFiles.length * 2,
        },
        summary: `Generated documentation for ${appliedFiles.length} files`,
        branchName,
        prUrl,
      };
    } catch (error) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: `Documentation task failed: ${error instanceof Error ? error.message : String(error)}`,
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
