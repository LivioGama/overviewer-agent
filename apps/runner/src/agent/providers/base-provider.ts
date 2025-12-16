export interface AgentThought {
  reasoning: string;
  action?: {
    tool: string;
    parameters: Record<string, any>;
  };
  finished?: boolean;
  finalAnswer?: string;
}

export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface LLMProvider {
  generateThought(
    systemPrompt: string,
    conversationHistory: Array<{ role: string; content: string }>
  ): Promise<AgentThought>;
}
