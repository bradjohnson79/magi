import { NextRequest, NextResponse } from "next/server";
import { usageMiddleware } from "@/lib/middleware/usage";
import { prisma } from "@/lib/db";
import { z } from "zod";

// Input validation schema
const PromptSchema = z.object({
  content: z.string().min(1).max(10000),
  projectId: z.string().uuid().optional(),
  type: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Wrap the handler with usage tracking for prompts
export const POST = usageMiddleware.prompts(async (req: NextRequest, context) => {
  try {
    const body = await req.json();

    // Validate input
    const validation = PromptSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        },
        { status: 400 }
      );
    }

    const { content, projectId, type, metadata } = validation.data;

    // Create prompt record
    const prompt = await prisma.prompt.create({
      data: {
        content,
        type: type || 'chat',
        metadata: metadata || {},
        userId: context.userId,
        projectId,
      },
    });

    // Return prompt with usage info
    return NextResponse.json({
      id: prompt.id,
      content: prompt.content,
      type: prompt.type,
      createdAt: prompt.createdAt,
      usage: {
        plan: context.user.plan,
        currentUsage: context.usage.currentUsage,
        limit: context.usage.limit,
        remainingInPlan: context.usage.limit ? context.usage.limit - (context.usage.currentUsage || 0) : null,
      },
    });

  } catch (error) {
    console.error("Prompts API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});

// Get prompts with usage stats
export const GET = usageMiddleware.admin(async (req: NextRequest, context) => {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const offset = parseInt(searchParams.get('offset') || '0');
    const userId = searchParams.get('userId');

    // Build where clause
    const whereClause: any = {};
    if (userId) {
      whereClause.userId = userId;
    }

    // Get prompts
    const prompts = await prisma.prompt.findMany({
      where: whereClause,
      include: {
        user: {
          select: { id: true, name: true, email: true, plan: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip: offset,
    });

    // Get total count
    const total = await prisma.prompt.count({ where: whereClause });

    return NextResponse.json({
      prompts: prompts.map(prompt => ({
        id: prompt.id,
        content: prompt.content.substring(0, 100) + (prompt.content.length > 100 ? '...' : ''),
        type: prompt.type,
        createdAt: prompt.createdAt,
        user: prompt.user,
      })),
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
    });

  } catch (error) {
    console.error("Prompts GET API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
});