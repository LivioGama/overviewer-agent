import { createAppAuth } from '@octokit/auth-app'
import { Octokit } from '@octokit/rest'
import jwt from 'jsonwebtoken'
import { env } from '../config/env.js'

export class GitHubService {
  private appOctokit: Octokit

  constructor() {
    this.appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: env.GITHUB_APP_ID,
        privateKey: env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
      }
    })
  }

  async createInstallationToken(installationId: number): Promise<string> {
    const response = await this.appOctokit.rest.apps.createInstallationAccessToken({
      installation_id: installationId
    })
    return response.data.token
  }

  async getInstallationOctokit(installationId: number): Promise<Octokit> {
    const token = await this.createInstallationToken(installationId)
    return new Octokit({ auth: token })
  }

  async createCheckRun(
    installationId: number,
    owner: string,
    repo: string,
    options: {
      name: string
      headSha: string
      status?: 'queued' | 'in_progress' | 'completed'
      conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required'
      output?: {
        title: string
        summary: string
        text?: string
      }
    }
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    const params: any = {
      owner,
      repo,
      name: options.name,
      head_sha: options.headSha
    }
    
    if (options.status) params.status = options.status
    if (options.conclusion) params.conclusion = options.conclusion
    if (options.output) params.output = options.output
    
    return octokit.rest.checks.create(params)
  }

  async updateCheckRun(
    installationId: number,
    owner: string,
    repo: string,
    checkRunId: number,
    options: {
      status?: 'queued' | 'in_progress' | 'completed'
      conclusion?: 'success' | 'failure' | 'neutral' | 'cancelled' | 'timed_out' | 'action_required'
      output?: {
        title: string
        summary: string
        text?: string
      }
    }
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    const params: any = {
      owner,
      repo,
      check_run_id: checkRunId
    }
    
    if (options.status) params.status = options.status
    if (options.conclusion) params.conclusion = options.conclusion
    if (options.output) params.output = options.output
    
    return octokit.rest.checks.update(params)
  }

  async createComment(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number,
    body: string
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    return octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body
    })
  }

  async updateComment(
    installationId: number,
    owner: string,
    repo: string,
    commentId: number,
    body: string
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    return octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: commentId,
      body
    })
  }

  async addLabelsToIssue(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number,
    labels: string[]
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    return octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels
    })
  }

  async assignIssue(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number,
    assignees: string[]
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    return octokit.rest.issues.addAssignees({
      owner,
      repo,
      issue_number: issueNumber,
      assignees
    })
  }

  async getIssue(
    installationId: number,
    owner: string,
    repo: string,
    issueNumber: number
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    return octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber
    })
  }

  async createPullRequest(
    installationId: number,
    owner: string,
    repo: string,
    options: {
      title: string
      head: string
      base: string
      body?: string
      draft?: boolean
    }
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    const params: any = {
      owner,
      repo,
      title: options.title,
      head: options.head,
      base: options.base
    }
    
    if (options.body) params.body = options.body
    if (options.draft !== undefined) params.draft = options.draft
    
    return octokit.rest.pulls.create(params)
  }

  async getRepositoryConfig(
    installationId: number,
    owner: string,
    repo: string,
    ref?: string
  ) {
    const octokit = await this.getInstallationOctokit(installationId)
    
    try {
      const params: any = {
        owner,
        repo,
        path: '.ollama-turbo.yml'
      }
      
      if (ref) params.ref = ref
      
      const response = await octokit.rest.repos.getContent(params)
      
      if ('content' in response.data) {
        const content = Buffer.from(response.data.content, 'base64').toString('utf-8')
        return content
      }
    } catch (error: any) {
      if (error.status === 404) {
        return null
      }
      throw error
    }
    
    return null
  }

  createJWT(): string {
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iat: now - 60,
      exp: now + 10 * 60,
      iss: env.GITHUB_APP_ID
    }
    
    return jwt.sign(payload, env.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n'), {
      algorithm: 'RS256'
    })
  }
}

export const githubService = new GitHubService()


