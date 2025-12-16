import { Tool } from "../tools/index.js";
import { LLMProvider, OpenAIProvider, ClaudeProvider } from "./providers/index.js";

export interface AgentThought {
  reasoning: string;
  action?: {
    tool: string;
    parameters: Record<string, any>;
  };
  finished?: boolean;
  finalAnswer?: string;
}

export class LLMClient {
  private provider: LLMProvider;

  constructor() {
    const providerType = process.env.LLM_PROVIDER || "openai";

    switch (providerType.toLowerCase()) {
      case "openai":
        this.provider = new OpenAIProvider();
        break;
      case "claude":
        this.provider = new ClaudeProvider();
        break;
      default:
        throw new Error(`Unsupported LLM provider: ${providerType}. Supported: openai, claude`);
    }

    console.log(`LLM Client initialized with provider: ${providerType}`);
  }

  async generateThought(
    systemPrompt: string,
    conversationHistory: Array<{ role: string; content: string }>,
  ): Promise<AgentThought> {
    return this.provider.generateThought(systemPrompt, conversationHistory);
  }

  buildSystemPrompt(tools: Tool[]): string {
    const toolDescriptions = tools
      .map(
        (tool) => `
### ${tool.name}
${tool.description}

Parameters:
${Object.entries(tool.parameters)
  .map(
    ([name, param]) =>
      `- ${name} (${param.type}${param.required ? ", required" : ""}): ${param.description}`,
  )
  .join("\n")}`,
      )
      .join("\n");

    return `You are an autonomous AI agent that solves GitHub issues by analyzing code and making changes.

You have access to tools that let you interact with a repository. Your job is to:
1. Understand the issue
2. Explore the repository to understand its structure
3. Make necessary changes to fix the issue
4. Validate your changes

## Available Tools

${toolDescriptions}

## Response Format

You must respond in JSON format with ONE of these structures:

### When you need to take an action:
{
  "reasoning": "Explain your thinking about what you need to do next",
  "action": {
    "tool": "tool_name",
    "parameters": {
      "param1": "value1",
      "param2": "value2"
    }
  }
}

### When you're done:
{
  "reasoning": "Explain what you accomplished",
  "finished": true,
  "finalAnswer": "Summary of changes made and how they address the issue"
}

## Guidelines

- Start by exploring the repository structure using list_directory
- Read relevant files to understand the codebase
- Make changes incrementally and validate as you go
- Use search_code to find relevant code patterns
- Run tests after making changes to ensure nothing breaks
- Be autonomous - make decisions and take actions without asking for permission
- Focus on solving the specific issue, don't over-engineer
- Comment on the issue to keep users informed of your progress

## Important Rules

- NEVER make assumptions about file locations - always explore first
- ALWAYS read a file before modifying it
- NEVER generate placeholder or incomplete code
- ALWAYS preserve existing functionality when making changes
- Use run_command to test your changes (npm test, tsc, etc.)
- If tests fail, iterate and fix the issues

Remember: You are a skilled software engineer. Be confident, make decisions, and solve the problem.`;
  }
}

