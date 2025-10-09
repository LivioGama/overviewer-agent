import { NextResponse } from "next/server";

export async function GET() {
  // Mock data for now - replace with actual database queries
  const stats = {
    totalJobs: 156,
    completedJobs: 142,
    failedJobs: 8,
    queuedJobs: 6,
  };

  return NextResponse.json(stats);
}
