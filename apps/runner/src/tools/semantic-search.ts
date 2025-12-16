import { Tool, ToolContext, ToolResult } from "./types.js";

export const semanticSearchTool: Tool = {
  name: "semantic_search",
  description: "Search the codebase semantically to find relevant files based on meaning, not just keywords",
  parameters: {
    query: {
      type: "string",
      description: "Natural language description of what you're looking for (e.g., 'password validation logic', 'payment processing functions')",
      required: true,
    },
    limit: {
      type: "number",
      description: "Maximum number of results to return (default: 5)",
      required: false,
    },
  },
  async execute(params: { query: string; limit?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const codeIndexer = (context as any).codeIndexer;
      if (!codeIndexer) {
        return {
          success: false,
          output: "",
          error: "Code indexer not available",
        };
      }

      const results = await codeIndexer.searchCode(params.query, params.limit || 5);
      
      const output = results
        .map((r: { path: string; score: number }, i: number) => `${i + 1}. ${r.path} (relevance: ${(r.score * 100).toFixed(1)}%)`)
        .join("\n");

      return {
        success: true,
        output: `Found ${results.length} relevant files:\n${output}`,
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

