import { Job, JobCreate } from "@overviewer-agent/shared";
import { createClient, RedisClientType } from "redis";
import { v4 as uuidv4 } from "uuid";
import { env } from "../config/env.js";

export class QueueService {
  private client: RedisClientType;
  private isConnected = false;

  constructor() {
    this.client = createClient({ url: env.REDIS_URL });
    this.client.on("error", () => {});
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      await this.client.connect();
      this.isConnected = true;
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
    }
  }

  async enqueueJob(job: JobCreate): Promise<string> {
    await this.connect();
    const jobId = uuidv4();
    const jobWithId = {
      ...job,
      id: jobId,
      createdAt: new Date(),
      status: "queued" as const,
    };
    await this.client.xAdd("job-queue", "*", {
      jobId,
      jobData: JSON.stringify(jobWithId),
    });
    await this.client.hSet(`job:${jobId}`, {
      status: jobWithId.status,
      createdAt: jobWithId.createdAt.toISOString(),
      data: JSON.stringify(jobWithId),
    });
    return jobId;
  }

  async dequeueJob(): Promise<Job | null> {
    await this.connect();
    const result = await this.client.xReadGroup(
      "processors",
      "worker-1",
      [{ key: "job-queue", id: ">" }],
      { COUNT: 1, BLOCK: 1000 },
    );
    if (!result || result.length === 0) return null;
    const stream = result[0];
    if (!stream?.messages || stream.messages.length === 0) return null;
    const message = stream.messages[0];
    if (!message?.message) return null;
    const jobData = message.message.jobData;
    if (typeof jobData === "string") {
      try {
        return JSON.parse(jobData);
      } catch {
        return null;
      }
    }
    return null;
  }

  async updateJobStatus(
    jobId: string,
    status: Job["status"],
    result?: any,
    logs?: string,
  ): Promise<void> {
    await this.connect();
    const updates: Record<string, string> = {
      status,
      updatedAt: new Date().toISOString(),
    };
    if (
      status === "in_progress" &&
      !(await this.client.hExists(`job:${jobId}`, "startedAt"))
    ) {
      updates.startedAt = new Date().toISOString();
    }
    if (status === "completed" || status === "failed") {
      updates.completedAt = new Date().toISOString();
    }
    if (result !== undefined) updates.result = JSON.stringify(result);
    if (logs !== undefined) updates.logs = logs;
    await this.client.hSet(`job:${jobId}`, updates);
  }

  async getJob(jobId: string): Promise<Job | null> {
    await this.connect();
    const jobData = await this.client.hGet(`job:${jobId}`, "data");
    if (!jobData) return null;
    try {
      return JSON.parse(jobData);
    } catch {
      return null;
    }
  }

  async getJobStatus(jobId: string): Promise<Job["status"] | null> {
    await this.connect();
    const status = await this.client.hGet(`job:${jobId}`, "status");
    return status as Job["status"] | null;
  }

  async acknowledgeJob(streamId: string): Promise<void> {
    await this.connect();
    await this.client.xAck("job-queue", "processors", streamId);
  }

  async ensureConsumerGroup(): Promise<void> {
    await this.connect();
    try {
      await this.client.xGroupCreate("job-queue", "processors", "0", {
        MKSTREAM: true,
      });
    } catch (error: any) {
      if (!error.message?.includes("BUSYGROUP")) throw error;
    }
  }

  async getJobsByStatus(status: Job["status"]): Promise<Job[]> {
    await this.connect();
    const keys = await this.client.keys("job:*");
    const jobs: Job[] = [];
    for (const key of keys) {
      const jobData = await this.client.hGetAll(key);
      if (jobData.status === status && jobData.data) {
        try {
          jobs.push(JSON.parse(jobData.data));
        } catch {}
      }
    }
    return jobs;
  }

  async retryJob(jobId: string, maxRetries = 3): Promise<void> {
    await this.connect();
    const retryCount = await this.client.hGet(`job:${jobId}`, "retryCount");
    const currentRetries = retryCount ? parseInt(retryCount, 10) : 0;
    if (currentRetries >= maxRetries) {
      await this.updateJobStatus(jobId, "failed", {
        error: "Max retries exceeded",
      });
      return;
    }
    await this.client.hSet(`job:${jobId}`, {
      retryCount: (currentRetries + 1).toString(),
      status: "queued",
    });
    const jobData = await this.client.hGet(`job:${jobId}`, "data");
    if (jobData) {
      await this.client.xAdd("job-queue", "*", {
        jobId,
        jobData,
        retry: "true",
      });
    }
  }
}

export const queueService = new QueueService();
