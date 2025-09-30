/**
 * Usage Tracking Middleware
 *
 * Middleware for Next.js API routes to track usage and enforce plan limits.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { usageTrackingService, UsageIncrement } from '@/lib/usage/tracking';

export interface UsageMiddlewareOptions {
  trackPrompts?: boolean;
  trackE2eRuns?: boolean;
  trackBytesOut?: boolean;
  requireFeature?: 'gitExport' | 'multiUser' | 'activeProjectSnapshots';
  skipUsageCheck?: boolean;
  adminBypass?: boolean;
}

export interface UsageContext {
  userId: string;
  user: {
    id: string;
    plan: string;
    role: string;
    email: string;
  };
  usage: {
    allowed: boolean;
    reason?: string;
    currentUsage?: number;
    limit?: number;
  };
}

/**
 * Higher-order function to wrap API handlers with usage tracking
 */
export function withUsageTracking<T = any>(
  handler: (req: NextRequest, context: UsageContext) => Promise<NextResponse<T>>,
  options: UsageMiddlewareOptions = {}
) {
  return async (req: NextRequest): Promise<NextResponse<T>> => {
    try {
      // Get authenticated user
      const { userId: clerkUserId } = await auth();
      if (!clerkUserId) {
        return NextResponse.json(
          { error: 'Unauthorized' },
          { status: 401 }
        ) as NextResponse<T>;
      }

      // Get user from database
      const user = await prisma.user.findFirst({
        where: { clerkId: clerkUserId },
        select: {
          id: true,
          plan: true,
          role: true,
          email: true,
        },
      });

      if (!user) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        ) as NextResponse<T>;
      }

      // Check admin bypass
      if (options.adminBypass && user.role === 'admin') {
        const context: UsageContext = {
          userId: user.id,
          user,
          usage: { allowed: true, reason: 'Admin bypass' },
        };
        return await handler(req, context);
      }

      // Check feature requirements
      if (options.requireFeature) {
        const featureCheck = await usageTrackingService.checkFeatureAllowed(
          user.id,
          options.requireFeature
        );

        if (!featureCheck.allowed) {
          return NextResponse.json(
            {
              error: 'Feature not available',
              reason: featureCheck.reason,
              planRequired: featureCheck.planRequired,
              currentPlan: user.plan,
            },
            { status: 403 }
          ) as NextResponse<T>;
        }
      }

      // Check usage limits if not skipped
      let usageCheck = { allowed: true };
      if (!options.skipUsageCheck) {
        if (options.trackPrompts) {
          usageCheck = await usageTrackingService.checkUsageAllowed(
            user.id,
            'prompts'
          );
        } else if (options.trackE2eRuns) {
          usageCheck = await usageTrackingService.checkUsageAllowed(
            user.id,
            'e2eRuns'
          );
        }

        // Enforce hard limits for trial users
        if (!usageCheck.allowed && usageCheck.isHardLimit) {
          return NextResponse.json(
            {
              error: 'Usage limit exceeded',
              reason: usageCheck.reason,
              currentUsage: usageCheck.currentUsage,
              limit: usageCheck.limit,
              plan: user.plan,
            },
            { status: 429 }
          ) as NextResponse<T>;
        }

        // Log soft limit warnings for paid users
        if (!usageCheck.allowed && !usageCheck.isHardLimit) {
          console.warn(
            `Soft limit exceeded for user ${user.id}: ${usageCheck.reason}`
          );
        }
      }

      const context: UsageContext = {
        userId: user.id,
        user,
        usage: usageCheck,
      };

      // Execute the handler
      const response = await handler(req, context);

      // Track usage after successful execution
      await trackPostRequestUsage(req, response, user.id, options);

      return response;
    } catch (error) {
      console.error('Usage middleware error:', error);
      return NextResponse.json(
        { error: 'Internal server error' },
        { status: 500 }
      ) as NextResponse<T>;
    }
  };
}

/**
 * Track usage after request completion
 */
async function trackPostRequestUsage(
  req: NextRequest,
  response: NextResponse,
  userId: string,
  options: UsageMiddlewareOptions
): Promise<void> {
  try {
    // Only track usage for successful responses
    if (response.status >= 400) {
      return;
    }

    const increment: UsageIncrement = {};

    // Track prompts
    if (options.trackPrompts) {
      increment.prompts = 1;
    }

    // Track E2E runs
    if (options.trackE2eRuns) {
      increment.e2eRuns = 1;
    }

    // Track bytes out
    if (options.trackBytesOut) {
      const responseBody = await response.text();
      increment.bytesOut = new TextEncoder().encode(responseBody).length;
    }

    // Skip if nothing to track
    if (Object.keys(increment).length === 0) {
      return;
    }

    // Track the usage
    await usageTrackingService.incrementUsage(userId, increment, {
      endpoint: req.nextUrl.pathname,
      method: req.method,
      userAgent: req.headers.get('user-agent'),
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Failed to track post-request usage:', error);
    // Don't throw - tracking should not affect response
  }
}

/**
 * Middleware factory for specific endpoint types
 */
export const usageMiddleware = {
  /**
   * For prompt/chat endpoints
   */
  prompts: (
    handler: (req: NextRequest, context: UsageContext) => Promise<NextResponse>
  ) =>
    withUsageTracking(handler, {
      trackPrompts: true,
      trackBytesOut: true,
    }),

  /**
   * For E2E test run endpoints
   */
  e2eRuns: (
    handler: (req: NextRequest, context: UsageContext) => Promise<NextResponse>
  ) =>
    withUsageTracking(handler, {
      trackE2eRuns: true,
      trackBytesOut: true,
    }),

  /**
   * For git export endpoints
   */
  gitExport: (
    handler: (req: NextRequest, context: UsageContext) => Promise<NextResponse>
  ) =>
    withUsageTracking(handler, {
      requireFeature: 'gitExport',
      trackBytesOut: true,
    }),

  /**
   * For multi-user features (teams)
   */
  multiUser: (
    handler: (req: NextRequest, context: UsageContext) => Promise<NextResponse>
  ) =>
    withUsageTracking(handler, {
      requireFeature: 'multiUser',
    }),

  /**
   * For project snapshots
   */
  snapshots: (
    handler: (req: NextRequest, context: UsageContext) => Promise<NextResponse>
  ) =>
    withUsageTracking(handler, {
      requireFeature: 'activeProjectSnapshots',
      trackBytesOut: true,
    }),

  /**
   * For admin endpoints
   */
  admin: (
    handler: (req: NextRequest, context: UsageContext) => Promise<NextResponse>
  ) =>
    withUsageTracking(handler, {
      adminBypass: true,
      skipUsageCheck: true,
    }),
};

/**
 * Direct usage tracking function for use in API routes
 */
export async function trackUsage(
  userId: string,
  increment: UsageIncrement,
  metadata?: any
): Promise<void> {
  await usageTrackingService.incrementUsage(userId, increment, metadata);
}

/**
 * Check if user can perform action (for manual checks)
 */
export async function checkUsage(
  userId: string,
  action: keyof UsageIncrement,
  increment: number = 1
) {
  return await usageTrackingService.checkUsageAllowed(userId, action, increment);
}

/**
 * Check if user can use feature (for manual checks)
 */
export async function checkFeature(
  userId: string,
  feature: 'gitExport' | 'multiUser' | 'activeProjectSnapshots'
) {
  return await usageTrackingService.checkFeatureAllowed(userId, feature);
}