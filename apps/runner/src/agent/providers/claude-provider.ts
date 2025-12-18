import axios, { AxiosError } from "axios";
import { AgentThought, LLMProvider, RetryConfig } from "./base-provider.js";

export class ClaudeProvider implements LLMProvider {
  private bridgeUrl: string;
  private model: string;
  private retryConfig: RetryConfig;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // Minimum ms between requests

  constructor() {
    this.bridgeUrl = process.env.CLAUDE_BRIDGE_URL || "http://localhost:8001";
    this.model = process.env.CLAUDE_MODEL || "claude-haiku-4-5-20251001";
    this.retryConfig = {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
    };

    // Log initialization
    console.log(`Claude Bridge Provider initialized: ${this.model} (bridge: ${this.bridgeUrl})`);
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
    // HTTP status errors
    const status = error.response?.status || error.status;
    if (status === 429) return true; // Rate limit
    if (status === 529) return true; // Overloaded
    if (status >= 500) return true; // Server errors

    // Network errors
    if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") return true;

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

        // Call Claude bridge
        const enhancedSystemPrompt = `${systemPrompt}

CRITICAL: You MUST respond with ONLY valid JSON. No markdown, no explanations outside JSON, no code blocks.
Your entire response must be parseable as JSON following the exact schema provided above.`;

        const response = await axios.post(`${this.bridgeUrl}/v1/messages`, {
          model: this.model,
          max_tokens: 4096,
          temperature: 0.1,
          messages: [
            { role: 'system', content: enhancedSystemPrompt },
            ...messages
          ]
        }, {
          headers: {
            'Content-Type': 'application/json'
          }
        });

        // Extract content from bridge response
        const content = response.data.content
          .filter((block: any) => block.type === 'text')
          .map((block: any) => block.text)
          .join('');

        return this.parseThought(content);
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Log the error concisely
        const status = error.response?.status || error.status;
        console.error(`Claude Bridge error (attempt ${attempt}/${this.retryConfig.maxRetries}): ${status || error.code} - ${error.message || error}`);

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw new Error(`Non-retryable Claude API error: ${error.message || error}`);
        }

        // Check if we've exhausted retries
        if (attempt >= this.retryConfig.maxRetries) {
          throw new Error(
            `Claude Bridge failed after ${this.retryConfig.maxRetries} attempts: ${lastError.message}`,
          );
        }

        // Calculate delay
        const delayMs = this.getRetryDelay(attempt);

        console.log(`Retrying in ${(delayMs / 1000).toFixed(1)}s...`);
        await this.delay(delayMs);
      }
    }

    throw new Error(
      `Failed to call Claude Bridge after all retries: ${lastError?.message}`,
    );
  }

  private parseThought(content: string): AgentThought {
    try {
      let jsonStr = content.trim();
      
      const codeBlockMatch = content.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      } else {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonStr = jsonMatch[0];
        }
      }
      
      const parsed = JSON.parse(jsonStr);
      
      if (!parsed.reasoning) {
        parsed.reasoning = "No reasoning provided";
      }
      
      return parsed;
    } catch (error) {
      console.error("Failed to parse Claude response:", error);
      console.error("Response content:", content);
      
      return {
        reasoning: "Failed to parse LLM response - response was not in valid JSON format",
        finished: true,
        finalAnswer: "Unable to parse response - please check logs for details",
      };
    }
  }
}
