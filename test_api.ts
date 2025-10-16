import axios from 'axios';

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

    const response = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${OLLAMA_API_KEY}`,
        "Content-Type": "application/json"
      },
      timeout: 30000
    });

    console.log("");
    console.log("📥 RESPONSE RECEIVED:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(`✅ Status: ${response.status}`);
    console.log(`📊 Response Size: ${JSON.stringify(response.data).length} bytes`);
    console.log(`🎯 Choices: ${response.data.choices?.length || 0}`);
    console.log("");
    
    if (response.data.choices && response.data.choices[0]) {
      console.log("💬 MODEL RESPONSE:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(response.data.choices[0].message.content);
      console.log("");
    }

    console.log("═══════════════════════════════════════════════════════════");
    console.log("✅ SUCCESS! Ollama Turbo API is working correctly!");
    console.log("═══════════════════════════════════════════════════════════");

  } catch (error: any) {
    console.log("");
    console.log("❌ ERROR:");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    if (error.response) {
      console.log(`HTTP Status: ${error.response.status}`);
      console.log(`Status Text: ${error.response.statusText}`);
      console.log(`Error: ${JSON.stringify(error.response.data, null, 2)}`);
    } else if (error.code === 'ENOTFOUND') {
      console.log("Network Error: Cannot resolve domain");
      console.log("Check your internet connection and firewall settings");
    } else {
      console.log(`${error.message}`);
    }
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  }
}

testOllamaAPI();
