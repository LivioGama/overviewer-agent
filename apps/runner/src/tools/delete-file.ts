import { promises as fs } from "fs";
import path from "path";
import { Tool, ToolContext, ToolResult } from "./types.js";

export const deleteFileTool: Tool = {
  name: "delete_file",
  description: "Delete a file in the repository",
  parameters: {
    path: {
      type: "string",
      description: "Relative path to the file from the repository root",
      required: true,
    },
  },
  async execute(params: { path: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const filePath = path.join(context.workspace, params.path);
      await fs.unlink(filePath);
      return {
        success: true,
        output: `File deleted: ${params.path}`,
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

