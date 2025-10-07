import axios from "axios";
import { createHash } from "crypto";
import { promises as fs } from "fs";
import path from "path";

interface EmbeddingCache {
  [fileHash: string]: {
    embedding: number[];
    timestamp: number;
    fileId: string;
  };
}

interface FileWithEmbedding {
  path: string;
  content: string;
  embedding: number[];
}

export class EmbeddingService {
  private apiKey: string;
  private baseUrl: string;
  private cache: EmbeddingCache = {};
  private cacheFile: string;
  private model = "text-embedding-3-small";

  constructor(workspacePath: string) {
    this.apiKey = process.env.OPENAI_API_KEY || "";
    this.baseUrl = "https://api.openai.com/v1";
    this.cacheFile = path.join(workspacePath, ".embedding-cache.json");
    this.loadCache();
  }

  async embedText(text: string, fileId: string): Promise<number[]> {
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
        fileId,
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
  ): Promise<FileWithEmbedding[]> {
    const filesWithEmbeddings: FileWithEmbedding[] = [];

    const batchSize = 10;
    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      const embeddings = await Promise.all(
        batch.map(async (file) => {
          try {
            const textToEmbed = `File: ${file.path}\n\n${file.content.slice(0, 8000)}`;
            const embedding = await this.embedText(textToEmbed, file.path);
            return { ...file, embedding };
          } catch (error) {
            console.error(`Failed to embed file ${file.path}:`, error);
            return null;
          }
        }),
      );

      filesWithEmbeddings.push(
        ...embeddings.filter((e) => e !== null) as FileWithEmbedding[],
      );
    }

    return filesWithEmbeddings;
  }

  async findRelevantFiles(
    issueDescription: string,
    files: Array<{ path: string; content: string }>,
    topK = 5,
  ): Promise<Array<{ path: string; content: string; score: number }>> {
    const issueEmbedding = await this.embedText(
      issueDescription,
      "query:" + this.hashContent(issueDescription),
    );

    const filesWithEmbeddings = await this.embedFiles(files);

    const scoredFiles = filesWithEmbeddings.map((file) => ({
      path: file.path,
      content: file.content,
      score: this.cosineSimilarity(issueEmbedding, file.embedding),
    }));

    return scoredFiles.sort((a, b) => b.score - a.score).slice(0, topK);
  }

  cosineSimilarity(a: number[], b: number[]): number {
    const dotProduct = a.reduce((sum, val, i) => sum + val * (b[i] ?? 0), 0);
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
      if (this.cache[key]?.timestamp && this.cache[key].timestamp < threeDaysAgo) {
        delete this.cache[key];
      }
    });

    await this.saveCache();
  }
}

