import axios from "axios";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import { CodeChunk, CodeChunker } from "./code-chunker.js";

interface EmbeddingCache {
  [chunkHash: string]: {
    embedding: number[];
    timestamp: number;
    chunkId: string;
  };
}

interface ChunkWithEmbedding extends CodeChunk {
  embedding: number[];
}

export class EmbeddingService {
  private apiKey: string;
  private baseUrl: string;
  private cache: EmbeddingCache = {};
  private cacheFile: string;
  private model = "text-embedding-3-small";
  private chunker: CodeChunker;

  constructor(workspacePath: string) {
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.baseUrl = "https://api.openai.com/v1";
    this.cacheFile = path.join(workspacePath, ".embedding-cache.json");
    this.chunker = new CodeChunker();
    this.loadCache();
  }

  async embedText(text: string, chunkId: string): Promise<number[]> {
    const hash = this.hashContent(text);

    if (this.cache[hash] && Date.now() - this.cache[hash].timestamp < 86400000) {
      return this.cache[hash].embedding;
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/embeddings`,
        {
          model: this.model,
          input: text.slice(0, 8000),
        },
        {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            "Content-Type": "application/json",
          },
          timeout: 10000,
        },
      );

      const embedding = response.data.data[0].embedding;

      this.cache[hash] = {
        embedding,
        timestamp: Date.now(),
        chunkId,
      };

      this.saveCache();
      return embedding;
    } catch (error) {
      console.error("Embedding API call failed:", error);
      throw error;
    }
  }

  async embedFiles(
    files: Array<{ path: string; content: string }>,
  ): Promise<ChunkWithEmbedding[]> {
    const allChunks: CodeChunk[] = [];

    for (const file of files) {
      try {
        const chunks = await this.chunker.chunkFile(file.path, file.content);
        allChunks.push(...chunks);
      } catch (error) {
        console.error(`Failed to chunk ${file.path}:`, error);
      }
    }

    console.log(`Created ${allChunks.length} code chunks from ${files.length} files`);

    const chunksWithEmbeddings: ChunkWithEmbedding[] = [];

    const batchSize = 10;
    for (let i = 0; i < allChunks.length; i += batchSize) {
      const batch = allChunks.slice(i, i + batchSize);

      const embeddings = await Promise.all(
        batch.map(async (chunk) => {
          try {
            const textToEmbed = this.chunker.formatChunkForEmbedding(chunk);
            const embedding = await this.embedText(textToEmbed, chunk.id);
            return { ...chunk, embedding };
          } catch (error) {
            console.error(`Failed to embed chunk ${chunk.id}:`, error);
            return null;
          }
        }),
      );

      chunksWithEmbeddings.push(
        ...embeddings.filter((e) => e !== null) as ChunkWithEmbedding[],
      );
    }

    return chunksWithEmbeddings;
  }

  async findRelevantChunks(
    issueDescription: string,
    files: Array<{ path: string; content: string }>,
    topK = 10,
  ): Promise<
    Array<{
      chunk: CodeChunk;
      score: number;
    }>
  > {
    const issueEmbedding = await this.embedText(
      issueDescription,
      "query:" + this.hashContent(issueDescription),
    );

    const chunksWithEmbeddings = await this.embedFiles(files);

    const scoredChunks = chunksWithEmbeddings.map((chunk) => ({
      chunk,
      score: this.cosineSimilarity(issueEmbedding, chunk.embedding),
    }));

    const topChunks = scoredChunks.sort((a, b) => b.score - a.score).slice(0, topK);

    return topChunks;
  }

  async findRelevantFiles(
    issueDescription: string,
    files: Array<{ path: string; content: string }>,
    topK = 5,
  ): Promise<Array<{ path: string; content: string; score: number }>> {
    const topChunks = await this.findRelevantChunks(
      issueDescription,
      files,
      topK * 2,
    );

    const fileScores = new Map<string, { score: number; chunks: CodeChunk[] }>();

    topChunks.forEach(({ chunk, score }) => {
      const existing = fileScores.get(chunk.filePath);
      if (existing) {
        existing.score = Math.max(existing.score, score);
        existing.chunks.push(chunk);
      } else {
        fileScores.set(chunk.filePath, { score, chunks: [chunk] });
      }
    });

    const rankedFiles = Array.from(fileScores.entries())
      .sort((a, b) => b[1].score - a[1].score)
      .slice(0, topK);

    return rankedFiles.map(([filePath, { score, chunks }]) => {
      const file = files.find((f) => f.path === filePath);
      const relevantContent = chunks
        .sort((a, b) => a.startLine - b.startLine)
        .map((c) => `\n// Lines ${c.startLine}-${c.endLine}: ${c.name}\n${c.content}`)
        .join("\n");

      return {
        path: filePath,
        content: relevantContent || file?.content || "",
        score,
      };
    });
  }

  cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * b[i], 0);
    const magnitudeA = Math.sqrt(a.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(b.reduce((sum, val) => sum + val * val, 0));
    return dotProduct / (magnitudeA * magnitudeB);
  }

  private hashContent(content: string): string {
    return createHash("sha256").update(content).digest("hex");
  }

  private async loadCache(): Promise<void> {
    try {
      const data = await fs.readFile(this.cacheFile, "utf-8");
      this.cache = JSON.parse(data);
    } catch {
    }
  }

  private async saveCache(): Promise<void> {
    try {
      await fs.writeFile(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error("Failed to save embedding cache:", error);
    }
  }

  async clearOldCache(): Promise<void> {
    const now = Date.now();
    const threeDaysAgo = now - 259200000;

    Object.keys(this.cache).forEach((key) => {
      if (this.cache[key].timestamp < threeDaysAgo) {
        delete this.cache[key];
      }
    });

    await this.saveCache();
  }
}

