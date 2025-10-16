import { Tool, ToolContext, ToolResult } from "./types.js";

const retryWithBackoff = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
): Promise<T> => {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const status = error.status;
      const isRetryable = status === 429 || status === 503 || (status && status >= 500);
      
      if (!isRetryable || attempt >= maxRetries) {
        throw error;
      }
      
      const delayMs = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
      console.warn(`[Attempt ${attempt}/${maxRetries}] GitHub API rate limited. Retrying in ${(delayMs / 1000).toFixed(1)}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  
  throw lastError || new Error("Unknown error in retry loop");
};

export const commentOnIssueTool: Tool = {
  name: "comment_on_issue",
  description: "Post a comment on the GitHub issue",
  parameters: {
    message: {
      type: "string",
      description: "Comment message to post",
      required: true,
    },
  },
  async execute(params: { message: string }, context: ToolContext): Promise<ToolResult> {
    try {
      if (!context.issueNumber) {
        return {
          success: false,
          output: "",
          error: "No issue number available",
        };
      }

      await retryWithBackoff(() =>
        context.octokit.rest.issues.createComment({
          owner: context.repoOwner,
          repo: context.repoName,
          issue_number: context.issueNumber,
          body: params.message,
        }),
      );

      return {
        success: true,
        output: "Comment posted successfully",
      };
    } catch (error) {
      return {
        success: false,
        output: "",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  },
};

