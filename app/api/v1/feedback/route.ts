import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { withSpan, addSpanAttributes } from "@/lib/observability/otel";

export const runtime = "nodejs";
import { prisma } from "@/lib/db";
import { redactSecretsFromObject } from "@/lib/utils/secretRedaction";
import { z } from "zod";

// Input validation schema
const FeedbackSchema = z.object({
  modelRunId: z.string().uuid(),
  rating: z.number().min(1).max(5).optional(),
  comment: z.string().max(2000).optional(),
  correction: z.record(z.any()).optional(),
});

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();

    // Validate input
    const validation = FeedbackSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        },
        { status: 400 }
      );
    }

    const { modelRunId, rating, comment, correction } = validation.data;

    // Get the user from database
    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Verify the model run exists and user has access
    const modelRun = await prisma.modelRun.findFirst({
      where: {
        id: modelRunId,
        OR: [
          { userId: user.id },
          { project: { ownerId: user.id } },
          { project: { team: { members: { some: { userId: user.id } } } } },
        ],
      },
      include: { model: true },
    });

    if (!modelRun) {
      return NextResponse.json(
        { error: "Model run not found or access denied" },
        { status: 404 }
      );
    }

    // Redact sensitive information from correction
    const redactedCorrection = correction ? redactSecretsFromObject(correction) : null;

    // Create feedback entry with enhanced metadata
    const feedback = await prisma.feedback.create({
      data: {
        modelRunId,
        userId: user.id,
        rating,
        comment,
        correction: redactedCorrection,
        metadata: {
          timestamp: new Date().toISOString(),
          userAgent: req.headers.get('user-agent'),
          modelName: modelRun.model?.name,
          hasCorrection: !!correction,
          feedbackVersion: '2.0',
        },
      },
    });

    // If correction exists, update the model run with correction and mark as reviewed
    if (correction && redactedCorrection) {
      await prisma.modelRun.update({
        where: { id: modelRunId },
        data: {
          outputPayload: {
            ...((modelRun.outputPayload as any) || {}),
            correction: redactedCorrection,
          },
          provenance: {
            ...((modelRun.provenance as any) || {}),
            reviewed: true,
            reviewedAt: new Date().toISOString(),
            reviewedBy: user.id,
            correctionApplied: true,
          },
        },
      });
    }

    // Get feedback statistics for this model run
    const feedbackStats = await prisma.feedback.aggregate({
      where: { modelRunId },
      _count: { id: true },
      _avg: { rating: true },
    });

    // Log feedback telemetry
    await prisma.telemetryEvent.create({
      data: {
        eventType: 'feedback_submitted',
        userId: user.id,
        projectId: modelRun.projectId,
        payload: redactSecretsFromObject({
          modelRunId,
          hasRating: !!rating,
          hasComment: !!comment,
          hasCorrection: !!correction,
          correctionType: correction ? Object.keys(correction) : undefined,
          feedbackCount: feedbackStats._count.id,
          avgRating: feedbackStats._avg.rating,
        }),
      },
    });

    // Determine impact and next actions
    const totalFeedback = feedbackStats._count.id;
    const avgRating = feedbackStats._avg.rating || 0;

    let impact = 'monitoring';
    let nextActions: string[] = [];

    if (correction) {
      impact = 'correction_applied';
      nextActions.push('correction_stored');
    }

    if (totalFeedback >= 5 && avgRating < 2.5) {
      impact = 'will_review_model';
      nextActions.push('model_review_triggered');
    }

    if (totalFeedback >= 10 && avgRating < 2.0) {
      impact = 'will_retrain';
      nextActions.push('retraining_queued');
    }

    return NextResponse.json({
      id: feedback.id,
      status: "recorded",
      impact,
      nextActions,
      stats: {
        totalFeedback,
        averageRating: Number(avgRating.toFixed(2)),
      },
      message: correction
        ? "Thank you for your feedback and correction. This will help improve Magi's responses."
        : "Thank you for your feedback. It helps us improve Magi.",
    });

  } catch (error) {
    console.error("Feedback API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const modelRunId = searchParams.get('modelRunId');
    const limit = Math.min(parseInt(searchParams.get('limit') || '10'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Get the user from database
    const user = await prisma.user.findFirst({
      where: { clerkId: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Build query conditions
    const whereClause: any = {
      modelRun: {
        OR: [
          { userId: user.id },
          { project: { ownerId: user.id } },
          { project: { team: { members: { some: { userId: user.id } } } } },
        ],
      },
    };

    if (modelRunId) {
      whereClause.modelRunId = modelRunId;
    }

    // Get feedback with user permissions check
    const feedback = await prisma.feedback.findMany({
      where: whereClause,
      include: {
        user: {
          select: { id: true, name: true, email: true },
        },
        modelRun: {
          select: {
            id: true,
            success: true,
            createdAt: true,
            model: { select: { name: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get total count for pagination
    const total = await prisma.feedback.count({ where: whereClause });

    return NextResponse.json({
      feedback: feedback.map(f => ({
        id: f.id,
        rating: f.rating,
        comment: f.comment,
        hasCorrection: !!f.correction,
        createdAt: f.createdAt,
        user: f.user,
        modelRun: f.modelRun,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });

  } catch (error) {
    console.error("Feedback GET API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}