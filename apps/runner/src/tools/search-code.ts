import { promises as fs } from "fs";
import path from "path";
import { Tool, ToolContext, ToolResult } from "./types.js";

export const searchCodeTool: Tool = {
  name: "search_code",
  description: "Search for a pattern in code files",
  parameters: {
    pattern: {
      type: "string",
      description: "Text pattern or regex to search for",
      required: true,
    },
    filePattern: {
      type: "string",
      description: "File pattern to search (e.g., '*.ts', '*.js')",
      required: false,
    },
  },
  async execute(params: { pattern: string; filePattern?: string }, context: ToolContext): Promise<ToolResult> {
    try {
      const results: string[] = [];
      const regex = new RegExp(params.pattern, "gi");

      const searchDir = async (dirPath: string, relativePath: string) => {
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith(".")) continue;
          if (["node_modules", "dist", "build", ".git", ".next", "__pycache__"].includes(entry.name)) continue;
          
          const entryFullPath = path.join(dirPath, entry.name);
          const entryRelativePath = path.join(relativePath, entry.name);
          
          if (entry.isDirectory()) {
            await searchDir(entryFullPath, entryRelativePath);
          } else {
            if (params.filePattern) {
              const pattern = params.filePattern.replace("*", ".*");
              if (!new RegExp(pattern).test(entry.name)) continue;
            }
            
            try {
              const content = await fs.readFile(entryFullPath, "utf-8");
              const matches = content.match(regex);
              if (matches) {
                results.push(`${entryRelativePath}: ${matches.length} match(es)`);
              }
            } catch {}
          }
        }
      };

      await searchDir(context.workspace, "");
      return {
        success: true,
        output: results.length > 0 ? results.join("\n") : "No matches found",
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

