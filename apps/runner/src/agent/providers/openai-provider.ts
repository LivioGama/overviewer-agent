import axios, { AxiosError } from "axios";
import { AgentThought, LLMProvider, RetryConfig } from "./base-provider.js";

export class OpenAIProvider implements LLMProvider {
  private apiKey: string;
  private baseUrl: string;
  private model: string;
  private retryConfig: RetryConfig;
  private lastRequestTime: number = 0;
  private minRequestInterval: number = 100; // Minimum ms between requests

  constructor() {
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.baseUrl = process.env.OPENAI_API_URL || "https://api.openai.com/v1";
    this.model = process.env.OPENAI_MODEL || "gpt-4o";
    this.retryConfig = {
      maxRetries: 5,
      initialDelayMs: 1000,
      maxDelayMs: 60000,
      backoffMultiplier: 2,
    };

    // Log initialization
    console.log(`OpenAI Provider initialized: ${this.model} (API Key: ${this.apiKey ? "✓" : "✗"})`);
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
        const url = `${this.baseUrl}/chat/completions`;
        const payload = {
          model: this.model,
          messages: [
            { role: "system", content: systemPrompt },
            ...conversationHistory,
          ],
          temperature: 0.1,
          stream: false,
        };

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

        // Try multiple response formats
        let content: string;

        if (response.data.choices && response.data.choices[0]?.message?.content) {
          // OpenAI-style response
          content = response.data.choices[0].message.content;
        } else if (response.data.message?.content) {
          // Ollama direct response format
          content = response.data.message.content;
        } else if (response.data.content) {
          // Simple content field
          content = response.data.content;
        } else if (typeof response.data === 'string') {
          // Plain string response
          content = response.data;
        } else {
          // Fallback: convert entire response to string
          console.error('LLM response format error:', Object.keys(response.data));
          throw new Error('Unable to extract content from LLM response - unexpected format');
        }

        return this.parseThought(content);
      } catch (error) {
        const axiosError = error as AxiosError;
        lastError = error instanceof Error ? error : new Error(String(error));

        // Log the error concisely
        const status = axiosError.response?.status;
        console.error(`OpenAI API error (attempt ${attempt}/${this.retryConfig.maxRetries}): ${status || axiosError.code} - ${axiosError.message}`);

        // Check if error is retryable
        if (!this.isRetryableError(axiosError)) {
          throw new Error(`Non-retryable OpenAI API error: ${axiosError.message}`);
        }

        // Check if we've exhausted retries
        if (attempt >= this.retryConfig.maxRetries) {
          throw new Error(
            `OpenAI API failed after ${this.retryConfig.maxRetries} attempts: ${lastError.message}`,
          );
        }

        // Calculate delay
        const retryAfter = axiosError.response?.headers[
          "retry-after"
        ] as string | undefined;
        const delayMs = this.getRetryDelay(attempt, retryAfter);

        console.log(`Retrying in ${(delayMs / 1000).toFixed(1)}s...`);
        await this.delay(delayMs);
      }
    }

    throw new Error(
      `Failed to call OpenAI API after all retries: ${lastError?.message}`,
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
      console.error("Failed to parse OpenAI response:", error);
      console.error("Response content:", content);
      
      return {
        reasoning: "Failed to parse LLM response - response was not in valid JSON format",
        finished: true,
        finalAnswer: "Unable to parse response - please check logs for details",
      };
    }
  }
}
