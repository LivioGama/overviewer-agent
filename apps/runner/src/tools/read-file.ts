import { promises as fs } from "fs";
import path from "path";
import { Tool, ToolContext, ToolResult } from "./types.js";

export const readFileTool: Tool = {
  name: "read_file",
  description: "Read the contents of a file in the repository",
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
      const content = await fs.readFile(filePath, "utf-8");
      return {
        success: true,
        output: content,
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

