import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    message: "Test endpoint working!",
    runtime: "nodejs",
    timestamp: new Date().toISOString()
  });
}