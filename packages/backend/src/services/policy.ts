import { Policy, RepoConfig } from '@ollama-turbo-agent/shared'
import { and, eq } from 'drizzle-orm'
import yaml from 'yaml'
import { db } from '../database/connection.js'
import { installations, policies } from '../database/schema.js'
import { githubService } from './github.js'

export class PolicyService {
  async createInstallation(installation: {
    id: number
    accountId: number
    accountLogin: string
    accountType: string
    permissions: any
  }): Promise<void> {
    await db.insert(installations).values({
      id: installation.id,
      accountId: installation.accountId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      permissions: installation.permissions
    }).onConflictDoUpdate({
      target: installations.id,
      set: {
        accountId: installation.accountId,
        accountLogin: installation.accountLogin,
        accountType: installation.accountType,
        permissions: installation.permissions,
        updatedAt: new Date()
      }
    })

    await this.createDefaultPolicy(installation.id)
  }

  async removeInstallation(installationId: number): Promise<void> {
    await db.delete(policies).where(eq(policies.installationId, installationId))
    await db.delete(installations).where(eq(installations.id, installationId))
  }

  private async createDefaultPolicy(installationId: number): Promise<void> {
    const defaultPolicy = {
      installationId,
      allowedTriggers: ['comment'],
      allowedUsers: [],
      requireApproval: true,
      maxRuntimeSeconds: 300,
      config: {
        defaultTasks: {
          refactor: {
            model: 'gpt-oss:120b',
            maxTokens: 4000,
            timeout: 300
          },
          test: {
            model: 'gpt-oss:120b',
            maxTokens: 2000,
            timeout: 180
          }
        }
      }
    }

    await db.insert(policies).values(defaultPolicy)
  }

  async isUserAllowed(
    installationId: number,
    repoOwner: string,
    repoName: string,
    username: string,
    triggerType: string
  ): Promise<boolean> {
    const policy = await this.getPolicy(installationId, `${repoOwner}/${repoName}`)
    if (!policy) {
      return false
    }

    if (!policy.allowedTriggers.includes(triggerType)) {
      return false
    }

    if (policy.allowedUsers.length === 0) {
      return await this.isRepositoryCollaborator(installationId, repoOwner, repoName, username)
    }

    return policy.allowedUsers.includes(username)
  }

  private async isRepositoryCollaborator(
    installationId: number,
    repoOwner: string,
    repoName: string,
    username: string
  ): Promise<boolean> {
    try {
      const octokit = await githubService.getInstallationOctokit(installationId)
      const response = await octokit.rest.repos.getCollaboratorPermissionLevel({
        owner: repoOwner,
        repo: repoName,
        username
      })

      return ['admin', 'maintain', 'write'].includes(response.data.permission)
    } catch (error: any) {
      if (error.status === 404) {
        return false
      }
      throw error
    }
  }

  async getPolicy(installationId: number, repoPattern?: string): Promise<Policy | null> {
    const query = repoPattern
      ? and(
          eq(policies.installationId, installationId),
          eq(policies.repoPattern, repoPattern)
        )
      : eq(policies.installationId, installationId)

    const result = await db.select()
      .from(policies)
      .where(query)
      .limit(1)

    return result[0] || null
  }

  async getRepositoryConfig(
    installationId: number,
    repoOwner: string,
    repoName: string,
    ref?: string
  ): Promise<RepoConfig | null> {
    try {
      const configContent = await githubService.getRepositoryConfig(
        installationId,
        repoOwner,
        repoName,
        ref
      )

      if (!configContent) {
        return null
      }

      const config = yaml.parse(configContent)
      return this.validateRepoConfig(config)
    } catch (error) {
      console.error('Failed to parse repository config:', error)
      return null
    }
  }

  private validateRepoConfig(config: any): RepoConfig | null {
    try {
      if (!config.automation) {
        return null
      }

      const validatedConfig: RepoConfig = {
        automation: {
          triggers: config.automation.triggers || ['comment'],
          tasks: config.automation.tasks || {},
          approval: {
            required: config.automation.approval?.required ?? true,
            maintainersOnly: config.automation.approval?.maintainersOnly ?? true,
            reviewers: config.automation.approval?.reviewers
          },
          output: {
            openPr: config.automation.output?.openPr ?? true,
            pushDirect: config.automation.output?.pushDirect ?? false,
            createBranch: config.automation.output?.createBranch ?? true,
            branchPrefix: config.automation.output?.branchPrefix ?? 'automation/'
          },
          rateLimits: config.automation.rateLimits
        },
        version: config.version || '1.0',
        enabled: config.enabled ?? true
      }

      return validatedConfig
    } catch (error) {
      console.error('Invalid repository config:', error)
      return null
    }
  }

  async updatePolicy(
    installationId: number,
    updates: Partial<Policy>
  ): Promise<void> {
    await db.update(policies)
      .set(updates)
      .where(eq(policies.installationId, installationId))
  }

  async getRateLimits(installationId: number): Promise<{
    maxJobsPerHour: number
    maxJobsPerDay: number
  }> {
    const policy = await this.getPolicy(installationId)
    
    const rateLimits = policy?.config?.rateLimits || {}
    
    return {
      maxJobsPerHour: rateLimits.maxJobsPerHour || 10,
      maxJobsPerDay: rateLimits.maxJobsPerDay || 50
    }
  }

  async checkRateLimit(installationId: number): Promise<boolean> {
    const limits = await this.getRateLimits(installationId)
    
    const now = new Date()
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000)
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
    
    return true
  }
}

export const policyService = new PolicyService()


