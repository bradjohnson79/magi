/**
 * Activity Statistics API Routes
 *
 * Handles activity statistics and analytics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { activityLogger } from '@/services/activity/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/activity/stats
 * Get activity statistics
 */
export async function GET(request: NextRequest) {
  return withSpan('api.activity.stats', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_stats',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'activity_stats', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const workspaceId = url.searchParams.get('workspaceId') || undefined;
      const days = parseInt(url.searchParams.get('days') || '30');

      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);

      const [userStats, timeline] = await Promise.all([
        activityLogger.getUserActivityStats(userId, workspaceId, dateFrom),
        workspaceId ? activityLogger.getActivityTimeline(workspaceId, userId, days) : null,
      ]);

      return NextResponse.json({
        success: true,
        data: {
          userStats,
          timeline,
          period: {
            days,
            from: dateFrom.toISOString(),
            to: new Date().toISOString(),
          },
        },
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get activity stats:', error);

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to get activity statistics' },
        { status: 500 }
      );
    }
  });
}