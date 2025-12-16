import { Octokit } from "@octokit/rest";
import { Job, INITIAL_COMMENT_TEMPLATE, renderTemplate } from "@overviewer-agent/shared";
import { simpleGit } from "simple-git";
import { CodeIndexer } from "../services/code-indexer.js";
import { ContextManager } from "../services/context-manager.js";
import { EmbeddingService } from "../services/embedding-service.js";
import { MemoryStore } from "../services/memory-store.js";
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
  private embeddingService: EmbeddingService;
  private memoryStore: MemoryStore;
  private contextManager: ContextManager;
  private maxIterations: number;

  constructor(maxIterations = 30) {
    this.llm = new LLMClient();
    this.embeddingService = new EmbeddingService();
    this.memoryStore = new MemoryStore(this.embeddingService);
    this.contextManager = new ContextManager(this.embeddingService);
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

    if (job.taskParams.issueNumber) {
      try {
        const initialComment = renderTemplate(INITIAL_COMMENT_TEMPLATE, {
          issue_summary: job.taskParams.issueTitle || "this issue",
          issue_type: job.taskType || "bug_fix",
          complexity: "medium",
          task_type: job.taskType || "bug_fix",
        });

        await octokit.rest.issues.createComment({
          owner: job.repoOwner,
          repo: job.repoName,
          issue_number: job.taskParams.issueNumber,
          body: initialComment,
        });
        console.log(`Posted initial comment on issue #${job.taskParams.issueNumber}`);
      } catch (error) {
        console.warn("Failed to post initial comment:", error);
      }
    }

    // Phase 1: Initialize embeddings and index tools
    await this.embeddingService.initialize();
    console.log("Indexing tools for semantic matching...");
    for (const tool of tools) {
      await this.embeddingService.indexTool(
        tool.name,
        tool.description,
        JSON.stringify(tool.parameters)
      );
    }

    // Phase 2: Index repository code
    const codeIndexer = new CodeIndexer(this.embeddingService);
    await codeIndexer.indexRepository(workspace);

    const context: ToolContext = {
      workspace,
      repoOwner: job.repoOwner,
      repoName: job.repoName,
      issueNumber: job.taskParams.issueNumber,
      octokit,
      codeIndexer,
    };

    // Phase 3: Search for similar solutions in memory
    await this.memoryStore.initialize();
    const similarSolutions = await this.memoryStore.findSimilarSolutions(
      job.taskParams.issueTitle || "",
      job.taskParams.issueBody || "",
      3
    );

    let initialPrompt = `
Issue Title: ${job.taskParams.issueTitle || "No title"}

Issue Description:
${job.taskParams.issueBody || job.taskParams.args || "No description provided"}

Repository: ${job.repoOwner}/${job.repoName}

Your task: Analyze and fix this issue autonomously. Start by exploring the repository structure.`;

    if (similarSolutions.length > 0 && similarSolutions[0].score > 0.8) {
      const memory = similarSolutions[0];
      console.log(`Found similar solution (${(memory.score * 100).toFixed(1)}% match): ${memory.issueTitle}`);
      
      initialPrompt += `\n\nHINT: Similar issue was solved before:
Issue: ${memory.issueTitle}
Solution: ${memory.solution}
Files modified: ${memory.filesModified.join(", ")}

You may use this as guidance, but analyze the current issue independently.`;
    }

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

        // Phase 4: Compress context if needed
        const currentGoal = `Fix issue: ${job.taskParams.issueTitle}`;
        const compressedHistory = await this.contextManager.compressHistory(
          conversationHistory,
          currentGoal
        );

        let thought;
        try {
          thought = await this.llm.generateThought(
            systemPrompt,
            compressedHistory,
          );
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          // Check if it's a rate limiting error
          if (errorMessage.includes("429") || errorMessage.includes("Too Many Requests")) {
            console.error("Rate limited by LLM API. Job will be retried later.");
            return {
              success: false,
              summary: "Rate limited by LLM API. Job queued for retry.",
              iterations: iteration,
              error: "Rate limited (429) - will retry",
            };
          }
          
          // Check if it's a temporary service error
          if (errorMessage.includes("503") || errorMessage.includes("Service Unavailable")) {
            console.error("LLM service temporarily unavailable. Job will be retried later.");
            return {
              success: false,
              summary: "LLM service temporarily unavailable. Job queued for retry.",
              iterations: iteration,
              error: "Service unavailable (503) - will retry",
            };
          }
          
          // For other errors, throw to be caught by outer catch
          throw error;
        }

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
          let tool = getToolByName(thought.action.tool);
          
          // Phase 1: Use semantic matching if tool not found
          if (!tool) {
            const suggestions = await this.embeddingService.findSimilarTools(
              thought.action.tool,
              1
            );

            if (suggestions[0]?.score > 0.7) {
              console.log(`Tool "${thought.action.tool}" not found, using "${suggestions[0].name}" (score: ${suggestions[0].score.toFixed(2)})`);
              tool = getToolByName(suggestions[0].name);
              if (tool) {
                thought.action.tool = suggestions[0].name;
              }
            }
          }

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

      // Phase 3: Store successful solution in memory
      await this.storeSuccessfulMemory(job, finalAnswer);

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

  private async storeSuccessfulMemory(job: Job, solution: string): Promise<void> {
    try {
      await this.memoryStore.storeMemory({
        jobId: job.id,
        issueTitle: job.taskParams.issueTitle || "",
        issueBody: job.taskParams.issueBody || "",
        solution,
        filesModified: [],
        success: true,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to store memory:", error);
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

