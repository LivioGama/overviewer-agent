import { Octokit } from "@octokit/rest";
import { Job } from "@overviewer-agent/shared";
import { simpleGit } from "simple-git";
import { getAllTools, getToolByName, ToolContext } from "../tools/index.js";
import { LLMClient } from "./llm-client.js";

export interface AgentResult {
  success: boolean;
  summary: string;
  iterations: number;
  error?: string;
}

export class AgentLoop {
  private llm: LLMClient;
  private maxIterations: number;

  constructor(maxIterations = Number(process.env.MAX_ITERATIONS || 12)) {
    this.llm = new LLMClient();
    this.maxIterations = maxIterations;
  }

  async execute(
    job: Job,
    workspace: string,
    octokit: Octokit,
  ): Promise<AgentResult> {
    const tools = getAllTools();
    const systemPrompt = this.llm.buildSystemPrompt(tools);
    const conversationHistory: Array<{ role: string; content: string }> = [];

    const context: ToolContext = {
      workspace,
      repoOwner: job.repoOwner,
      repoName: job.repoName,
      issueNumber: job.taskParams.issueNumber,
      octokit,
    };

    const initialPrompt = `
Issue Title: ${job.taskParams.issueTitle || "No title"}

Issue Description:
${job.taskParams.issueBody || job.taskParams.args || "No description provided"}

Repository: ${job.repoOwner}/${job.repoName}

Your task: Analyze and fix this issue autonomously. Start by exploring the repository structure.`;

    conversationHistory.push({
      role: "user",
      content: initialPrompt,
    });

    let iteration = 0;
    let finalAnswer = "";

    try {
      while (iteration < this.maxIterations) {
        iteration++;
        console.log(`\n=== Agent Iteration ${iteration} ===`);

        const thought = await this.llm.generateThought(
          systemPrompt,
          conversationHistory,
        );

        console.log(`Reasoning: ${thought.reasoning}`);

        conversationHistory.push({
          role: "assistant",
          content: JSON.stringify(thought),
        });

        if (thought.finished) {
          finalAnswer = thought.finalAnswer || "Task completed";
          console.log(`Agent finished: ${finalAnswer}`);
          break;
        }

        if (thought.action) {
          const tool = getToolByName(thought.action.tool);
          if (!tool) {
            const errorMsg = `Unknown tool: ${thought.action.tool}`;
            console.error(errorMsg);
            conversationHistory.push({
              role: "user",
              content: `Error: ${errorMsg}. Available tools: ${tools.map((t) => t.name).join(", ")}`,
            });
            continue;
          }

          console.log(`Executing tool: ${thought.action.tool}`);
          console.log(`Parameters:`, thought.action.parameters);

          const result = await tool.execute(thought.action.parameters, context);

          console.log(`Tool result - Success: ${result.success}`);
          if (result.error) {
            console.log(`Error: ${result.error}`);
          }

          conversationHistory.push({
            role: "user",
            content: `Tool: ${thought.action.tool}\nResult: ${result.success ? "Success" : "Failed"}\nOutput:\n${result.output}${result.error ? `\nError: ${result.error}` : ""}`,
          });
        }
      }

      if (iteration >= this.maxIterations) {
        return {
          success: false,
          summary: "Agent reached maximum iterations without completing the task",
          iterations: iteration,
        };
      }

      return {
        success: true,
        summary: finalAnswer,
        iterations: iteration,
      };
    } catch (error) {
      console.error("Agent loop failed:", error);
      return {
        success: false,
        summary: "Agent encountered an error",
        iterations: iteration,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async createBranchAndPR(
    job: Job,
    workspace: string,
    octokit: Octokit,
    summary: string,
  ): Promise<{ branchName: string; prUrl: string }> {
    const git = simpleGit(workspace);
    const branchName = `overviewer-agent/${job.taskType}-${Date.now()}`;

    await git.checkoutLocalBranch(branchName);
    await git.add(".");
    await git.commit(
      `Fix: ${job.taskParams.issueTitle || "Issue fix"}\n\n${summary}`,
    );
    await git.push("origin", branchName, ["--set-upstream"]);

    const prResponse = await octokit.rest.pulls.create({
      owner: job.repoOwner,
      repo: job.repoName,
      title: `Fix: ${job.taskParams.issueTitle || "Issue fix"}`,
      head: branchName,
      base: "main",
      body: `${summary}\n\n${job.taskParams.issueNumber ? `Fixes #${job.taskParams.issueNumber}` : ""}`,
    });

    return {
      branchName,
      prUrl: prResponse.data.html_url,
    };
  }
}

