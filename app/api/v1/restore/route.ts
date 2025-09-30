import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get("projectId");

    if (!projectId) {
      return NextResponse.json(
        { error: "Project ID is required" },
        { status: 400 }
      );
    }

    // Get user from database
    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Fetch snapshots for the project
    const snapshots = await prisma.snapshot.findMany({
      where: { projectId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        snapshotName: true,
        description: true,
        createdAt: true,
        sizeBytes: true,
        metadata: true,
      },
    });

    const formattedSnapshots = snapshots.map((snapshot) => ({
      ...snapshot,
      sizeBytes: snapshot.sizeBytes ? Number(snapshot.sizeBytes) : 0,
    }));

    return NextResponse.json({
      snapshots: formattedSnapshots,
      count: formattedSnapshots.length,
    });
  } catch (error) {
    console.error("Restore API GET error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { snapshotId } = await req.json();

    if (!snapshotId) {
      return NextResponse.json(
        { error: "Snapshot ID is required" },
        { status: 400 }
      );
    }

    // Get the snapshot
    const snapshot = await prisma.snapshot.findUnique({
      where: { id: snapshotId },
      include: { project: true },
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: "Snapshot not found" },
        { status: 404 }
      );
    }

    // Mock restore process
    // In production, this would restore files from storage
    const restoredFiles = 42; // Mock number

    // Log the restore action
    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
    });

    if (user) {
      await prisma.log.create({
        data: {
          projectId: snapshot.projectId,
          userId: user.id,
          action: "snapshot.restored",
          level: "info",
          metadata: {
            snapshotId,
            snapshotName: snapshot.snapshotName,
            restoredFiles,
          },
        },
      });
    }

    return NextResponse.json({
      status: "restored",
      projectId: snapshot.projectId,
      filesRestored: restoredFiles,
      message: `Successfully restored project to snapshot "${snapshot.snapshotName}"`,
    });
  } catch (error) {
    console.error("Restore API POST error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}