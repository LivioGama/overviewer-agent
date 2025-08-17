import { Octokit } from "@octokit/rest";
import type { Job } from "@ollama-turbo-agent/shared";
import { generateBranchName } from "@ollama-turbo-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { simpleGit } from "simple-git";
import type { OllamaService } from "../services/ollama.js";

export interface TaskResult {
  success: boolean;
  changes: {
    files: string[];
    additions: number;
    deletions: number;
  };
  summary: string;
  branchName?: string;
  pullRequestUrl?: string;
  checkRunId?: number;
  details?: any;
}

export abstract class BaseTask {
  constructor(
    protected ollama: OllamaService,
    protected octokit: Octokit,
    protected workspace: string,
  ) {}

  abstract execute(job: Job): Promise<TaskResult>;

  protected async createWorkingBranch(
    job: Job,
    branchPrefix: string = "automation/",
  ): Promise<string> {
    const git = simpleGit(this.workspace);
    const branchName = generateBranchName(branchPrefix, job.taskType);

    await git.checkoutLocalBranch(branchName);
    return branchName;
  }

  protected async commitAndPush(
    job: Job,
    branchName: string,
    message: string,
  ): Promise<void> {
    const git = simpleGit(this.workspace);

    await git.add(".");
    await git.commit(message);
    await git.push("origin", branchName);
  }

  protected async applyQualityChecks(): Promise<void> {
    const filesToCheck = await this.findFilesToImprove();

    for (const filePath of filesToCheck.slice(0, 5)) {
      try {
        await this.removeCommentsFromFile(filePath);
        await this.improveCodeQualityInline(filePath);
      } catch (error) {
        console.warn(`Failed to apply quality checks to ${filePath}:`, error);
      }
    }
  }

  protected async findFilesToImprove(): Promise<string[]> {
    const extensions = [".ts", ".js", ".tsx", ".jsx"];
    const files: string[] = [];

    const scanDirectory = async (dir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);

          if (entry.isDirectory() && !this.shouldSkipDirectory(entry.name)) {
            await scanDirectory(fullPath);
          } else if (
            entry.isFile() &&
            extensions.some((ext) => entry.name.endsWith(ext))
          ) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        console.warn(`Failed to scan directory ${dir}:`, error);
      }
    };

    await scanDirectory(this.workspace);
    return files;
  }

  protected shouldSkipDirectory(name: string): boolean {
    return (
      [
        "node_modules",
        "dist",
        "build",
        ".git",
        "coverage",
        ".next",
        "__pycache__",
      ].includes(name) || name.startsWith(".")
    );
  }

  private async removeCommentsFromFile(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const cleanedContent = this.removeCodeComments(content, filePath);

      if (cleanedContent !== content) {
        await fs.writeFile(filePath, cleanedContent, "utf-8");
      }
    } catch (error) {
      console.warn(`Failed to remove comments from ${filePath}:`, error);
    }
  }

  private removeCodeComments(content: string, filePath: string): string {
    const isTypeScript = filePath.endsWith(".ts") || filePath.endsWith(".tsx");
    const isJavaScript = filePath.endsWith(".js") || filePath.endsWith(".jsx");

    if (!isTypeScript && !isJavaScript) {
      return content;
    }

    return content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/(?!\s*@ts-ignore).*$/gm, "")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .trim();
  }

  private async improveCodeQualityInline(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, "utf-8");

      if (content.length < 100 || content.length > 10000) {
        return;
      }

      const hasQualityIssues = !this.hasGoodQuality(content);
      if (!hasQualityIssues) {
        return;
      }

      const improvedContent = await this.ollama.improveCodeQuality(
        content,
        "gpt-oss:120b",
      );

      if (this.isImprovement(content, improvedContent)) {
        await fs.writeFile(filePath, improvedContent, "utf-8");
      }
    } catch (error) {
      console.warn(`Failed to improve code quality for ${filePath}:`, error);
    }
  }

  protected hasGoodQuality(content: string): boolean {
    const qualityIndicators = [
      /\/\*\*[\s\S]*?\*\//g,
      /interface\s+\w+/g,
      /type\s+\w+\s*=/g,
      /const\s+\w+\s*[:=]/g,
    ];

    return qualityIndicators.some((pattern) => pattern.test(content));
  }

  protected isImprovement(original: string, improved: string): boolean {
    return (
      improved.length > original.length * 0.8 &&
      improved.length < original.length * 1.5 &&
      improved.trim().length > 0
    );
  }

  protected async createPullRequest(
    job: Job,
    branchName: string,
    title: string,
    body: string,
  ): Promise<string> {
    const response = await this.octokit.rest.pulls.create({
      owner: job.repoOwner,
      repo: job.repoName,
      title,
      head: branchName,
      base: "main",
      body,
      draft: false,
    });

    return response.data.html_url;
  }

  protected async createCheckRun(
    job: Job,
    name: string,
    summary: string,
    details?: string,
  ): Promise<number> {
    const response = await this.octokit.rest.checks.create({
      owner: job.repoOwner,
      repo: job.repoName,
      name,
      head_sha: job.commitSha || "HEAD",
      status: "completed",
      conclusion: "success",
      output: {
        title: name,
        summary,
        text: details,
      },
    });

    return response.data.id;
  }

  protected async postComment(job: Job, message: string): Promise<void> {
    if (job.taskParams.issueNumber) {
      await this.octokit.rest.issues.createComment({
        owner: job.repoOwner,
        repo: job.repoName,
        issue_number: job.taskParams.issueNumber,
        body: message,
      });
    }
  }

  protected async updateIssueProgress(
    job: Job,
    status: string,
    details?: string,
  ): Promise<void> {
    // This will be implemented with bot communication service
    console.log(
      `Progress update for job ${job.id}: ${status}${details ? ` - ${details}` : ""}`,
    );
  }

  protected async postInitialComment(job: Job): Promise<void> {
    if (job.taskParams.analysis && job.taskParams.issueNumber) {
      const message = `Hi! I'm here to help out the maintainers and am going to see if I can fix this issue. I'll investigate ${job.taskParams.issueTitle || "this issue"}. Thanks for reporting this!

🔍 **Analysis in progress...**
- Issue type: ${this.formatTaskType(job.taskType)}
- Estimated complexity: ${job.taskParams.analysis.complexity}
- Task queued: ${job.taskType}

I'll keep you updated on my progress!`;

      await this.postComment(job, message);
    }
  }

  protected async postSuccessComment(
    job: Job,
    prUrl: string,
    summary: string,
  ): Promise<void> {
    if (job.taskParams.issueNumber) {
      const prNumber = prUrl.split("/").pop();
      const message = `I've successfully implemented a fix for this issue! 🎉

${summary}

Solution implemented in PR #${prNumber}

**Changes made:**
- Analyzed the issue and identified the root cause
- Implemented targeted fixes with minimal impact
- Added appropriate error handling and validation
- Ensured backward compatibility

All CI checks have passed ✅ and the fix is ready for review!`;

      await this.postComment(job, message);
    }
  }

  private formatTaskType(taskType: string): string {
    const taskTypeMap: Record<string, string> = {
      bug_fix: "Bug Fix",
      refactor: "Code Refactoring",
      test_generation: "Test Generation",
      documentation: "Documentation Update",
      security_audit: "Security Audit",
      code_quality: "Code Quality Improvement",
    };

    return taskTypeMap[taskType] || taskType;
  }
}
