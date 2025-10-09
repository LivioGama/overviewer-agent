import { Tool, ToolContext, ToolResult } from "./types.js";

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

      await context.octokit.rest.issues.createComment({
        owner: context.repoOwner,
        repo: context.repoName,
        issue_number: context.issueNumber,
        body: params.message,
      });

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

