import { NextResponse } from "next/server";

export async function GET() {
  // Mock data for now - replace with actual database queries
  const recentJobs = [
    {
      id: "1",
      repoOwner: "example",
      repoName: "my-app",
      taskType: "refactor",
      status: "completed",
      triggerType: "comment",
      createdAt: new Date().toISOString(),
    },
    {
      id: "2",
      repoOwner: "example",
      repoName: "api-server",
      taskType: "test_generation",
      status: "in_progress",
      triggerType: "pr_opened",
      createdAt: new Date(Date.now() - 300000).toISOString(),
    },
    {
      id: "3",
      repoOwner: "example",
      repoName: "frontend",
      taskType: "documentation",
      status: "failed",
      triggerType: "comment",
      createdAt: new Date(Date.now() - 600000).toISOString(),
    },
  ];

  return NextResponse.json(recentJobs);
}
