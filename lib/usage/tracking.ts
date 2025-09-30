/**
 * Usage Tracking Service
 *
 * Handles usage counter tracking, plan enforcement, and billing governance.
 */

import { prisma } from '@/lib/db';
import { redactSecretsFromObject } from '@/lib/utils/secretRedaction';

export type Plan = 'trial' | 'solo' | 'teams';

export interface PlanLimits {
  prompts: number | null; // null = unlimited
  e2eRuns: number | null;
  bytesOut: number | null;
  features: {
    gitExport: boolean;
    multiUser: boolean;
    activeProjectSnapshots: number; // per minute
  };
}

export interface UsageCounter {
  id: string;
  userId: string;
  period: string;
  prompts: number;
  e2eRuns: number;
  bytesOut: bigint;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageIncrement {
  prompts?: number;
  e2eRuns?: number;
  bytesOut?: number;
}

export class UsageTrackingService {
  private readonly planLimits: Record<Plan, PlanLimits> = {
    trial: {
      prompts: 30,
      e2eRuns: null,
      bytesOut: null,
      features: {
        gitExport: false,
        multiUser: false,
        activeProjectSnapshots: 0,
      },
    },
    solo: {
      prompts: 10000, // Soft limit for alerts
      e2eRuns: null,
      bytesOut: null,
      features: {
        gitExport: true,
        multiUser: false,
        activeProjectSnapshots: 1, // 1 per minute
      },
    },
    teams: {
      prompts: null, // Unlimited
      e2eRuns: null,
      bytesOut: null,
      features: {
        gitExport: true,
        multiUser: true,
        activeProjectSnapshots: 10, // 10 per minute
      },
    },
  };

  /**
   * Get current monthly period identifier
   */
  private getCurrentPeriod(): string {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Get plan limits for a specific plan
   */
  getPlanLimits(plan: Plan): PlanLimits {
    return this.planLimits[plan];
  }

  /**
   * Increment usage counters for a user
   */
  async incrementUsage(
    userId: string,
    increment: UsageIncrement,
    metadata?: any
  ): Promise<UsageCounter> {
    const period = this.getCurrentPeriod();

    try {
      // Upsert usage counter for current period
      const counter = await prisma.usageCounter.upsert({
        where: {
          userId_period: {
            userId,
            period,
          },
        },
        create: {
          userId,
          period,
          prompts: increment.prompts || 0,
          e2eRuns: increment.e2eRuns || 0,
          bytesOut: BigInt(increment.bytesOut || 0),
        },
        update: {
          prompts: {
            increment: increment.prompts || 0,
          },
          e2eRuns: {
            increment: increment.e2eRuns || 0,
          },
          bytesOut: {
            increment: BigInt(increment.bytesOut || 0),
          },
        },
      });

      // Log usage telemetry
      await this.logUsageTelemetry(userId, increment, metadata);

      return counter;
    } catch (error) {
      console.error('Failed to increment usage:', error);
      throw new Error('Usage tracking failed');
    }
  }

  /**
   * Get current usage for a user
   */
  async getCurrentUsage(userId: string): Promise<UsageCounter | null> {
    const period = this.getCurrentPeriod();

    try {
      return await prisma.usageCounter.findUnique({
        where: {
          userId_period: {
            userId,
            period,
          },
        },
      });
    } catch (error) {
      console.error('Failed to get current usage:', error);
      return null;
    }
  }

  /**
   * Check if a user can perform an action based on their plan and usage
   */
  async checkUsageAllowed(
    userId: string,
    action: keyof UsageIncrement,
    increment: number = 1
  ): Promise<{
    allowed: boolean;
    reason?: string;
    currentUsage?: number;
    limit?: number;
    isHardLimit?: boolean;
  }> {
    try {
      // Get user and their plan
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true, role: true },
      });

      if (!user) {
        return { allowed: false, reason: 'User not found' };
      }

      // Admin bypass
      if (user.role === 'admin') {
        return { allowed: true, reason: 'Admin bypass' };
      }

      const plan = user.plan as Plan;
      const limits = this.getPlanLimits(plan);
      const usage = await this.getCurrentUsage(userId);

      const currentUsage = usage?.[action] || 0;
      const limit = limits[action];

      // Check if action has limits
      if (limit === null) {
        return { allowed: true, reason: 'Unlimited' };
      }

      // Check if adding increment would exceed limit
      if (currentUsage + increment > limit) {
        const isHardLimit = plan === 'trial';
        return {
          allowed: false,
          reason: isHardLimit ? 'Hard limit exceeded' : 'Soft limit exceeded',
          currentUsage,
          limit,
          isHardLimit,
        };
      }

