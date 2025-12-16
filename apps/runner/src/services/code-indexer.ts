import { promises as fs } from "fs";
import path from "path";
import { EmbeddingService } from "./embedding-service.js";

export class CodeIndexer {
  private embeddingService: EmbeddingService;

  constructor(embeddingService: EmbeddingService) {
    this.embeddingService = embeddingService;
  }

  async indexRepository(workspace: string) {
    await this.createCodeIndexSchema();
    const files = await this.scanDirectory(workspace);
    
    console.log(`Indexing ${files.length} code files...`);
    for (const file of files) {
      await this.indexFile(workspace, file);
    }
    console.log(`Code indexing complete`);
  }

  private async createCodeIndexSchema() {
    const schemaConfig = {
      class: "CodeFile",
      vectorizer: "none",
      properties: [
        { name: "path", dataType: ["string"] },
        { name: "content", dataType: ["text"] },
        { name: "language", dataType: ["string"] },
        { name: "functions", dataType: ["text[]"] },
      ],
    };

    try {
      await this.embeddingService.client.schema
        .classCreator()
        .withClass(schemaConfig)
        .do();
      console.log("CodeFile schema created");
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        console.log("CodeFile schema already exists");
      } else {
        console.log("CodeFile schema exists or error:", error.message);
      }
    }
  }

  private async scanDirectory(dir: string, fileList: string[] = []): Promise<string[]> {
    const files = await fs.readdir(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = await fs.stat(filePath);

      if (stat.isDirectory()) {
        if (!file.startsWith(".") && file !== "node_modules" && file !== "dist") {
          await this.scanDirectory(filePath, fileList);
        }
      } else if (this.isCodeFile(file)) {
        fileList.push(filePath);
      }
    }

    return fileList;
  }

  private isCodeFile(filename: string): boolean {
    const codeExtensions = [".ts", ".js", ".tsx", ".jsx", ".py", ".go", ".rs", ".java"];
    return codeExtensions.some((ext) => filename.endsWith(ext));
  }

  private async indexFile(workspace: string, filePath: string) {
    const content = await fs.readFile(filePath, "utf-8");
    const relativePath = path.relative(workspace, filePath);
    const language = path.extname(filePath).slice(1);

    const functions = this.extractFunctions(content);
    const summary = `File: ${relativePath}. Functions: ${functions.join(", ")}`;

    const embedding = await this.embeddingService.embed(summary);

    await this.embeddingService.client.data
      .creator()
      .withClassName("CodeFile")
      .withProperties({
        path: relativePath,
        content: content.slice(0, 5000),
        language,
        functions,
      })
      .withVector(embedding)
      .do();
  }

  private extractFunctions(content: string): string[] {
    const functionRegex = /(?:function|const|let|var)\s+(\w+)|(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
    const functions: string[] = [];
    let match;

    while ((match = functionRegex.exec(content)) !== null) {
      functions.push(match[1] || match[2]);
    }

    return functions.slice(0, 20);
  }

  async searchCode(query: string, limit = 5): Promise<Array<{ path: string; score: number }>> {
    const queryEmbedding = await this.embeddingService.embed(query);

    const result = await this.embeddingService.client.graphql
      .get()
      .withClassName("CodeFile")
      .withFields("path _additional { distance }")
      .withNearVector({ vector: queryEmbedding })
      .withLimit(limit)
      .do();

    return result.data.Get.CodeFile.map((item: any) => ({
      path: item.path,
      score: 1 - item._additional.distance,
    }));
  }
}

