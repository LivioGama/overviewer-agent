import axios, { AxiosError } from "axios";
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

interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export class LLMClient {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private retryConfig: RetryConfig;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // Minimum ms between requests

  constructor() {
    this.apiKey = process.env.OLLAMA_API_KEY || "";
    this.baseUrl = process.env.OLLAMA_API_URL || "https://ollama.com/api";
    this.model = process.env.OLLAMA_MODEL || "glm-4.6";
    this.retryConfig = {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
    };
 
    // Log initialization
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🔧 LLMClient Initialization");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`Base URL: ${this.baseUrl}`);
    console.log(`Model: ${this.model}`);
    console.log(`API Key Set: ${this.apiKey ? "✅ YES" : "❌ NO"}`);
    console.log(`API Key Length: ${this.apiKey?.length || 0} chars`);
    console.log("═══════════════════════════════════════════════════════════");
  }

  private async delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async enforceRateLimit(): Promise<void> {
    const timeSinceLastRequest = Date.now() - this.lastRequestTime;
    if (timeSinceLastRequest < this.minRequestInterval) {
      await this.delay(this.minRequestInterval - timeSinceLastRequest);
    }
    this.lastRequestTime = Date.now();
  }

  private getRetryDelay(
    attemptNumber: number,
    retryAfterHeader?: string,
  ): number {
    // If server provided a Retry-After header, use it
    if (retryAfterHeader) {
      const retryAfterSeconds = parseInt(retryAfterHeader, 10);
      if (!isNaN(retryAfterSeconds)) {
        return retryAfterSeconds * 1000;
      }
    }

    // Exponential backoff with jitter
    const exponentialDelay = Math.min(
      this.retryConfig.initialDelayMs *
        Math.pow(this.retryConfig.backoffMultiplier, attemptNumber - 1),
      this.retryConfig.maxDelayMs,
    );

    // Add jitter (±20%)
    const jitter = exponentialDelay * 0.2 * (Math.random() * 2 - 1);
    return exponentialDelay + jitter;
  }

  private isRetryableError(error: AxiosError): boolean {
    const status = error.response?.status;

    // 429: Too Many Requests - Always retry
    if (status === 429) return true;

    // 503: Service Unavailable - Retry
    if (status === 503) return true;

    // 500-599: Server errors - Retry with caution
    if (status && status >= 500 && status < 600) return true;

    // Network errors - Retry
    if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT") return true;

    return false;
  }

  async generateThought(
    systemPrompt: string,
    conversationHistory: Array<{ role: string; content: string }>,
  ): Promise<AgentThought> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        // Enforce local rate limiting
        await this.enforceRateLimit();

        // Build the request URL and payload
        const url = `${this.baseUrl}/chat`;
        const payload = {
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
          ],
          temperature: 0.1,
          stream: false,
        };

        // Log request details for debugging
        console.log(`[LLM Request] URL: ${url}`);
        console.log(`[LLM Request] Model: ${this.model}`);
        console.log(`[LLM Request] Has API Key: ${this.apiKey ? "yes" : "NO - MISSING!"}`);

        const response = await axios.post(
          url,
          payload,
          {
            timeout: 30000, // 30 second timeout
            headers: {
              Authorization: `Bearer ${this.apiKey}`,
              "Content-Type": "application/json",
            },
          },
        );

        console.log(`[LLM Response] Success - received response from ${this.baseUrl}`);
        const content = response.data.choices[0].message.content;
        return this.parseThought(content);
      } catch (error) {
        const axiosError = error as AxiosError;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Log the error
        const status = axiosError.response?.status;
        console.error(`[Attempt ${attempt}/${this.retryConfig.maxRetries}] LLM API call failed:`, {
          status,
          statusText: axiosError.response?.statusText,
          message: axiosError.message,
          code: axiosError.code,
        });

        // Check if error is retryable
        if (!this.isRetryableError(axiosError)) {
          console.error(
            "Non-retryable error, giving up:",
            axiosError.message,
          );
          throw new Error(`Failed to call LLM API: ${axiosError.message}`);
        }

        // Check if we've exhausted retries
        if (attempt >= this.retryConfig.maxRetries) {
          console.error(
            `Exhausted all ${this.retryConfig.maxRetries} retry attempts`,
          );
          throw new Error(
            `Failed to call LLM API after ${this.retryConfig.maxRetries} attempts: ${lastError.message}`,
          );
        }

        // Calculate delay
        const retryAfter = axiosError.response?.headers[
          "retry-after"
        ] as string | undefined;
        const delayMs = this.getRetryDelay(attempt, retryAfter);

        console.log(
          `Retrying in ${(delayMs / 1000).toFixed(1)}s (attempt ${attempt + 1}/${this.retryConfig.maxRetries})...`,
        );
        await this.delay(delayMs);
      }
    }

    throw new Error(
      `Failed to call LLM API after all retries: ${lastError?.message}`,
    );
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

