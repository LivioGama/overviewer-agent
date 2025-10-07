import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { promises as fs } from "fs";
import path from "path";
import { CodeAnalysisService } from "../services/code-analysis.js";
import { LLMService } from "../services/llm.js";
import { BaseTask, TaskResult } from "./base-task.js";

export class DocumentationTask extends BaseTask {
  private codeAnalysis = new CodeAnalysisService();
  private llm = new LLMService();

  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<TaskResult> {
    this.workspace = workspace;
    this.octokit = octokit;
    try {
      await this.updateStatus(
        job,
        octokit,
        "analyzing",
        "📚 Analyzing code for documentation needs...",
      );
      const codeCon
    }
  }
