export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, {
    type: string;
    description: string;
    required?: boolean;
  }>;
  execute: (params: any, context: ToolContext) => Promise<ToolResult>;
}

export interface ToolContext {
  workspace: string;
  repoOwner: string;
  repoName: string;
  issueNumber?: number;
  octokit: any;
  codeIndexer?: any;
}

export interface ToolResult {
  success: boolean;
  output: string;
  error?: string;
}

export interface ToolCall {
  tool: string;
  parameters: Record<string, any>;
}

