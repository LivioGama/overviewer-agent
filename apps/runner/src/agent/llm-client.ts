import axios from "axios";
import { Tool } from "../tools/index.js";

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
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private maxTokens: number;
  private temperature: number;
  private historyWindow: number;

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
    // Default to a lower-cost model but allow override via env
    this.model = process.env.OPENAI_MODEL || "gpt-4o-mini";
    this.maxTokens = Number(process.env.OPENAI_MAX_TOKENS || 500);
    this.temperature = Number(process.env.OPENAI_TEMPERATURE || 0.1);
    this.historyWindow = Math.max(1, Number(process.env.HISTORY_WINDOW || 8));
  }

  async generateThought(
    systemPrompt: string,
    conversationHistory: Array<{ role: string; content: string }>,
  ): Promise<AgentThought> {
    try {
      // Keep only the most recent messages to cap token usage
      const trimmedHistory = conversationHistory.slice(-this.historyWindow);

      const response = await axios.post(
        `${this.baseUrl}/chat/completions`,
        {
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            ...trimmedHistory,
          ],
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          // Prefer structured output to reduce retries/parsing errors
          response_format: { type: "json_object" },
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      const content = response.data.choices[0].message.content;
      return this.parseThought(content);
    } catch (error) {
      console.error("LLM API call failed:", error);
      throw new Error("Failed to call LLM API");
    }
  }

  private parseThought(content: string): AgentThought {
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          reasoning: content,
          finished: true,
          finalAnswer: "Unable to parse response",
        };
      }
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      return {
        reasoning: content,
        finished: true,
        finalAnswer: content,
      };
    }
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

