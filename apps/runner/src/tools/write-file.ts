import { promises as fs } from "fs";
import path from "path";
import { Tool, ToolContext, ToolResult } from "./types.js";

export const writeFileTool: Tool = {
  name: "write_file",
  description: "Write or create a file in the repository",
  parameters: {
    path: {
      type: "string",
      description: "Relative path to the file from the repository root",
      required: true,
    },
    content: {
      type: "string",
      description: "Content to write to the file",
      required: true,
    },
  },
  async execute(params: { path: string; content: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const filePath = path.join(context.workspace, params.path);
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, params.content, "utf-8");
      return {
        success: true,
        output: `File written successfully: ${params.path}`,
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

