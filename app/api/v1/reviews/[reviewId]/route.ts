/**
 * Individual Review Request API Routes
 *
 * Handles operations on specific review requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { commentsManager, ReviewUpdateInput } from '@/services/comments/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    reviewId: string;
  };
}

/**
 * GET /api/v1/reviews/[reviewId]
 * Get specific review request details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.review.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'review_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'review.id': params.reviewId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'review_get', 200, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const review = await commentsManager.getReview(params.reviewId, userId);

      return NextResponse.json({
        success: true,
        data: review,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get review:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Review not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to get review' },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/reviews/[reviewId]
 * Update review request
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.review.update', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'review_update',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'review.id': params.reviewId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'review_update', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Build update input
      const input: ReviewUpdateInput = {
        reviewId: params.reviewId,
        userId,
      };

      if (body.title !== undefined) {
        if (typeof body.title !== 'string' || body.title.length < 3 || body.title.length > 200) {
          return NextResponse.json(
            { error: 'Review title must be between 3 and 200 characters' },
            { status: 400 }
          );
        }
        input.title = body.title;
      }

      if (body.description !== undefined) {
        if (typeof body.description !== 'string' || body.description.length > 5000) {
          return NextResponse.json(
            { error: 'Review description must be a string and less than 5000 characters' },
            { status: 400 }
          );
        }
        input.description = body.description;
      }

      if (body.reviewerIds !== undefined) {
        if (!Array.isArray(body.reviewerIds) || body.reviewerIds.length === 0 || body.reviewerIds.length > 10) {
          return NextResponse.json(
            { error: 'Must have 1-10 reviewers' },
            { status: 400 }
          );
        }
        if (!body.reviewerIds.every((id: any) => typeof id === 'string')) {
          return NextResponse.json(
            { error: 'All reviewer IDs must be strings' },
            { status: 400 }
          );
        }
        input.reviewerIds = body.reviewerIds;
      }

      if (body.files !== undefined) {
        if (!Array.isArray(body.files)) {
          return NextResponse.json(
            { error: 'Files must be an array' },
            { status: 400 }
          );
        }
        input.files = body.files;
      }

      if (body.dueDate !== undefined) {
        input.dueDate = body.dueDate ? new Date(body.dueDate) : null;
      }

      if (body.priority !== undefined) {
        const validPriorities = ['low', 'medium', 'high', 'urgent'];
        if (!validPriorities.includes(body.priority)) {
          return NextResponse.json(
            { error: 'Priority must be one of: low, medium, high, urgent' },
            { status: 400 }
          );
        }
        input.priority = body.priority;
      }

      const review = await commentsManager.updateReview(input);

      return NextResponse.json({
        success: true,
        data: review,
        message: 'Review updated successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update review:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Review not found' },
          { status: 404 }
        );
      }

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
        { error: 'Failed to update review' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/reviews/[reviewId]
 * Delete review request
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.review.delete', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'review_delete',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'review.id': params.reviewId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'review_delete', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      await commentsManager.deleteReview(params.reviewId, userId);

      return NextResponse.json({
        success: true,
        message: 'Review deleted successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to delete review:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Review not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to delete review' },
        { status: 500 }
      );
    }
  });
}