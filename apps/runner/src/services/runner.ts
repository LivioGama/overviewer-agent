import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import axios from "axios";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { createClient, RedisClientType } from "redis";
import { simpleGit } from "simple-git";
import { TaskExecutor } from "../tasks/executor.js";

export class RunnerService {
  private redis: RedisClientType;
  private executor: TaskExecutor;
  private workspaceRoot: string;
  private running = false;

  constructor() {
    this.redis = createClient({
      url: process.env.REDIS_URL || "redis://localhost:6379",
    });
    this.executor = new TaskExecutor();
    this.workspaceRoot =
      process.env.WORKSPACE_ROOT || "/tmp/overviewer-workspaces";
  }

  async start(): Promise<void> {
    try {
      await this.redis.connect();
      this.running = true;
      console.log("Runner service started.");
    } catch (error) {
      console.error("Failed to start runner service:", error);
      throw error;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.redis.disconnect();
      this.running = false;
      console.log("Runner service stopped.");
    } catch (error) {
      console.error("Failed to stop runner service:", error);
      throw error;
    }
  }
}