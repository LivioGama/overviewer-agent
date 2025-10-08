import { promises as fs } from "fs";
import path from "path";
import { Tool, ToolContext, ToolResult } from "./types.js";

export const listDirectoryTool: Tool = {
  name: "list_directory",
  description: "List files and directories in a given path",
  parameters: {
    path: {
      type: "string",
      description: "Relative path to the directory from the repository root (use '.' for root)",
      required: true,
    },
    recursive: {
      type: "boolean",
      description: "Whether to list files recursively",
      required: false,
    },
  },
  async execute(params: { path: string; recursive?: boolean }, context: ToolContext): Promise<ToolResult> {
    try {
      const dirPath = path.join(context.workspace, params.path);
      const files: string[] = [];

      const scanDir = async (currentPath: string, relativePath: string) => {
        const entries = await fs.readdir(currentPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith(".")) continue;
          if (["node_modules", "dist", "build", ".git", ".next", "__pycache__"].includes(entry.name)) continue;
          
          const entryRelativePath = path.join(relativePath, entry.name);
          const entryFullPath = path.join(currentPath, entry.name);
          
          if (entry.isDirectory()) {
            files.push(`${entryRelativePath}/`);
            if (params.recursive) {
              await scanDir(entryFullPath, entryRelativePath);
            }
          } else {
            files.push(entryRelativePath);
          }
        }
      };

      await scanDir(dirPath, "");
      return {
        success: true,
        output: files.join("\n"),
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

