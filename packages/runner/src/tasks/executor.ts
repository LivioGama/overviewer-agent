import { Octokit } from '@octokit/rest'
import { Job, generateBranchName } from '@ollama-turbo-agent/shared'
import { simpleGit } from 'simple-git'
import { OllamaService } from '../services/ollama.js'
import { BugFixTask } from './bug-fix.js'
import { CodeQualityTask } from './code-quality.js'
import { DocumentationTask } from './documentation.js'
import { RefactorTask } from './refactor.js'
import { SecurityAuditTask } from './security-audit.js'
import { TestGenerationTask } from './test-generation.js'

export interface TaskResult {
  success: boolean
  changes: {
    files: string[]
    additions: number
    deletions: number
  }
  summary: string
  details?: any
  branchName?: string
  pullRequestUrl?: string
  checkRunId?: number
}

export abstract class BaseTask {
  constructor(
    protected ollama: OllamaService,
    protected octokit: Octokit,
    protected workspace: string
  ) {}

  abstract execute(job: Job): Promise<TaskResult>

  protected async createWorkingBranch(
    job: Job,
    branchPrefix: string = 'automation/'
  ): Promise<string> {
    const git = simpleGit(this.workspace)
    const branchName = generateBranchName(branchPrefix, job.taskType)
    
    await git.checkoutLocalBranch(branchName)
    return branchName
  }

  protected async commitAndPush(
    job: Job,
    branchName: string,
    message: string
  ): Promise<void> {
    const git = simpleGit(this.workspace)
    
    await git.add('.')
    await git.commit(message)
    await git.push('origin', branchName)
  }

  protected async createPullRequest(
    job: Job,
    branchName: string,
    title: string,
    body: string
  ): Promise<string> {
    const response = await this.octokit.rest.pulls.create({
      owner: job.repoOwner,
      repo: job.repoName,
      title,
      head: branchName,
      base: 'main',
      body,
      draft: false
    })

    return response.data.html_url
  }

  protected async createCheckRun(
    job: Job,
    name: string,
    summary: string,
    details?: string
  ): Promise<number> {
    const response = await this.octokit.rest.checks.create({
      owner: job.repoOwner,
      repo: job.repoName,
      name,
      head_sha: job.commitSha || 'HEAD',
      status: 'completed',
      conclusion: 'success',
      output: {
        title: name,
        summary,
        text: details
      }
    })

    return response.data.id
  }

  protected async postComment(
    job: Job,
    message: string
  ): Promise<void> {
    if (job.taskParams.issueNumber) {
      await this.octokit.rest.issues.createComment({
        owner: job.repoOwner,
        repo: job.repoName,
        issue_number: job.taskParams.issueNumber,
        body: message
      })
    }
  }
}

export class TaskExecutor {
  private tasks: Map<string, (ollama: OllamaService, octokit: Octokit, workspace: string) => BaseTask>

  constructor(private ollama: OllamaService) {
    this.tasks = new Map([
      ['refactor', (ollama, octokit, workspace) => new RefactorTask(ollama, octokit, workspace)],
      ['test_generation', (ollama, octokit, workspace) => new TestGenerationTask(ollama, octokit, workspace)],
      ['documentation', (ollama, octokit, workspace) => new DocumentationTask(ollama, octokit, workspace)],
      ['security_audit', (ollama, octokit, workspace) => new SecurityAuditTask(ollama, octokit, workspace)],
      ['bug_fix', (ollama, octokit, workspace) => new BugFixTask(ollama, octokit, workspace)],
      ['code_quality', (ollama, octokit, workspace) => new CodeQualityTask(ollama, octokit, workspace)]
    ])
  }

  async executeTask(
    job: Job,
    workspace: string,
    octokit: Octokit
  ): Promise<TaskResult> {
    const taskFactory = this.tasks.get(job.taskType)
    
    if (!taskFactory) {
      throw new Error(`Unknown task type: ${job.taskType}`)
    }

    const task = taskFactory(this.ollama, octokit, workspace)
    
    try {
      const result = await task.execute(job)
      
      if (result.success) {
        const summary = `✅ **${job.taskType}** completed successfully!\n\n${result.summary}`
        await task.postComment(job, summary)
      }
      
      return result
    } catch (error) {
      const errorMessage = `❌ **${job.taskType}** failed: ${error.message}`
      await task.postComment(job, errorMessage)
      throw error
    }
  }

  getSupportedTasks(): string[] {
    return Array.from(this.tasks.keys())
  }
}


