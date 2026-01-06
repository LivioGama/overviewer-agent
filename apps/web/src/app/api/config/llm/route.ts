import { NextResponse } from "next/server";

export async function GET() {
  // Mock data for LLM integrations - replace with actual logic
  const llmIntegrations = [
    { name: "Claude", type: "Coding" },
    { name: "Gemini 3.0 Pro", type: "Writing Documentation" }
  ];

  return NextResponse.json(llmIntegrations);
}

export async function POST(request) {
  const data = await request.json();
  // Logic to save LLM integration settings
  console.log("Received LLM integration settings:", data);

  return NextResponse.json({ success: true });
}
