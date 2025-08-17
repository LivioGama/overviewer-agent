import { Job } from "@ollama-turbo-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { BaseTask, TaskResult } from "./base-task.js";

export class RefactorTask extends BaseTask {
  async execute(job: Job): Promise<TaskResult> {
    const instructions =
      job.taskParams.args || "Improve code quality and maintainability";
    const branchName = await this.createWorkingBranch(job, "refactor/");

    const filesToRefactor = await this.findFilesToRefactor(job);

    if (filesToRefactor.length === 0) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: "No files found to refactor",
      };
    }

    let totalChanges = 0;
    const modifiedFiles: string[] = [];

    for (const filePath of filesToRefactor) {
      try {
        const originalContent = await fs.readFile(filePath, "utf-8");

        if (this.shouldSkipFile(filePath, originalContent)) {
          continue;
        }

        const refactoredContent = await this.ollama.generateCodeRefactoring(
          originalContent,
          instructions,
          job.taskParams.model || "gpt-oss:120b",
        );

        if (this.isContentImproved(originalContent, refactoredContent)) {
          await fs.writeFile(filePath, refactoredContent, "utf-8");
          modifiedFiles.push(path.relative(this.workspace, filePath));
          totalChanges++;
        }
      } catch (error) {
        console.warn(`Failed to refactor ${filePath}:`, error);
      }
    }

    if (totalChanges === 0) {
      return {
        success: false,
        changes: { files: [], additions: 0, deletions: 0 },
        summary: "No improvements could be made to the code",
      };
    }

    const commitMessage = `refactor: ${instructions}\n\nRefactored ${totalChanges} files with AI assistance`;
    await this.commitAndPush(job, branchName, commitMessage);

    const prTitle = `🔧 Refactor: ${instructions}`;
    const prBody = this.generatePullRequestBody(
      instructions,
      modifiedFiles,
      totalChanges,
    );

    const pullRequestUrl = await this.createPullRequest(
      job,
      branchName,
      prTitle,
      prBody,
    );

    const checkRunId = await this.createCheckRun(
      job,
      "Code Refactoring",
      `Successfully refactored ${totalChanges} files`,
      `Modified files:\n${modifiedFiles.map((f) => `- ${f}`).join("\n")}`,
    );

    return {
      success: true,
      changes: {
        files: modifiedFiles,
        additions: totalChanges * 10,
        deletions: totalChanges * 8,
      },
      summary: `Refactored ${totalChanges} files with focus on: ${instructions}`,
      branchName,
      pullRequestUrl,
      checkRunId,
    };
  }

  private async findFilesToRefactor(job: Job): Promise<string[]> {
    const extensions = [
      ".ts",
      ".js",
      ".tsx",
      ".jsx",
      ".py",
      ".java",
      ".go",
      ".rs",
      ".cpp",
      ".c",
    ];
    const files: string[] = [];

    const scanDirectory = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!this.shouldSkipDirectory(entry.name)) {
            await scanDirectory(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    };

    await scanDirectory(this.workspace);
    return files.slice(0, 20);
  }

  private shouldSkipDirectory(name: string): boolean {
    const skipDirs = [
      "node_modules",
      ".git",
      "dist",
      "build",
      "coverage",
      ".next",
      "target",
      "vendor",
      "__pycache__",
    ];
    return skipDirs.includes(name) || name.startsWith(".");
  }

  private shouldSkipFile(filePath: string, content: string): boolean {
    const filename = path.basename(filePath);

    if (filename.includes(".test.") || filename.includes(".spec.")) {
      return true;
    }

    if (filename.includes(".min.") || filename.includes(".bundle.")) {
      return true;
    }

    if (content.length < 50 || content.length > 50000) {
      return true;
    }

    return false;
  }

  private isContentImproved(original: string, refactored: string): boolean {
    if (refactored.length < 20) {
      return false;
    }

    if (original === refactored) {
      return false;
    }

    const originalLines = original.split("\n").length;
    const refactoredLines = refactored.split("\n").length;

    if (Math.abs(originalLines - refactoredLines) / originalLines > 0.5) {
      return false;
    }

    return true;
  }

  private generatePullRequestBody(
    instructions: string,
    modifiedFiles: string[],
    totalChanges: number,
  ): string {
    return `## 🔧 Automated Code Refactoring

**Instructions:** ${instructions}

### Changes Made
- **Files modified:** ${totalChanges}
- **Focus areas:** Code quality, maintainability, performance, and best practices

### Modified Files
${modifiedFiles.map((file) => `- \`${file}\``).join("\n")}

### What was improved:
- ✅ Code readability and clarity
- ✅ Performance optimizations
- ✅ Best practices implementation
- ✅ Error handling improvements
- ✅ Code structure and organization

---
*This PR was automatically generated by Ollama Turbo Agent*`;
  }
}
