import { CommentEvent, isBot, parseCommand, PullRequestEvent, PushEvent, validateWebhookSignature } from '@ollama-turbo-agent/shared'
import { env } from '../config/env.js'
import { policyService } from './policy.js'
import { queueService } from './queue.js'

export class WebhookService {
  async handleWebhook(
    eventName: string,
    payload: any,
    signature: string,
    body: string
  ): Promise<{ success: boolean; message?: string }> {
    if (!validateWebhookSignature(body, signature, env.GITHUB_WEBHOOK_SECRET)) {
      return { success: false, message: 'Invalid signature' }
    }

    try {
      switch (eventName) {
        case 'issue_comment':
          return await this.handleCommentEvent(payload)
        case 'pull_request':
          return await this.handlePullRequestEvent(payload)
        case 'push':
          return await this.handlePushEvent(payload)
        case 'installation':
          return await this.handleInstallationEvent(payload)
        default:
          return { success: true, message: `Ignored event: ${eventName}` }
      }
    } catch (error) {
      console.error(`Error handling webhook event ${eventName}:`, error)
      return { success: false, message: 'Internal server error' }
    }
  }

  private async handleCommentEvent(payload: CommentEvent): Promise<{ success: boolean; message?: string }> {
    if (payload.action !== 'created') {
      return { success: true, message: 'Ignored non-created comment' }
    }

    if (isBot(payload.comment.user.login)) {
      return { success: true, message: 'Ignored bot comment' }
    }

    const command = parseCommand(payload.comment.body)
    if (!command) {
      return { success: true, message: 'No command found in comment' }
    }

    const isPullRequest = !!payload.issue.pull_request
    const installationId = payload.installation.id
    const repoOwner = payload.repository.owner.login
    const repoName = payload.repository.name

    const isAllowed = await policyService.isUserAllowed(
      installationId,
      repoOwner,
      repoName,
      payload.comment.user.login,
      'comment'
    )

    if (!isAllowed) {
      return { success: false, message: 'User not allowed to trigger automation' }
    }

    const taskType = this.mapCommandToTaskType(command.command)
    if (!taskType) {
      return { success: false, message: `Unknown command: ${command.command}` }
    }

    await queueService.enqueueJob({
      installationId,
      repoOwner,
      repoName,
      triggerType: 'comment',
      triggerPayload: payload,
      taskType,
      taskParams: {
        command: command.command,
        args: command.args,
        commentId: payload.comment.id,
        issueNumber: payload.issue.number,
        isPullRequest
      },
      status: 'queued'
    })

    return { success: true, message: 'Job queued successfully' }
  }

  private async handlePullRequestEvent(payload: PullRequestEvent): Promise<{ success: boolean; message?: string }> {
    if (!['opened', 'synchronize'].includes(payload.action)) {
      return { success: true, message: 'Ignored PR event action' }
    }

    const installationId = payload.installation.id
    const repoOwner = payload.repository.owner.login
    const repoName = payload.repository.name

    const config = await policyService.getRepositoryConfig(installationId, repoOwner, repoName)
    if (!config || !config.automation.triggers.includes('pr_opened')) {
      return { success: true, message: 'PR automation not configured' }
    }

    await queueService.enqueueJob({
      installationId,
      repoOwner,
      repoName,
      commitSha: payload.pull_request.head.sha,
      refName: payload.pull_request.head.ref,
      triggerType: 'pr_opened',
      triggerPayload: payload,
      taskType: 'code_quality',
      taskParams: {
        prNumber: payload.pull_request.number,
        baseBranch: payload.pull_request.base.ref,
        headBranch: payload.pull_request.head.ref
      },
      status: 'queued'
    })

    return { success: true, message: 'PR automation job queued' }
  }

  private async handlePushEvent(payload: PushEvent): Promise<{ success: boolean; message?: string }> {
    if (payload.ref !== 'refs/heads/main' && payload.ref !== 'refs/heads/master') {
      return { success: true, message: 'Ignored non-main branch push' }
    }

    const installationId = payload.installation.id
    const repoOwner = payload.repository.owner.login
    const repoName = payload.repository.name

    const config = await policyService.getRepositoryConfig(installationId, repoOwner, repoName)
    if (!config || !config.automation.triggers.includes('push')) {
      return { success: true, message: 'Push automation not configured' }
    }

    await queueService.enqueueJob({
      installationId,
      repoOwner,
      repoName,
      commitSha: payload.after,
      refName: payload.ref.replace('refs/heads/', ''),
      triggerType: 'push',
      triggerPayload: payload,
      taskType: 'documentation',
      taskParams: {
        commits: payload.commits,
        before: payload.before,
        after: payload.after
      },
      status: 'queued'
    })

    return { success: true, message: 'Push automation job queued' }
  }

  private async handleInstallationEvent(payload: any): Promise<{ success: boolean; message?: string }> {
    if (payload.action === 'created') {
      await policyService.createInstallation({
        id: payload.installation.id,
        accountId: payload.installation.account.id,
        accountLogin: payload.installation.account.login,
        accountType: payload.installation.account.type,
        permissions: payload.installation.permissions
      })
    } else if (payload.action === 'deleted') {
      await policyService.removeInstallation(payload.installation.id)
    }

    return { success: true, message: `Installation ${payload.action}` }
  }

  private mapCommandToTaskType(command: string): string | null {
    const commandMap: Record<string, string> = {
      'refactor': 'refactor',
      'test': 'test_generation',
      'docs': 'documentation',
      'fix': 'bug_fix',
      'security': 'security_audit',
      'quality': 'code_quality',
      'update': 'dependency_update'
    }

    return commandMap[command] || null
  }
}

export const webhookService = new WebhookService()


