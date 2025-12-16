import axios from "axios";
import weaviate, { WeaviateClient } from "weaviate-ts-client";

interface EmbeddingResponse {
  embedding: number[];
}

export class EmbeddingService {
  public client: WeaviateClient;
  private apiKey: string;
  private model = "qwen/qwen3-embedding-4b";

  constructor() {
    this.apiKey = process.env.OPENROUTER_API_KEY || "";
    const weaviateUrl = process.env.WEAVIATE_URL || "http://localhost:8080";
    this.client = weaviate.client({
      scheme: weaviateUrl.startsWith("https") ? "https" : "http",
      host: weaviateUrl.replace(/^https?:\/\//, ""),
    });
  }

  async initialize() {
    await this.createToolRegistrySchema();
  }

  private async createToolRegistrySchema() {
    const schemaConfig = {
      class: "Tool",
      vectorizer: "none",
      properties: [
        { name: "name", dataType: ["string"] },
        { name: "description", dataType: ["text"] },
        { name: "usage", dataType: ["text"] },
      ],
    };

    try {
      await this.client.schema.classCreator().withClass(schemaConfig).do();
      console.log("Tool schema created");
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        console.log("Tool schema already exists");
      } else {
        console.log("Tool schema exists or error:", error.message);
      }
    }
  }

  async embed(text: string): Promise<number[]> {
    const response = await axios.post(
      "https://openrouter.ai/api/v1/embeddings",
      {
        model: this.model,
        input: text,
      },
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data.data[0].embedding;
  }

  async indexTool(name: string, description: string, usage: string) {
    const embedding = await this.embed(`${name}: ${description}. Usage: ${usage}`);

    await this.client.data
      .creator()
      .withClassName("Tool")
      .withProperties({ name, description, usage })
      .withVector(embedding)
      .do();
  }

  async findSimilarTools(query: string, limit = 3): Promise<Array<{ name: string; score: number }>> {
    const queryEmbedding = await this.embed(query);

    const result = await this.client.graphql
      .get()
      .withClassName("Tool")
      .withFields("name _additional { distance }")
      .withNearVector({ vector: queryEmbedding })
      .withLimit(limit)
      .do();

    return result.data.Get.Tool.map((item: any) => ({
      name: item.name,
      score: 1 - item._additional.distance,
    }));
  }
}

