import { exec } from "child_process";
import { promisify } from "util";
import { Tool, ToolContext, ToolResult } from "./types.js";

const execAsync = promisify(exec);

export const runCommandTool: Tool = {
  name: "run_command",
  description: "Execute a shell command in the repository directory",
  parameters: {
    command: {
      type: "string",
      description: "Shell command to execute",
      required: true,
    },
    timeout: {
      type: "number",
      description: "Timeout in milliseconds (default: 30000)",
      required: false,
    },
  },
  async execute(params: { command: string; timeout?: number }, context: ToolContext): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await execAsync(params.command, {
        cwd: context.workspace,
        timeout: params.timeout || 30000,
        maxBuffer: 1024 * 1024,
      });
      return {
        success: true,
        output: stdout + (stderr ? `\nSTDERR:\n${stderr}` : ""),
      };
    } catch (error: any) {
      return {
        success: false,
        output: error.stdout || "",
        error: error.message + (error.stderr ? `\n${error.stderr}` : ""),
      };
    }
  },
};