      return {
        allowed: true,
        currentUsage,
        limit,
        isHardLimit: plan === 'trial',
      };
    } catch (error) {
      console.error('Failed to check usage:', error);
      return { allowed: false, reason: 'Usage check failed' };
    }
  }

  /**
   * Check if a user can use a specific feature
   */
  async checkFeatureAllowed(
    userId: string,
    feature: keyof PlanLimits['features']
  ): Promise<{
    allowed: boolean;
    reason?: string;
    planRequired?: Plan;
  }> {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { plan: true, role: true },
      });

      if (!user) {
        return { allowed: false, reason: 'User not found' };
      }

      // Admin bypass
      if (user.role === 'admin') {
        return { allowed: true, reason: 'Admin bypass' };
      }

      const plan = user.plan as Plan;
      const limits = this.getPlanLimits(plan);

      if (feature === 'gitExport' || feature === 'multiUser') {
        const allowed = limits.features[feature];
        return {
          allowed,
          reason: allowed ? undefined : 'Feature not available on current plan',
          planRequired: allowed ? undefined : 'solo',
        };
      }

      if (feature === 'activeProjectSnapshots') {
        // This requires time-based checking
        const allowedSnapshots = limits.features.activeProjectSnapshots;
        if (allowedSnapshots === 0) {
          return {
            allowed: false,
            reason: 'Feature not available on current plan',
            planRequired: 'solo',
          };
        }

        // Check recent snapshots in the last minute
        const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
        const recentSnapshots = await prisma.snapshot.count({
          where: {
            owner: { id: userId },
            createdAt: { gte: oneMinuteAgo },
          },
        });

        return {
          allowed: recentSnapshots < allowedSnapshots,
          reason:
            recentSnapshots >= allowedSnapshots
              ? `Rate limit: ${allowedSnapshots} snapshots per minute`
              : undefined,
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Failed to check feature access:', error);
      return { allowed: false, reason: 'Feature check failed' };
    }
  }

  /**
   * Get usage statistics for a user
   */
  async getUserUsageStats(userId: string): Promise<{
    currentPeriod: UsageCounter | null;
    plan: Plan;
    limits: PlanLimits;
    percentUsed: {
      prompts: number | null;
      e2eRuns: number | null;
      bytesOut: number | null;
    };
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    const plan = user.plan as Plan;
    const limits = this.getPlanLimits(plan);
    const currentPeriod = await this.getCurrentUsage(userId);

    const percentUsed = {
      prompts:
        limits.prompts && currentPeriod
          ? Math.round((currentPeriod.prompts / limits.prompts) * 100)
          : null,
      e2eRuns:
        limits.e2eRuns && currentPeriod
          ? Math.round((currentPeriod.e2eRuns / limits.e2eRuns) * 100)
          : null,
      bytesOut:
        limits.bytesOut && currentPeriod
          ? Math.round((Number(currentPeriod.bytesOut) / limits.bytesOut) * 100)
          : null,
    };

    return {
      currentPeriod,
      plan,
      limits,
      percentUsed,
    };
  }

  /**
   * Get usage statistics for admin dashboard
   */
  async getAdminUsageStats(options: {
    period?: string;
    limit?: number;
    offset?: number;
  } = {}): Promise<{
    topUsers: Array<{
      userId: string;
      user: { name: string; email: string; plan: string };
      prompts: number;
      e2eRuns: number;
      bytesOut: bigint;
    }>;
    totalStats: {
      totalPrompts: number;
      totalE2eRuns: number;
      totalBytesOut: bigint;
      totalUsers: number;
    };
    planBreakdown: Record<Plan, number>;
  }> {
    const period = options.period || this.getCurrentPeriod();
    const limit = options.limit || 50;
    const offset = options.offset || 0;

    // Get top users by usage
    const topUsers = await prisma.usageCounter.findMany({
      where: { period },
      include: {
        user: {
          select: { name: true, email: true, plan: true },
        },
      },
      orderBy: [
        { prompts: 'desc' },
        { e2eRuns: 'desc' },
        { bytesOut: 'desc' },
      ],
      take: limit,
      skip: offset,
    });

    // Get total statistics
    const totalStats = await prisma.usageCounter.aggregate({
      where: { period },
      _sum: {
        prompts: true,
        e2eRuns: true,
        bytesOut: true,
      },
      _count: {
        userId: true,
      },
    });

    // Get plan breakdown
    const planCounts = await prisma.user.groupBy({
      by: ['plan'],
      _count: { plan: true },
    });

    const planBreakdown = planCounts.reduce(
      (acc, { plan, _count }) => {
        acc[plan as Plan] = _count.plan;
        return acc;
      },
      { trial: 0, solo: 0, teams: 0 } as Record<Plan, number>
    );

    return {
      topUsers: topUsers.map(({ user, ...usage }) => ({
        ...usage,
        user,
      })),
      totalStats: {
        totalPrompts: totalStats._sum.prompts || 0,
        totalE2eRuns: totalStats._sum.e2eRuns || 0,
        totalBytesOut: totalStats._sum.bytesOut || BigInt(0),
        totalUsers: totalStats._count.userId || 0,
      },
      planBreakdown,
    };
  }

  /**
   * Log usage telemetry
   */
  private async logUsageTelemetry(
    userId: string,
    increment: UsageIncrement,
    metadata?: any
  ): Promise<void> {
    try {
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'usage_incremented',
          userId,
          payload: redactSecretsFromObject({
            increment,
            period: this.getCurrentPeriod(),
            timestamp: new Date().toISOString(),
            metadata,
          }),
        },
      });
    } catch (error) {
      console.error('Failed to log usage telemetry:', error);
      // Don't throw - telemetry should not break usage tracking
    }
  }

  /**
   * Clean up old usage counters
   */
  async cleanupOldCounters(retentionMonths: number = 12): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setMonth(cutoffDate.getMonth() - retentionMonths);
    const cutoffPeriod = `${cutoffDate.getFullYear()}-${String(
      cutoffDate.getMonth() + 1
    ).padStart(2, '0')}`;

    try {
      const result = await prisma.usageCounter.deleteMany({
        where: {
          period: { lt: cutoffPeriod },
        },
      });

      console.log(`Cleaned up ${result.count} old usage counter records`);
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup old usage counters:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const usageTrackingService = new UsageTrackingService();