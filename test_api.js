const OLLAMA_API_URL = "https://ollama.com/api";
const OLLAMA_API_KEY = "bf6c1e7b756a447a974651b9967826c2.5OrJ-h7sx3Nl9U747FYjj3na";
const OLLAMA_MODEL = "glm-4.6";

async function testOllamaAPI() {
  try {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🧪 Testing Ollama Turbo API Connection");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("");
    
    const url = `${OLLAMA_API_URL}/chat`;
    const payload = {
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say hello in one sentence!" }
      ],
      temperature: 0.1,
      stream: false
    };

    console.log("📤 REQUEST DETAILS:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`🔗 Full URL: ${url}`);
    console.log(`🏠 Base URL: ${OLLAMA_API_URL}`);
    console.log(`📍 Route: /chat`);
    console.log(`🤖 Model: ${OLLAMA_MODEL}`);
    console.log(`🔑 API Key: ${OLLAMA_API_KEY.substring(0, 20)}...`);
    console.log(`🌡️  Temperature: ${payload.temperature}`);
    console.log(`🔄 Stream: ${payload.stream}`);
    console.log("");

    console.log("📨 Sending request...");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OLLAMA_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    console.log("");
    console.log("📥 RESPONSE RECEIVED:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`✅ Status: ${response.status}`);
    console.log(`📍 Status Text: ${response.statusText}`);
    
    const data = await response.json();
    console.log(`📊 Response Size: ${JSON.stringify(data).length} bytes`);
    console.log(`🎯 Choices: ${data.choices?.length || 0}`);
    console.log("");
    
    if (!response.ok) {
      console.log("❌ API Error!");
      console.log(JSON.stringify(data, null, 2));
    } else if (data.choices && data.choices[0]) {
      console.log("💬 MODEL RESPONSE:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(data.choices[0].message.content);
      console.log("");
      
      console.log("═══════════════════════════════════════════════════════════");
      console.log("✅ SUCCESS! Ollama Turbo API is working correctly!");
      console.log("═══════════════════════════════════════════════════════════");
    }

  } catch (error) {
    console.log("");
    console.log("❌ ERROR:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`${error.message}`);
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }
}

testOllamaAPI();
