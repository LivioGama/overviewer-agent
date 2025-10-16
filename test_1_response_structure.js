// Test 1: Investigate Full Response Structure
const API_URL = "https://ollama.com/api";
const API_KEY = "bf6c1e7b756a447a974651b9967826c2.5OrJ-h7sx3Nl9U747FYjj3na";
const MODEL = "glm-4.6";

async function test() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("TEST 1: Response Structure Investigation");
  console.log("═══════════════════════════════════════════════════════════");

  try {
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Say hello!" }
        ],
        temperature: 0.1,
        stream: false
      })
    });

    const data = await response.json();
    
    console.log("\n📋 FULL RESPONSE STRUCTURE:\n");
    console.log(JSON.stringify(data, null, 2));
    
    console.log("\n📊 RESPONSE KEYS:");
    console.log(Object.keys(data));
    
    console.log("\n🔍 KEY ANALYSIS:");
    if (data.choices) {
      console.log("✅ Has 'choices' field");
      console.log(`   - Length: ${data.choices.length}`);
      if (data.choices[0]) console.log(`   - First choice: ${JSON.stringify(data.choices[0], null, 2)}`);
    } else {
      console.log("❌ No 'choices' field");
    }
    
    if (data.message) {
      console.log("✅ Has 'message' field");
      console.log(`   - Content: ${data.message.content?.substring(0, 100)}...`);
    } else {
      console.log("❌ No 'message' field");
    }
    
    if (data.content) {
      console.log("✅ Has 'content' field");
      console.log(`   - Value: ${data.content?.substring(0, 100)}...`);
    } else {
      console.log("❌ No 'content' field");
    }
    
    if (data.response) {
      console.log("✅ Has 'response' field");
      console.log(`   - Value: ${data.response?.substring(0, 100)}...`);
    } else {
      console.log("❌ No 'response' field");
    }

  } catch (error) {
    console.log("❌ ERROR:", error.message);
  }
}

test();
