import {
  type CommentEvent,
  isBot,
  type IssueEvent,
  parseCommand,
  type PullRequestEvent,
  type PushEvent,
  type TaskTypeType,
  validateWebhookSignature,
} from "@overviewer-agent/shared";
import { env } from "../config/env.js";
import { issueAnalyzerService } from "./issue-analyzer.js";
import { policyService } from "./policy.js";
import { queueService } from "./queue.js";

export class WebhookService {
  async handleWebhook(
    eventName: string,
    payload: unknown,
    signature: string,
    body: string,
  ): Promise<{ success: boolean; message?: string }> {
    if (!validateWebhookSignature(body, signature, env.GITHUB_WEBHOOK_SECRET)) {
      return { success: false, message: "Invalid signature" };
    }

    try {
      switch (eventName) {
        case "issue_comment":
          return await this.handleCommentEvent(payload as CommentEvent);
        case "issues":
          return await this.handleIssueEvent(payload as IssueEvent);
        case "pull_request":
          return await this.handlePullRequestEvent(payload as PullRequestEvent);
        case "push":
          return await this.handlePushEvent(payload as PushEvent);
        case "installation":
          return await this.handleInstallationEvent(payload);
        default:
          return { success: true, message: `Ignored event: ${eventName}` };
      }
    } catch (error) {
      return { success: false, message: "Internal server error" };
    }
  }

  private async handleCommentEvent(
    payload: CommentEvent,
  ): Promise<{ success: boolean; message?: string }> {
    if (payload.action !== "created") {
      return { success: true, message: "Ignored non-created comment" };
    }

    if (isBot(payload.comment.user.login)) {
      return { success: true, message: "Ignored bot comment" };
    }

    const command = parseCommand(payload.comment.body);
    if (!command) {
      return { success: true, message: "No command found in comment" };
    }

    const isPullRequest = !!payload.issue.pull_request;
    const installationId = payload.installation.id;
    const repoOwner = payload.repository.owner.login;
    const repoName = payload.repository.name;

    const isAllowed = await policyService.isUserAllowed(
      installationId,
      repoOwner,
      repoName,
      payload.comment.user.login,
      "comment",
    );

    if (!isAllowed) {
      return {
        success: false,
        message: "User not allowed to trigger automation",
      };
    }

    const taskType = this.mapCommandToTaskType(command.command);
    if (!taskType) {
      return { success: false, message: `Unknown command: ${command.command}` };
    }

    await queueService.enqueueJob({
      installationId,
      repoOwner,
      repoName,
      triggerType: "comment",
      triggerPayload: payload,
      taskType: taskType as TaskTypeType,
      taskParams: {
        command: command.command,
        args: command.args,
        commentId: payload.comment.id,
        issueNumber: payload.issue.number,
        isPullRequest,
      },
      status: "queued",
    });

    return { success: true, message: "Job queued successfully" };
  }

  private async handlePullRequestEvent(
    payload: PullRequestEvent,
  ): Promise<{ success: boolean; message?: string }> {
    if (!["opened", "synchronize"].includes(payload.action)) {
      return { success: true, message: "Ignored PR event action" };
    }

    const installationId = payload.installation.id;
    const repoOwner = payload.repository.owner.login;
    const repoName = payload.repository.name;

    const config = await policyService.getRepositoryConfig(
      installationId,
      repoOwner,
      repoName,
    );
    if (!config || !config.automation.triggers.includes("pr_opened")) {
      return { success: true, message: "PR automation not configured" };
    }

    await queueService.enqueueJob({
      installationId,
      repoOwner,
      repoName,
      commitSha: payload.pull_request.head.sha,
      refName: payload.pull_request.head.ref,
      triggerType: "pr_opened",
      triggerPayload: payload,
      taskType: "code_quality",
      taskParams: {
        prNumber: payload.pull_request.number,
        baseBranch: payload.pull_request.base.ref,
        headBranch: payload.pull_request.head.ref,
      },
      status: "queued",
    });

    return { success: true, message: "PR automation job queued" };
  }

