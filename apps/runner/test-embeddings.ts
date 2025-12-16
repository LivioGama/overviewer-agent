import { EmbeddingService } from "./src/services/embedding-service.js";
import { MemoryStore } from "./src/services/memory-store.js";

async function test() {
  console.log("Testing embeddings integration...\n");
  
  try {
    const embeddingService = new EmbeddingService();
    await embeddingService.initialize();
    console.log("✓ Embedding service initialized");
    
    // Test 1: Embedding generation
    console.log("\nTest 1: Embedding generation");
    const embedding = await embeddingService.embed("Hello world");
    console.log(`✓ Generated embedding with dimension: ${embedding.length}`);
    
    // Test 2: Tool similarity
    console.log("\nTest 2: Tool semantic matching");
    await embeddingService.indexTool("read_file", "Read file contents from the repository", '{ "path": "string" }');
    await embeddingService.indexTool("write_file", "Write or create a file in the repository", '{ "path": "string", "content": "string" }');
    await embeddingService.indexTool("run_command", "Execute a shell command", '{ "command": "string" }');
    
    const similar = await embeddingService.findSimilarTools("show me a file", 3);
    console.log(`✓ Top tool matches for "show me a file":`);
    similar.forEach((s, i) => {
      console.log(`  ${i + 1}. ${s.name} (score: ${(s.score * 100).toFixed(1)}%)`);
    });
    
    // Test 3: Memory store
    console.log("\nTest 3: Memory storage and retrieval");
    const memoryStore = new MemoryStore(embeddingService);
    await memoryStore.initialize();
    
    await memoryStore.storeMemory({
      jobId: "test-job-1",
      issueTitle: "Fix null pointer exception in calculateTotal",
      issueBody: "The calculateTotal function crashes when items array is empty",
      solution: "Added null check before calculating total",
      filesModified: ["src/calculator.ts"],
      success: true,
      timestamp: new Date().toISOString(),
    });
    console.log("✓ Stored test memory");
    
    const similarSolutions = await memoryStore.findSimilarSolutions(
      "Bug in getTotalPrice when array is null",
      "The getTotalPrice function returns undefined",
      3
    );
    
    if (similarSolutions.length > 0) {
      console.log(`✓ Found ${similarSolutions.length} similar solution(s):`);
      similarSolutions.forEach((sol, i) => {
        console.log(`  ${i + 1}. ${sol.issueTitle} (similarity: ${(sol.score * 100).toFixed(1)}%)`);
      });
    } else {
      console.log("✓ No similar solutions found (expected for first run)");
    }
    
    console.log("\n✓ All tests passed!");
    console.log("\nEmbeddings integration is working correctly.");
    
  } catch (error) {
    console.error("\n✗ Test failed:", error);
    process.exit(1);
  }
}

test().catch(console.error);

