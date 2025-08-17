import { Octokit } from '@octokit/rest'
import { Job } from '@ollama-turbo-agent/shared'
import { promises as fs } from 'fs'
import path from 'path'
import { RedisClientType, createClient } from 'redis'
import { simpleGit } from 'simple-git'
import { fileURLToPath } from 'url'
import { TaskExecutor } from '../tasks/executor.js'
import { OllamaService } from './ollama.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export class RunnerService {
  private redis: RedisClientType
  private ollama: OllamaService
  private executor: TaskExecutor
  private workspaceRoot: string

  constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    })
    
    this.ollama = new OllamaService()
    this.executor = new TaskExecutor(this.ollama)
    this.workspaceRoot = process.env.WORKSPACE_ROOT || '/tmp/ollama-turbo-workspaces'
  }

  async start(): Promise<void> {
    await this.redis.connect()
    await this.setupWorkspace()
    
    console.log('Runner started, waiting for jobs...')
    
    while (true) {
      try {
        const job = await this.dequeueJob()
        if (job) {
          await this.processJob(job)
        } else {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }
      } catch (error) {
        console.error('Error processing job:', error instanceof Error ? error.message : String(error))
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  private async setupWorkspace(): Promise<void> {
    await fs.mkdir(this.workspaceRoot, { recursive: true })
  }

  private async dequeueJob(): Promise<Job | null> {
    try {
      const result = await this.redis.xReadGroup(
        'processors',
        'runner-1',
        [{ key: 'job-queue', id: '>' }],
        { COUNT: 1, BLOCK: 5000 }
      )

      if (!result || result.length === 0) {
        return null
      }

      const stream = result[0]
      if (!stream.messages || stream.messages.length === 0) {
        return null
      }

      const message = stream.messages[0]
      const jobData = message.message.jobData

      if (typeof jobData === 'string') {
        return JSON.parse(jobData)
      }

      return null
    } catch (error) {
      console.error('Error dequeuing job:', error)
      return null
    }
  }

  private async processJob(job: Job): Promise<void> {
    const jobWorkspace = path.join(this.workspaceRoot, job.id)
    
    try {
      console.log(`Processing job ${job.id}: ${job.taskType}`)
      
      await this.updateJobStatus(job.id, 'in_progress')
      
      await this.setupJobWorkspace(jobWorkspace)
      
      const installationToken = await this.getInstallationToken(job.installationId)
      const octokit = new Octokit({ auth: installationToken })
      
      await this.cloneRepository(
        jobWorkspace,
        job.repoOwner,
        job.repoName,
        installationToken,
        job.refName
      )
      
      const result = await this.executor.executeTask(job, jobWorkspace, octokit)
      
      await this.updateJobStatus(job.id, 'completed', result)
      
      console.log(`Job ${job.id} completed successfully`)
      
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error)
      await this.updateJobStatus(job.id, 'failed', { error: error instanceof Error ? error.message : String(error) })
    } finally {
      await this.cleanupWorkspace(jobWorkspace)
    }
  }

  private async setupJobWorkspace(workspace: string): Promise<void> {
    await fs.rm(workspace, { recursive: true, force: true })
    await fs.mkdir(workspace, { recursive: true })
  }

  private async cloneRepository(
    workspace: string,
    owner: string,
    repo: string,
    token: string,
    ref?: string
  ): Promise<void> {
    const git = simpleGit()
    const repoUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`
    
    await git.clone(repoUrl, workspace, {
      '--depth': 1,
      ...(ref && { '--branch': ref })
    })
  }

  private async getInstallationToken(installationId: number): Promise<string> {
    const appPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY!
    const appId = process.env.GITHUB_APP_ID!
    
    const jwt = this.createJWT(appId, appPrivateKey)
    
    const response = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: 'application/vnd.github.v3+json'
        }
      }
    )

    if (!response.ok) {
      throw new Error(`Failed to create installation token: ${response.statusText}`)
    }

    const data = await response.json()
    return data.token
  }

  private createJWT(appId: string, privateKey: string): string {
    const crypto = require('crypto')
    
    const now = Math.floor(Date.now() / 1000)
    const payload = {
      iat: now - 60,
      exp: now + 10 * 60,
      iss: appId
    }

    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url')
    
    const signature = crypto
      .sign('RSA-SHA256', Buffer.from(`${header}.${payloadStr}`))
      .update(privateKey.replace(/\\n/g, '\n'))
      .sign('base64url')

    return `${header}.${payloadStr}.${signature}`
  }

  private async updateJobStatus(
    jobId: string,
    status: Job['status'],
    result?: any
  ): Promise<void> {
    const updates: Record<string, string> = { status }
    
    if (status === 'in_progress') {
      updates.startedAt = new Date().toISOString()
    }
    
    if (status === 'completed' || status === 'failed') {
      updates.completedAt = new Date().toISOString()
    }
    
    if (result !== undefined) {
      updates.result = JSON.stringify(result)
    }
    
    await this.redis.hSet(`job:${jobId}`, updates)
  }

  private async cleanupWorkspace(workspace: string): Promise<void> {
    try {
      await fs.rm(workspace, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Failed to cleanup workspace ${workspace}:`, error)
    }
  }

  async stop(): Promise<void> {
    await this.redis.disconnect()
  }
}


