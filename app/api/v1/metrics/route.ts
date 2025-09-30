import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { redactSecretsFromObject } from "@/lib/utils/secretRedaction";
import { getModelMetrics, compareModelMetrics, ModelMetricsAggregator } from "@/services/metrics/aggregateModelRuns";
import { privacyGovernanceService } from "@/services/privacy/scrub";
import { z } from "zod";

// Input validation schemas
const MetricsQuerySchema = z.object({
  modelId: z.string().optional(),
  window: z.enum(['1h', '24h', '7d', '30d', '90d']).optional(),
  modelIds: z.array(z.string()).optional(),
});

const AggregationSchema = z.object({
  windows: z.array(z.string()).optional(),
  modelIds: z.array(z.string()).optional(),
  dryRun: z.boolean().optional(),
  batchSize: z.number().min(100).max(10000).optional(),
});

// Helper function to check admin permissions
async function checkAdminPermissions(userId: string): Promise<{ isAdmin: boolean; user?: any }> {
  const user = await prisma.user.findFirst({
    where: { clerkId: userId },
    include: { team: true },
  });

  if (!user) {
    return { isAdmin: false };
  }

  const isAdmin = user.email?.endsWith('@magi.com') ||
                  user.team?.some(t => t.role === 'admin') ||
                  process.env.ADMIN_USER_IDS?.split(',').includes(userId);

  return { isAdmin, user };
}

