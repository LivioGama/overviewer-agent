import type { Job } from "@overviewer-agent/shared";
import {
  ERROR_COMMENT_TEMPLATE,
  INITIAL_COMMENT_TEMPLATE,
  PROGRESS_UPDATE_TEMPLATE,
  renderTemplate,
  SUCCESS_COMMENT_TEMPLATE,
  type TemplateVariables,
} from "@overviewer-agent/shared";
import { githubService } from "./github.js";
import type { IssueAnalysis } from "./issue-analyzer.js";

export interface BotComment {
  id: number;
  body: string;
  type: "initial" | "progress" | "success" | "error";
}

export class BotCommunicationService {
  private botComments = new Map<string, BotComment[]>();

  async postInitialComment(
    job: Job,
    analysis: IssueAnalysis,
  ): Promise<BotComment> {
    if (!job.taskParams.issueNumber) {
      throw new Error("Issue number is required for bot communication");
    }

    const variables: TemplateVariables = {
      issue_summary: analysis.summary,
      issue_type: this.formatTaskType(analysis.taskType),
      complexity: analysis.complexity,
      task_type: analysis.taskType,
    };

    const body = renderTemplate(INITIAL_COMMENT_TEMPLATE, variables);

    const response = await githubService.createComment(
      job.installationId,
      job.repoOwner,
      job.repoName,
      job.taskParams.issueNumber,
      body,
    );

    const comment: BotComment = {
      id: response.data.id,
      body,
      type: "initial",
    };

    this.storeComment(job, comment);
    return comment;
  }

  async postProgressUpdate(
    job: Job,
    status: string,
    details?: string,
  ): Promise<BotComment> {
    if (!job.taskParams.issueNumber) {
      throw new Error("Issue number is required for bot communication");
    }

    const variables: TemplateVariables = {
      status,
      status_message: this.getStatusMessage(status),
      details: details || "",
    };

    const body = renderTemplate(PROGRESS_UPDATE_TEMPLATE, variables);

    const response = await githubService.createComment(
      job.installationId,
      job.repoOwner,
      job.repoName,
      job.taskParams.issueNumber,
      body,
    );

    const comment: BotComment = {
      id: response.data.id,
      body,
      type: "progress",
    };

    this.storeComment(job, comment);
    return comment;
  }

  async postSuccessComment(
    job: Job,
    prNumber: number,
    prUrl: string,
    changesSummary: string,
    problemSummary: string,
  ): Promise<BotComment> {
    if (!job.taskParams.issueNumber) {
      throw new Error("Issue number is required for bot communication");
    }

    const variables: TemplateVariables = {
      problem_summary: problemSummary,
      pr_number: prNumber,
      pr_url: prUrl,
      changes_summary: changesSummary,
    };

    const body = renderTemplate(SUCCESS_COMMENT_TEMPLATE, variables);

    const response = await githubService.createComment(
      job.installationId,
      job.repoOwner,
      job.repoName,
      job.taskParams.issueNumber,
      body,
    );

    const comment: BotComment = {
      id: response.data.id,
      body,
      type: "success",
    };

    this.storeComment(job, comment);
    return comment;
  }

  async postErrorComment(
    job: Job,
    error: Error,
    retryInfo?: string,
  ): Promise<BotComment> {
    if (!job.taskParams.issueNumber) {
      throw new Error("Issue number is required for bot communication");
    }

    const variables: TemplateVariables = {
      error_message: error.message,
      retry_info:
        retryInfo || "This issue will be escalated to the maintainers.",
    };

    const body = renderTemplate(ERROR_COMMENT_TEMPLATE, variables);

    const response = await githubService.createComment(
      job.installationId,
      job.repoOwner,
      job.repoName,
      job.taskParams.issueNumber,
      body,
    );

    const comment: BotComment = {
      id: response.data.id,
      body,
      type: "error",
    };

    this.storeComment(job, comment);
    return comment;
  }

  async addProcessingLabels(job: Job): Promise<void> {
    if (!job.taskParams.issueNumber) return;

    const labels = ["overviewer:processing", `task:${job.taskType}`];

    try {
      await githubService.addLabelsToIssue(
        job.installationId,
        job.repoOwner,
        job.repoName,
        job.taskParams.issueNumber,
        labels,
      );
    } catch (error) {}
  }

  async removeProcessingLabels(job: Job): Promise<void> {
    if (!job.taskParams.issueNumber) return;

    // Note: GitHub API doesn't have a direct way to remove specific labels
    // This would need to be implemented by getting current labels and removing specific ones
    // For now, we'll leave this as a placeholder
  }

  getComments(job: Job): BotComment[] {
    const key = `${job.repoOwner}/${job.repoName}#${job.taskParams.issueNumber}`;
    return this.botComments.get(key) || [];
  }

  clearComments(job: Job): void {
    const key = `${job.repoOwner}/${job.repoName}#${job.taskParams.issueNumber}`;
    this.botComments.delete(key);
  }

  private storeComment(job: Job, comment: BotComment): void {
    const key = `${job.repoOwner}/${job.repoName}#${job.taskParams.issueNumber}`;
    const comments = this.botComments.get(key) || [];
    comments.push(comment);
    this.botComments.set(key, comments);
  }

  private getStatusMessage(status: string): string {
    const statusMessages = {
      analyzing: "Analyzing the issue and determining the best approach...",
      fixing: "Implementing the fix based on my analysis...",
      testing: "Running tests to ensure the fix works correctly...",
      creating_pr: "Creating a pull request with the proposed changes...",
      completed: "Successfully completed the task!",
      failed: "Encountered an error while processing the issue.",
    };

    return statusMessages[status as keyof typeof statusMessages] || status;
  }

  private formatTaskType(taskType: string): string {
    const taskTypeMap = {
      bug_fix: "Bug Fix",
      refactor: "Code Refactoring",
      test_generation: "Test Generation",
      documentation: "Documentation Update",
      security_audit: "Security Audit",
      code_quality: "Code Quality Improvement",
    };

    return taskTypeMap[taskType as keyof typeof taskTypeMap] || taskType;
  }
}

export const botCommunicationService = new BotCommunicationService();
