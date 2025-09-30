/**
 * Activity Revert API Routes
 *
 * Handles reverting specific activity changes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { activityLogger, RevertOptions } from '@/services/activity/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    activityId: string;
  };
}

/**
 * POST /api/v1/activity/[activityId]/revert
 * Revert activity changes
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.activity.revert', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_revert',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'activity.id': params.activityId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'activity_revert', 10, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      const options: RevertOptions = {
        activityId: params.activityId,
        userId,
        reason: body.reason,
        dryRun: body.dryRun || false,
      };

      const result = await activityLogger.revertActivity(options);

      addSpanAttributes(span, {
        'revert.success': result.success,
        'revert.changes_count': result.changes.length,
        'revert.dry_run': options.dryRun,
      });

      return NextResponse.json({
        success: true,
        data: result,
        message: options.dryRun ? 'Revert preview generated' : 'Activity reverted successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to revert activity:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Activity not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('Permission denied') || (error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('no changes to revert')) {
        return NextResponse.json(
          { error: 'Activity has no changes to revert' },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to revert activity' },
        { status: 500 }
      );
    }
  });
}