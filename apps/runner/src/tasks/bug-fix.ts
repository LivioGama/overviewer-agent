import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { simpleGit } from "simple-git";
import { CodeAnalysisService } from "../services/code-analysis.js";
import { LLMService } from "../services/llm.js";
import { BaseTask, TaskResult } from "./base-task.js";

export class BugFixTask extends BaseTask {
  protected codeAnalysis = new CodeAnalysisService();
  protected llm = new LLMService();

  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    this.workspace = workspace;
    this.octokit = octokit;
    try {
      // Post initial comment if this is an auto-triggered task
      if (job.taskParams.autoTriggered) await this.postInitialCom
    }
  }
