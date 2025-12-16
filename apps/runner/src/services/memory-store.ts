import { EmbeddingService } from "./embedding-service.js";

interface MemoryEntry {
  jobId: string;
  issueTitle: string;
  issueBody: string;
  solution: string;
  filesModified: string[];
  success: boolean;
  timestamp: string;
}

export class MemoryStore {
  private embeddingService: EmbeddingService;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  async initialize() {
    await this.createMemorySchema();
  }

  private async createMemorySchema() {
    const schemaConfig = {
      class: "Memory",
      vectorizer: "none",
      properties: [
        { name: "jobId", dataType: ["string"] },
        { name: "issueTitle", dataType: ["string"] },
        { name: "issueBody", dataType: ["text"] },
        { name: "solution", dataType: ["text"] },
        { name: "filesModified", dataType: ["text[]"] },
        { name: "success", dataType: ["boolean"] },
        { name: "timestamp", dataType: ["string"] },
      ],
    };

    try {
      await this.embeddingService.client.schema
        .classCreator()
        .withClass(schemaConfig)
        .do();
      console.log("Memory schema created");
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        console.log("Memory schema already exists");
      } else {
        console.log("Memory schema exists or error:", error.message);
      }
    }
  }

  async storeMemory(entry: MemoryEntry) {
    const memoryText = `Issue: ${entry.issueTitle}. Solution: ${entry.solution}`;
    const embedding = await this.embeddingService.embed(memoryText);

    const properties: { [key: string]: unknown } = {
      jobId: entry.jobId,
      issueTitle: entry.issueTitle,
      issueBody: entry.issueBody,
      solution: entry.solution,
      filesModified: entry.filesModified,
      success: entry.success,
      timestamp: entry.timestamp,
    };

    await this.embeddingService.client.data
      .creator()
      .withClassName("Memory")
      .withProperties(properties)
      .withVector(embedding)
      .do();

    console.log(`Memory stored for job ${entry.jobId}`);
  }

  async findSimilarSolutions(
    issueTitle: string,
    issueBody: string,
    limit = 3
  ): Promise<Array<MemoryEntry & { score: number }>> {
    const query = `${issueTitle}. ${issueBody}`;
    const queryEmbedding = await this.embeddingService.embed(query);

    const result = await this.embeddingService.client.graphql
      .get()
      .withClassName("Memory")
      .withFields("jobId issueTitle solution filesModified success timestamp _additional { distance }")
      .withNearVector({ vector: queryEmbedding })
      .withWhere({
        path: ["success"],
        operator: "Equal",
        valueBoolean: true,
      })
      .withLimit(limit)
      .do();

    if (!result.data?.Get?.Memory) {
      return [];
    }

    return result.data.Get.Memory.map((item: any): MemoryEntry & { score: number } => ({
      jobId: item.jobId,
      issueTitle: item.issueTitle,
      issueBody: "",
      solution: item.solution,
      filesModified: item.filesModified || [],
      success: item.success,
      timestamp: item.timestamp,
      score: 1 - item._additional.distance,
    }));
  }
}

