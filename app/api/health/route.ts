import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    // Simple health check without tracing for now
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'unknown',
      uptime: process.uptime(),
      version: "1.0.0"
    };

    return NextResponse.json(healthData, { status: 200 });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: "Internal server error"
      },
      { status: 500 }
    );
  }
}