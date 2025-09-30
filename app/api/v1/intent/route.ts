import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { redactSecretsFromObject } from "@/lib/utils/secretRedaction";
import { createRouter, validateTaskGraph } from "@/services/orch/router";

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { intent, projectId, context } = await req.json();

    if (!intent) {
      return NextResponse.json(
        { error: "Intent is required" },
        { status: 400 }
      );
    }

    if (!intent.trim() || intent.length < 5) {
      return NextResponse.json(
        { error: "Intent must be at least 5 characters long" },
        { status: 400 }
      );
    }

    // Create orchestration router
    const router = createRouter(userId, projectId);

    // Build context for routing
    const routingContext = {
      userId,
      projectId,
      currentState: context?.currentState,
      constraints: {
        timeLimit: context?.timeLimit,
        budget: context?.budget,
        technologies: context?.technologies,
        securityLevel: context?.securityLevel || 'standard',
      },
    };

    // Route intent to task graph
    const taskGraph = await router.routeIntent(intent, routingContext);

    // Validate the generated task graph
    const validation = validateTaskGraph(taskGraph);
    if (!validation.valid) {
      console.error('Invalid task graph generated:', validation.errors);
      return NextResponse.json(
        { error: "Failed to generate valid task plan", details: validation.errors },
        { status: 500 }
      );
    }

    // Log the prompt if projectId is provided
    if (projectId) {
      const user = await prisma.user.findFirst({
        where: { clerkId: userId },
      });

      if (user) {
        // Redact sensitive information before storing
        const redactedContext = redactSecretsFromObject(context || {});
        const redactedResponse = redactSecretsFromObject(taskGraph);

        await prisma.prompt.create({
          data: {
            projectId,
            userId: user.id,
            content: intent,
            response: JSON.stringify(redactedResponse),
            metadata: {
              context: redactedContext,
              routingMetadata: {
                complexity: taskGraph.metadata.complexity,
                confidence: taskGraph.metadata.confidence,
                riskLevel: taskGraph.metadata.riskLevel,
                requiresApproval: taskGraph.metadata.requiresApproval,
              }
            },
          },
        });
      }
    }

    // Prepare response with additional metadata
    const response = {
      taskGraph,
      response: `I understand you want to: "${intent}". I've created a task plan with ${taskGraph.tasks.length} steps.`,
      metadata: {
        complexity: taskGraph.metadata.complexity,
        confidence: taskGraph.metadata.confidence,
        riskLevel: taskGraph.metadata.riskLevel,
        requiresApproval: taskGraph.metadata.requiresApproval,
        estimatedTimeMs: taskGraph.estimatedTimeMs,
      },
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error("Intent API error:", error);

    // Return more specific error information in development
    const isDevelopment = process.env.NODE_ENV === 'development';

    return NextResponse.json(
      {
        error: "Internal server error",
        ...(isDevelopment && { details: error instanceof Error ? error.message : 'Unknown error' })
      },
      { status: 500 }
    );
  }
}