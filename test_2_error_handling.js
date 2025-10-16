// Test 2: Error Handling
const API_URL = "https://ollama.com/api";
const API_KEY = "bf6c1e7b756a447a974651b9967826c2.5OrJ-h7sx3Nl9U747FYjj3na";

async function runTest(testName, model, messages) {
  console.log(`\n--- ${testName} ---`);
  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.1,
        stream: false
      })
    });

    console.log(`Status: ${response.status} ${response.statusText}`);
    const data = await response.json();
    
    if (data.message) {
      console.log(`✅ Response: ${data.message.content.substring(0, 50)}...`);
    } else if (data.error) {
      console.log(`❌ Error: ${data.error}`);
    } else {
      console.log(`Response keys: ${Object.keys(data)}`);
    }
  } catch (error) {
    console.log(`❌ Exception: ${error.message}`);
  }
}

async function test() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("TEST 2: Error Handling & Edge Cases");
  console.log("═══════════════════════════════════════════════════════════");

  // Valid request
  await runTest("Valid Request", "glm-4.6", [
    { role: "user", content: "Hello" }
  ]);

  // Long message
  await runTest("Long Message", "glm-4.6", [
    { role: "user", content: "Explain quantum computing: " + "a".repeat(1000) }
  ]);

  // Empty message
  await runTest("Empty Message", "glm-4.6", [
    { role: "user", content: "" }
  ]);

  // Invalid model
  await runTest("Invalid Model", "non-existent-model", [
    { role: "user", content: "Hello" }
  ]);

  // Multiple messages
  await runTest("Multiple Messages", "glm-4.6", [
    { role: "system", content: "You are helpful" },
    { role: "user", content: "First message" },
    { role: "assistant", content: "Response" },
    { role: "user", content: "Second message" }
  ]);

  console.log("\n═══════════════════════════════════════════════════════════");
}

test();