// Helper function to check user permissions for metrics access
async function checkMetricsPermissions(userId: string): Promise<{ hasAccess: boolean; user?: any }> {
  const user = await prisma.user.findFirst({
    where: { clerkId: userId },
    include: { team: true },
  });

  if (!user) {
    return { hasAccess: false };
  }

  // Allow access for admins or team members with metrics role
  const hasAccess = user.email?.endsWith('@magi.com') ||
                   user.team?.some(t => ['admin', 'metrics_viewer'].includes(t.role)) ||
                   process.env.METRICS_USER_IDS?.split(',').includes(userId);

  return { hasAccess, user };
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get('endpoint');

    // Check permissions based on endpoint
    const { hasAccess, user } = await checkMetricsPermissions(userId);
    if (!hasAccess) {
      return NextResponse.json({ error: "Metrics access required" }, { status: 403 });
    }

    // Handle governance metrics endpoint (admin only)
    if (endpoint === 'governance') {
      const { isAdmin } = await checkAdminPermissions(userId);
      if (!isAdmin) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }

      const governanceMetrics = await privacyGovernanceService.getGovernanceMetrics();
      return NextResponse.json(governanceMetrics);
    }

    // Handle model comparison endpoint
    if (endpoint === 'compare') {
      const modelIds = searchParams.get('modelIds')?.split(',') || [];
      const window = searchParams.get('window') || '7d';

      if (modelIds.length === 0) {
        return NextResponse.json({ error: "Model IDs required for comparison" }, { status: 400 });
      }

      const validation = MetricsQuerySchema.safeParse({ modelIds, window });
      if (!validation.success) {
        return NextResponse.json(
          {
            error: "Invalid query parameters",
            details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
          },
          { status: 400 }
        );
      }

      const comparisonMetrics = await compareModelMetrics(modelIds, window);

      return NextResponse.json({
        comparison: comparisonMetrics,
        window,
        modelCount: modelIds.length,
        timestamp: new Date().toISOString(),
      });
    }

    // Handle aggregation status endpoint
    if (endpoint === 'aggregation-status') {
      const { isAdmin } = await checkAdminPermissions(userId);
      if (!isAdmin) {
        return NextResponse.json({ error: "Admin access required" }, { status: 403 });
      }

      // Get recent aggregation events
      const recentAggregations = await prisma.telemetryEvent.findMany({
        where: {
          eventType: 'model_metrics_aggregation',
          createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
      });

      // Get metrics table statistics
      const metricsCount = await prisma.modelMetrics.count();
      const latestMetrics = await prisma.modelMetrics.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      return NextResponse.json({
        recentAggregations: recentAggregations.map(event => ({
          timestamp: event.createdAt,
          payload: event.payload,
        })),
        metricsCount,
        latestMetricsTimestamp: latestMetrics?.createdAt,
        status: 'active',
      });
    }

    // Default: Get individual model metrics
    const modelId = searchParams.get('modelId');
    const window = searchParams.get('window') || '7d';

    if (!modelId) {
      return NextResponse.json({ error: "Model ID required" }, { status: 400 });
    }

    const validation = MetricsQuerySchema.safeParse({ modelId, window });
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        },
        { status: 400 }
      );
    }

    // Get model metrics
    const metrics = await getModelMetrics(modelId, window);

    if (!metrics) {
      return NextResponse.json({
        message: "No metrics available for this model and window",
        modelId,
        window,
      });
    }

    // Get model info for context
    const model = await prisma.model.findUnique({
      where: { id: modelId },
      select: { name: true, provider: true, role: true, status: true },
    });

    return NextResponse.json({
      metrics,
      model,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error("Metrics GET API error:", error);
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

    // Check admin permissions for aggregation triggers
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action;

    // Handle manual aggregation trigger
    if (action === 'aggregate') {
      const validation = AggregationSchema.safeParse(body);
      if (!validation.success) {
        return NextResponse.json(
          {
            error: "Invalid aggregation parameters",
            details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
          },
          { status: 400 }
        );
      }

      const options = validation.data;

      // Run aggregation
      const aggregator = new ModelMetricsAggregator(options);
      const result = await aggregator.runAggregation();

      // Log manual aggregation trigger
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'manual_aggregation_triggered',
          userId: user.id,
          payload: redactSecretsFromObject({
            triggeredBy: user.email,
            options,
            result: {
              processedModels: result.processedModels,
              totalMetrics: result.totalMetrics,
              errorCount: result.errors.length,
            },
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Aggregation completed",
        result: {
          processedModels: result.processedModels,
          totalMetrics: result.totalMetrics,
          errors: result.errors,
        },
      });
    }

    // Handle metrics cleanup
    if (action === 'cleanup') {
      const retentionDays = body.retentionDays || 90;

      if (retentionDays < 30 || retentionDays > 365) {
        return NextResponse.json(
          { error: "Retention days must be between 30 and 365" },
          { status: 400 }
        );
      }

      const aggregator = new ModelMetricsAggregator();
      const deletedCount = await aggregator.cleanupOldMetrics(retentionDays);

      // Log cleanup action
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'metrics_cleanup',
          userId: user.id,
          payload: redactSecretsFromObject({
            triggeredBy: user.email,
            retentionDays,
            deletedCount,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Cleaned up ${deletedCount} old metric records`,
        deletedCount,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error) {
    console.error("Metrics POST API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin permissions for metrics configuration updates
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();
    const action = body.action;

    // Handle aggregation schedule configuration
    if (action === 'configure-schedule') {
      const { enabled, cronExpression, windows } = body;

      // In a real implementation, you would update the cron job configuration
      // For now, we'll just log the configuration update
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'aggregation_schedule_updated',
          userId: user.id,
          payload: redactSecretsFromObject({
            updatedBy: user.email,
            config: {
              enabled,
              cronExpression,
              windows,
            },
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        success: true,
        message: "Aggregation schedule updated",
        config: { enabled, cronExpression, windows },
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error) {
    console.error("Metrics PUT API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin permissions for metrics deletion
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get('modelId');
    const window = searchParams.get('window');

    if (!modelId) {
      return NextResponse.json({ error: "Model ID required" }, { status: 400 });
    }

    // Build delete conditions
    const whereClause: any = { modelId };
    if (window) {
      whereClause.window = window;
    }

    // Delete metrics
    const result = await prisma.modelMetrics.deleteMany({
      where: whereClause,
    });

    // Log deletion
    await prisma.telemetryEvent.create({
      data: {
        eventType: 'metrics_deleted',
        userId: user.id,
        payload: redactSecretsFromObject({
          deletedBy: user.email,
          modelId,
          window: window || 'all',
          deletedCount: result.count,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: `Deleted ${result.count} metric records`,
      deletedCount: result.count,
    });

  } catch (error) {
    console.error("Metrics DELETE API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}