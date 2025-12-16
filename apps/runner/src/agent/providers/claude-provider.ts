import Anthropic from "@anthropic-ai/sdk";
import { AgentThought, LLMProvider, RetryConfig } from "./base-provider.js";

export class ClaudeProvider implements LLMProvider {
  private client: Anthropic;
  private model: string;
  private retryConfig: RetryConfig;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // Minimum ms between requests

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is required for Claude provider");
    }

    this.client = new Anthropic({
      apiKey: apiKey,
    });

    this.model = process.env.CLAUDE_MODEL || "claude-3-5-haiku-20241022";
    this.retryConfig = {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
    };

    // Log initialization
    console.log(`Claude Provider initialized: ${this.model}`);
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

  private getRetryDelay(attemptNumber: number): number {
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

  private isRetryableError(error: any): boolean {
    // Anthropic API errors
    if (error.status === 429) return true; // Rate limit
    if (error.status === 529) return true; // Overloaded
    if (error.status >= 500) return true; // Server errors

    // Network errors
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

        // Convert conversation history to Claude format
        // Claude uses different role names and system prompt is separate
        const messages = conversationHistory.map(msg => ({
          role: msg.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: msg.content,
        }));

        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 4096,
          system: systemPrompt,
          messages: messages,
          temperature: 0.1,
        });

        // Extract content from Claude response
        const content = response.content
          .filter((block): block is Anthropic.TextBlock => block.type === 'text')
          .map((block) => block.text)
          .join('');

        return this.parseThought(content);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Log the error concisely
        const status = error.status || error.response?.status;
        console.error(`Claude API error (attempt ${attempt}/${this.retryConfig.maxRetries}): ${status || error.code} - ${error.message || error}`);

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw new Error(`Non-retryable Claude API error: ${error.message || error}`);
        }

        // Check if we've exhausted retries
        if (attempt >= this.retryConfig.maxRetries) {
          throw new Error(
            `Claude API failed after ${this.retryConfig.maxRetries} attempts: ${lastError.message}`,
          );
        }

        // Calculate delay
        const delayMs = this.getRetryDelay(attempt);

        console.log(`Retrying in ${(delayMs / 1000).toFixed(1)}s...`);
        await this.delay(delayMs);
      }
    }

    throw new Error(
      `Failed to call Claude API after all retries: ${lastError?.message}`,
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
}
