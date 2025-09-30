/**
 * Review Submission API Routes
 *
 * Handles review submission and status changes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { commentsManager } from '@/services/comments/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    reviewId: string;
  };
}

/**
 * POST /api/v1/reviews/[reviewId]/submit
 * Submit review with approval/rejection
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.review.submit', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'review_submit',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'review.id': params.reviewId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'review_submit', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      const validStatuses = ['approved', 'rejected', 'needs_changes'];
      if (!body.status || !validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: 'Status must be one of: approved, rejected, needs_changes' },
          { status: 400 }
        );
      }

      if (body.feedback && (typeof body.feedback !== 'string' || body.feedback.length > 5000)) {
        return NextResponse.json(
          { error: 'Feedback must be a string and less than 5000 characters' },
          { status: 400 }
        );
      }

      addSpanAttributes(span, {
        'review.status': body.status,
        'review.has_feedback': !!body.feedback,
      });

      const review = await commentsManager.submitReview(
        params.reviewId,
        userId,
        body.status,
        body.feedback
      );

      const statusMessages = {
        approved: 'Review approved successfully',
        rejected: 'Review rejected',
        needs_changes: 'Review submitted with change requests',
      };

      return NextResponse.json({
        success: true,
        data: review,
        message: statusMessages[body.status as keyof typeof statusMessages],
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to submit review:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Review not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('Access denied') || (error as Error).message.includes('not a reviewer')) {
        return NextResponse.json(
          { error: 'Access denied - you are not a reviewer for this request' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('already submitted')) {
        return NextResponse.json(
          { error: 'You have already submitted a review for this request' },
          { status: 409 }
        );
      }

      if ((error as Error).message.includes('validation') || (error as Error).message.includes('required')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to submit review' },
        { status: 500 }
      );
    }
  });
}