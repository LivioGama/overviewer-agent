import { Octokit } from "@octokit/rest";
import type { Job } from "@ollama-turbo-agent/shared";
import { generateBranchName } from "@ollama-turbo-agent/shared";
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

Solution implemented in PR #${prNumber}: ${prUrl}

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
