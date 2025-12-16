import { EmbeddingService } from "./embedding-service.js";

interface ConversationEntry {
  role: string;
  content: string;
  embedding?: number[];
  importance?: number;
}

export class ContextManager {
  private embeddingService: EmbeddingService;
  private maxTokens = 8000;
  private estimatedTokensPerChar = 0.25;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  async compressHistory(
    history: Array<{ role: string; content: string }>,
    currentGoal: string
  ): Promise<Array<{ role: string; content: string }>> {
    if (this.estimateTokens(history) < this.maxTokens) {
      return history;
    }

    console.log("Context too large, compressing...");

    const goalEmbedding = await this.embeddingService.embed(currentGoal);

    const scoredHistory: ConversationEntry[] = [];
    for (const entry of history) {
      const embedding = await this.embeddingService.embed(entry.content);
      const similarity = this.cosineSimilarity(goalEmbedding, embedding);
      
      scoredHistory.push({
        ...entry,
        embedding,
        importance: similarity,
      });
    }

    scoredHistory.sort((a, b) => (b.importance || 0) - (a.importance || 0));

    const compressed: Array<{ role: string; content: string }> = [];
    let currentTokens = 0;

    for (const entry of scoredHistory) {
      const entryTokens = this.estimateTokens([entry]);
      if (currentTokens + entryTokens > this.maxTokens * 0.7) break;

      compressed.push({ role: entry.role, content: entry.content });
      currentTokens += entryTokens;
    }

    compressed.sort((a, b) => {
      const aIndex = history.findIndex((h) => h.content === a.content);
      const bIndex = history.findIndex((h) => h.content === b.content);
      return aIndex - bIndex;
    });

    console.log(`Compressed history from ${history.length} to ${compressed.length} entries`);
    return compressed;
  }

  private estimateTokens(history: Array<{ role: string; content: string }>): number {
    const totalChars = history.reduce((sum, entry) => sum + entry.content.length, 0);
    return Math.ceil(totalChars * this.estimatedTokensPerChar);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }
}