  private async handlePushEvent(
    payload: PushEvent,
  ): Promise<{ success: boolean; message?: string }> {
    if (
      payload.ref !== "refs/heads/main" &&
      payload.ref !== "refs/heads/master"
    ) {
      return { success: true, message: "Ignored non-main branch push" };
    }

    const installationId = payload.installation.id;
    const repoOwner = payload.repository.owner.login;
    const repoName = payload.repository.name;

    const config = await policyService.getRepositoryConfig(
      installationId,
      repoOwner,
      repoName,
    );
    if (!config || !config.automation.triggers.includes("push")) {
      return { success: true, message: "Push automation not configured" };
    }

    await queueService.enqueueJob({
      installationId,
      repoOwner,
      repoName,
      commitSha: payload.after,
      refName: payload.ref.replace("refs/heads/", ""),
      triggerType: "push",
      triggerPayload: payload,
      taskType: "documentation",
      taskParams: {
        commits: payload.commits,
        before: payload.before,
        after: payload.after,
      },
      status: "queued",
    });

    return { success: true, message: "Push automation job queued" };
  }

  private async handleIssueEvent(
    payload: IssueEvent,
  ): Promise<{ success: boolean; message?: string }> {
    if (payload.action !== "opened") {
      return { success: true, message: "Ignored non-opened issue event" };
    }

    if (!issueAnalyzerService.shouldProcessIssue(payload)) {
      return {
        success: true,
        message: "Issue does not meet processing criteria",
      };
    }

    const installationId = payload.installation.id;
    const repoOwner = payload.repository.owner.login;
    const repoName = payload.repository.name;
    const issueNumber = payload.issue.number;

    const config = await policyService.getRepositoryConfig(
      installationId,
      repoOwner,
      repoName,
    );
    if (!config || !config.automation.triggers.includes("issue_opened")) {
      return {
        success: true,
        message: "Issue automation not configured for this repository",
      };
    }

    const analysis = issueAnalyzerService.analyzeIssue(payload);

    await queueService.enqueueJob({
      installationId,
      repoOwner,
      repoName,
      triggerType: "issue_opened",
      triggerPayload: payload,
      taskType: analysis.taskType,
      taskParams: {
        issueNumber,
        issueTitle: payload.issue.title,
        issueBody: payload.issue.body || "",
        analysis,
        autoTriggered: true,
      },
      status: "queued",
    });

    return {
      success: true,
      message: `Issue #${issueNumber} queued for ${analysis.taskType} (confidence: ${analysis.confidence}%)`,
    };
  }

  private async handleInstallationEvent(
    payload: unknown,
  ): Promise<{ success: boolean; message?: string }> {
    const installationPayload = payload as {
      action: string;
      installation: {
        id: number;
        account: {
          id: number;
          login: string;
          type: string;
        };
        permissions: Record<string, unknown>;
      };
    };

    if (installationPayload.action === "created") {
      await policyService.createInstallation({
        id: installationPayload.installation.id,
        accountId: installationPayload.installation.account.id,
        accountLogin: installationPayload.installation.account.login,
        accountType: installationPayload.installation.account.type,
        permissions: installationPayload.installation.permissions,
      });
    } else if (installationPayload.action === "deleted") {
      await policyService.removeInstallation(
        installationPayload.installation.id,
      );
    }

    return {
      success: true,
      message: `Installation ${installationPayload.action}`,
    };
  }

  private mapCommandToTaskType(command: string): string | null {
    const commandMap: Record<string, string> = {
      refactor: "refactor",
      move: "structure_refactor",
      restructure: "structure_refactor",
      test: "test_generation",
      docs: "documentation",
      fix: "bug_fix",
      security: "security_audit",
      quality: "code_quality",
      update: "dependency_update",
    };

    return commandMap[command] || null;
  }
}

export const webhookService = new WebhookService();
