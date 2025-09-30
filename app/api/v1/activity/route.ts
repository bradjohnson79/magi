/**
 * Activity Feed API Routes
 *
 * Handles activity feed retrieval and management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { activityLogger, ActivityFilter } from '@/services/activity/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/activity
 * Get activity feed with filtering
 */
export async function GET(request: NextRequest) {
  return withSpan('api.activity.get_feed', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_feed_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'activity_feed', 200, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const workspaceId = url.searchParams.get('workspaceId') || undefined;
      const projectId = url.searchParams.get('projectId') || undefined;
      const action = url.searchParams.get('action') || undefined;
      const target = url.searchParams.get('target') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const dateFrom = url.searchParams.get('dateFrom')
        ? new Date(url.searchParams.get('dateFrom')!)
        : undefined;
      const dateTo = url.searchParams.get('dateTo')
        ? new Date(url.searchParams.get('dateTo')!)
        : undefined;

      const filter: ActivityFilter = {
        workspaceId,
        projectId,
        action,
        target,
        dateFrom,
        dateTo,
        limit: Math.min(limit, 100), // Cap at 100
        offset,
      };

      const result = await activityLogger.getActivityFeed(filter);

      return NextResponse.json({
        success: true,
        data: result.activities,
        pagination: {
          limit: filter.limit,
          offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get activity feed:', error);

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to get activity feed' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/activity
 * Log new activity (for manual entries)
 */
export async function POST(request: NextRequest) {
  return withSpan('api.activity.log', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_manual_log',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'activity_log', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.action || typeof body.action !== 'string') {
        return NextResponse.json(
          { error: 'Action is required' },
          { status: 400 }
        );
      }

      // Get client IP and user agent
      const ipAddress = request.headers.get('x-forwarded-for') ||
                      request.headers.get('x-real-ip') ||
                      'unknown';
      const userAgent = request.headers.get('user-agent') || 'unknown';

      const activity = await activityLogger.logActivity({
        workspaceId: body.workspaceId,
        projectId: body.projectId,
        userId,
        action: body.action,
        target: body.target,
        targetId: body.targetId,
        metadata: body.metadata || {},
        changes: body.changes || [],
        ipAddress,
        userAgent,
      });

      return NextResponse.json({
        success: true,
        data: activity,
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to log activity:', error);

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('validation') || (error as Error).message.includes('required')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to log activity' },
        { status: 500 }
      );
    }
  });
}