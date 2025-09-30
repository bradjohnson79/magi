import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { jobId } = params;

    // Mock job status
    const mockStatuses = ["queued", "in_progress", "completed", "failed"];
    const randomStatus = mockStatuses[Math.floor(Math.random() * 2) + 1]; // Mostly in_progress or completed

    const job = {
      id: jobId,
      status: randomStatus,
      progress: randomStatus === "completed" ? 100 : Math.floor(Math.random() * 90),
      currentTask: randomStatus === "completed" ? "deployment" : "code_generation",
      completedTasks: ["schema_design", "authentication_setup"],
      modelRuns: [
        {
          id: `run-${Date.now()}`,
          model: "gpt-4-turbo",
          confidence: 0.92,
          runtimeMs: 1250,
        },
        {
          id: `run-${Date.now() + 1}`,
          model: "claude-3-opus",
          confidence: 0.95,
          runtimeMs: 980,
        },
      ],
      logs: [
        {
          timestamp: new Date(Date.now() - 5000).toISOString(),
          level: "info",
          message: "Schema design completed successfully",
        },
        {
          timestamp: new Date(Date.now() - 3000).toISOString(),
          level: "info",
          message: "Authentication setup completed",
        },
        {
          timestamp: new Date().toISOString(),
          level: "info",
          message: "Generating application code...",
        },
      ],
      createdAt: new Date(Date.now() - 10000).toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return NextResponse.json(job);
  } catch (error) {
    console.error("Job status API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}