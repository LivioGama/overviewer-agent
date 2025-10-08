import { promises as fs } from "fs";
import path from "path";
import { Tool, ToolContext, ToolResult } from "./types.js";

export const moveFileTool: Tool = {
  name: "move_file",
  description: "Move or rename a file in the repository",
  parameters: {
    from: {
      type: "string",
      description: "Current path of the file",
      required: true,
    },
    to: {
      type: "string",
      description: "New path for the file",
      required: true,
    },
  },
  async execute(params: { from: string; to: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const fromPath = path.join(context.workspace, params.from);
      const toPath = path.join(context.workspace, params.to);
      const toDir = path.dirname(toPath);
      await fs.mkdir(toDir, { recursive: true });
      await fs.rename(fromPath, toPath);
      return {
        success: true,
        output: `File moved: ${params.from} -> ${params.to}`,
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

