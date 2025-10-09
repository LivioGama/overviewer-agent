import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import axios from "axios";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { createClient, RedisClientType } from "redis";
import { simpleGit } from "simple-git";
import { AgentLoop } from "./agent/agent-loop.js";

class RunnerService {
  private redis: RedisClientType;
  private agent: AgentLoop;
  private workspaceRoot: string;
  private running = false;

  constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    this.agent = new AgentLoop();
    this.workspaceRoot =
      process.env.WORKSPACE_ROOT || "/tmp/overviewer-workspaces";
  }

  async start(): Promise<void> {
    await this.redis.connect();
    await this.setupRedisConsumerGroup();
    await this.setupWorkspace();
    this.running = true;
    console.log("Runner started, waiting for jobs...");
    await this.processLoop();
  }

  async stop(): Promise<void> {
    this.running = false;
    await this.redis.disconnect();
  }

  private async processLoop(): Promise<void> {
    while (this.running) {
      try {
        const result = await this.dequeueJob();
        if (result) {
          const { job, streamId } = result;
          try {
            await this.processJob(job);
            await this.redis.xAck("job-queue", "processors", streamId);
          } catch (error) {
            console.error(`Job ${job.id} failed:`, error);
            await this.updateJobStatus(job.id, "failed", {
              error: error instanceof Error ? error.message : String(error),
            });
          }
        } else {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        console.error("Error in process loop:", error);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  private async setupRedisConsumerGroup(): Promise<void> {
    try {
      await this.redis.xGroupCreate("job-queue", "processors", "0", {
        MKSTREAM: true,
      });
    } catch (error: any) {
      if (!error.message?.includes("BUSYGROUP")) {
        console.warn("Consumer group already exists");
      }
    }
  }

  private async setupWorkspace(): Promise<void> {
    await fs.mkdir(this.workspaceRoot, { recursive: true });
    console.log(`Workspace root: ${this.workspaceRoot}`);
  }

  private async dequeueJob(): Promise<{ job: Job; streamId: string } | null> {
    try {
      const streams = await this.redis.xReadGroup(
        "processors",
        `consumer-${process.pid}`,
        [{ key: "job-queue", id: ">" }],
        { COUNT: 1, BLOCK: 5000 },
      );
      if (!streams || streams.length === 0) return null;
      const stream = streams[0];
      if (!stream || !stream.messages || stream.messages.length === 0) return null;
      const message = stream.messages[0];
      if (!message) return null;
      const jobData = message.message as any;
      const job: Job = JSON.parse(jobData.jobData);
      return { job, streamId: message.id };
    } catch (error) {
      console.error("Error dequeuing job:", error);
      return null;
    }
  }

  private async processJob(job: Job): Promise<void> {
    const jobWorkspace = path.join(this.workspaceRoot, job.id);
    try {
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Processing job ${job.id}`);
      console.log(`Issue: ${job.taskParams.issueTitle}`);
      console.log(`${"=".repeat(60)}\n`);
      
      await this.updateJobStatus(job.id, "in_progress");
      await this.setupJobWorkspace(jobWorkspace);
      const installationToken = await this.getInstallationToken(
        job.installationId,
      );
      const octokit = new Octokit({ auth: installationToken });
      await this.cloneRepository(
        jobWorkspace,
        job.repoOwner,
        job.repoName,
        installationToken,
      );

      const result = await this.agent.execute(job, jobWorkspace, octokit);

      if (result.success) {
        const { branchName, prUrl } = await this.agent.createBranchAndPR(
          job,
          jobWorkspace,
          octokit,
          result.summary,
        );

        await this.updateJobStatus(job.id, "completed", {
          success: true,
          summary: result.summary,
          iterations: result.iterations,
          branchName,
          prUrl,
        });
        
        console.log(`\n${"=".repeat(60)}`);
        console.log(`Job ${job.id} completed successfully!`);
        console.log(`PR: ${prUrl}`);
        console.log(`Iterations: ${result.iterations}`);
        console.log(`${"=".repeat(60)}\n`);
      } else {
        await this.updateJobStatus(job.id, "failed", result);
        console.log(`\nJob ${job.id} failed: ${result.summary}\n`);
      }
    } catch (error) {
      console.error(`Job ${job.id} failed:`, error);
      await this.updateJobStatus(job.id, "failed", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      await this.cleanupWorkspace(jobWorkspace);
    }
  }

  private async setupJobWorkspace(workspace: string): Promise<void> {
    await fs.rm(workspace, { recursive: true, force: true });
    await fs.mkdir(workspace, { recursive: true });
  }

  private async cloneRepository(
    workspace: string,
    owner: string,
    repo: string,
    token: string,
  ): Promise<void> {
    const git = simpleGit();
    const repoUrl = `https://x-access-token:${token}@github.com/${owner}/${repo}.git`;
    await git.clone(repoUrl, workspace, { "--depth": 1 });
  }

  private async getInstallationToken(installationId: number): Promise<string> {
    const appPrivateKey = process.env.GITHUB_APP_PRIVATE_KEY!;
    const appId = process.env.GITHUB_APP_ID!;
    const jwt = this.createJWT(appId, appPrivateKey);
    const response = await axios.post(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {},
      {
        headers: {
          Authorization: `Bearer ${jwt}`,
          Accept: "application/vnd.github.v3+json",
        },
      },
    );
    return response.data.token;
  }

  private createJWT(appId: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iat: now - 60,
      exp: now + 10 * 60,
      iss: appId,
    };
    const header = Buffer.from(
      JSON.stringify({ alg: "RS256", typ: "JWT" }),
    ).toString("base64url");
    const payloadStr = Buffer.from(JSON.stringify(payload)).toString(
      "base64url",
    );
    const signature = crypto
      .createSign("RSA-SHA256")
      .update(`${header}.${payloadStr}`)
      .sign(privateKey.replace(/\\n/g, "\n"), "base64url");
    return `${header}.${payloadStr}.${signature}`;
  }

  private async updateJobStatus(
    jobId: string,
    status: Job["status"],
    result?: any,
  ): Promise<void> {
    const updates: Record<string, string> = { status };
    if (status === "in_progress") updates.startedAt = new Date().toISOString();
    if (status === "completed" || status === "failed")
      updates.completedAt = new Date().toISOString();
    if (result !== undefined) updates.result = JSON.stringify(result);
    await this.redis.hSet(`job:${jobId}`, updates);
  }

  private async cleanupWorkspace(workspace: string): Promise<void> {
    try {
      await fs.rm(workspace, { recursive: true, force: true });
    } catch {}
  }
}

const runner = new RunnerService();

const shutdown = async () => {
  console.log("\nShutting down runner...");
  await runner.stop();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

runner.start().catch((error) => {
  console.error("Failed to start runner:", error);
  process.exit(1);
});

