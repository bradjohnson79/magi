import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { usageTrackingService } from "@/lib/usage/tracking";
import { redactSecretsFromObject } from "@/lib/utils/secretRedaction";
import { z } from "zod";

// Input validation schemas
const UsageQuerySchema = z.object({
  period: z.string().optional(),
  limit: z.number().min(1).max(100).optional(),
  offset: z.number().min(0).optional(),
  userId: z.string().uuid().optional(),
});

const UsageActionSchema = z.object({
  action: z.enum(['cleanup', 'reset_user', 'upgrade_plan']),
  userId: z.string().uuid().optional(),
  plan: z.enum(['trial', 'solo', 'teams']).optional(),
  retentionMonths: z.number().min(1).max(24).optional(),
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

  const isAdmin = user.role === 'admin' ||
                  user.email?.endsWith('@magi.com') ||
                  process.env.ADMIN_USER_IDS?.split(',').includes(userId);

  return { isAdmin, user };
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin permissions
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const endpoint = searchParams.get('endpoint');

    // Validate query parameters
    const validation = UsageQuerySchema.safeParse({
      period: searchParams.get('period') || undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!) : undefined,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!) : undefined,
      userId: searchParams.get('userId') || undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid query parameters",
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        },
        { status: 400 }
      );
    }

    const { period, limit, offset, userId: targetUserId } = validation.data;

    // Handle specific user usage endpoint
    if (endpoint === 'user' && targetUserId) {
      const userStats = await usageTrackingService.getUserUsageStats(targetUserId);

      // Get user details
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: {
          id: true,
          name: true,
          email: true,
          plan: true,
          role: true,
          createdAt: true,
        },
      });

      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      // Get usage history (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      const startPeriod = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

      const usageHistory = await prisma.usageCounter.findMany({
        where: {
          userId: targetUserId,
          period: { gte: startPeriod },
        },
        orderBy: { period: 'desc' },
      });

      return NextResponse.json({
        user: targetUser,
        currentUsage: userStats,
        history: usageHistory.map(h => ({
          period: h.period,
          prompts: h.prompts,
          e2eRuns: h.e2eRuns,
          bytesOut: h.bytesOut.toString(), // Convert BigInt to string
        })),
      });
    }

    // Handle top offenders endpoint
    if (endpoint === 'offenders') {
      const adminStats = await usageTrackingService.getAdminUsageStats({
        period,
        limit: limit || 20,
        offset: offset || 0,
      });

      // Convert BigInt to string for JSON serialization
      const serializedStats = {
        ...adminStats,
        topUsers: adminStats.topUsers.map(user => ({
          ...user,
          bytesOut: user.bytesOut.toString(),
        })),
        totalStats: {
          ...adminStats.totalStats,
          totalBytesOut: adminStats.totalStats.totalBytesOut.toString(),
        },
      };

      return NextResponse.json(serializedStats);
    }

    // Handle plan distribution endpoint
    if (endpoint === 'plans') {
      const planStats = await prisma.user.groupBy({
        by: ['plan'],
        _count: { plan: true },
      });

      const distribution = planStats.reduce((acc, { plan, _count }) => {
        acc[plan] = _count.plan;
        return acc;
      }, {} as Record<string, number>);

      // Get revenue estimates (mock data for demo)
      const revenueEstimates = {
        trial: 0,
        solo: (distribution.solo || 0) * 29, // $29/month
        teams: (distribution.teams || 0) * 99, // $99/month
      };

      return NextResponse.json({
        distribution,
        revenueEstimates,
        total: Object.values(distribution).reduce((sum, count) => sum + count, 0),
      });
    }

    // Default: Get comprehensive usage dashboard data
    const [adminStats, planBreakdown, recentActivity] = await Promise.all([
      usageTrackingService.getAdminUsageStats({ period, limit: 10 }),

      prisma.user.groupBy({
        by: ['plan'],
        _count: { plan: true },
      }),

      prisma.telemetryEvent.findMany({
        where: {
          eventType: 'usage_incremented',
          createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }, // Last 24 hours
        },
        take: 50,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { name: true, email: true, plan: true },
          },
        },
      }),
    ]);

    // Convert BigInt to string for JSON serialization
    const serializedResponse = {
      adminStats: {
        ...adminStats,
        topUsers: adminStats.topUsers.map(user => ({
          ...user,
          bytesOut: user.bytesOut.toString(),
        })),
        totalStats: {
          ...adminStats.totalStats,
          totalBytesOut: adminStats.totalStats.totalBytesOut.toString(),
        },
      },
      planBreakdown: planBreakdown.reduce((acc, { plan, _count }) => {
        acc[plan] = _count.plan;
        return acc;
      }, {} as Record<string, number>),
      recentActivity: recentActivity.map(event => ({
        id: event.id,
        timestamp: event.createdAt,
        user: event.user,
        payload: event.payload,
      })),
      metadata: {
        currentPeriod: period || new Date().toISOString().slice(0, 7),
        generatedAt: new Date().toISOString(),
        adminUser: user.email,
      },
    };

    return NextResponse.json(serializedResponse);

  } catch (error) {
    console.error("Admin usage API error:", error);
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

    // Check admin permissions
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();

    // Validate input
    const validation = UsageActionSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        },
        { status: 400 }
      );
    }

    const { action, userId: targetUserId, plan, retentionMonths } = validation.data;

    // Handle cleanup action
    if (action === 'cleanup') {
      const deletedCount = await usageTrackingService.cleanupOldCounters(
        retentionMonths || 12
      );

      // Log cleanup action
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'admin_usage_cleanup',
          userId: user.id,
          payload: redactSecretsFromObject({
            deletedCount,
            retentionMonths: retentionMonths || 12,
            performedBy: user.email,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Cleaned up ${deletedCount} old usage records`,
        deletedCount,
      });
    }

    // Handle user plan upgrade
    if (action === 'upgrade_plan' && targetUserId && plan) {
      const targetUser = await prisma.user.findUnique({
        where: { id: targetUserId },
        select: { id: true, plan: true, email: true },
      });

      if (!targetUser) {
        return NextResponse.json({ error: "User not found" }, { status: 404 });
      }

      await prisma.user.update({
        where: { id: targetUserId },
        data: { plan },
      });

      // Log plan change
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'admin_plan_change',
          userId: user.id,
          payload: redactSecretsFromObject({
            targetUserId,
            targetUserEmail: targetUser.email,
            previousPlan: targetUser.plan,
            newPlan: plan,
            performedBy: user.email,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Updated user ${targetUser.email} from ${targetUser.plan} to ${plan}`,
        previousPlan: targetUser.plan,
        newPlan: plan,
      });
    }

    // Handle user usage reset
    if (action === 'reset_user' && targetUserId) {
      const currentPeriod = new Date().toISOString().slice(0, 7);

      await prisma.usageCounter.deleteMany({
        where: {
          userId: targetUserId,
          period: currentPeriod,
        },
      });

      // Log reset action
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'admin_usage_reset',
          userId: user.id,
          payload: redactSecretsFromObject({
            targetUserId,
            period: currentPeriod,
            performedBy: user.email,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        success: true,
        message: `Reset usage for user ${targetUserId} for period ${currentPeriod}`,
      });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (error) {
    console.error("Admin usage POST API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}