/**
 * Review Requests API Routes
 *
 * Handles review request creation and management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { commentsManager, ReviewCreateInput, ReviewFilter } from '@/services/comments/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/reviews
 * List review requests with filtering
 */
export async function GET(request: NextRequest) {
  return withSpan('api.reviews.list', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'reviews_list',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'reviews_list', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const projectId = url.searchParams.get('projectId') || undefined;
      const status = url.searchParams.get('status') as 'pending' | 'approved' | 'rejected' | undefined;
      const reviewerId = url.searchParams.get('reviewerId') || undefined;
      const authorId = url.searchParams.get('authorId') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const dateFrom = url.searchParams.get('dateFrom')
        ? new Date(url.searchParams.get('dateFrom')!)
        : undefined;
      const dateTo = url.searchParams.get('dateTo')
        ? new Date(url.searchParams.get('dateTo')!)
        : undefined;

      const filter: ReviewFilter = {
        projectId,
        status,
        reviewerId,
        authorId,
        dateFrom,
        dateTo,
        limit: Math.min(limit, 100), // Cap at 100
        offset,
      };

      const result = await commentsManager.listReviews(filter);

      return NextResponse.json({
        success: true,
        data: result.reviews,
        pagination: {
          limit: filter.limit,
          offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to list reviews:', error);

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to list reviews' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/reviews
 * Create new review request
 */
export async function POST(request: NextRequest) {
  return withSpan('api.reviews.create', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'review_create',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'review_create', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.projectId || typeof body.projectId !== 'string') {
        return NextResponse.json(
          { error: 'Project ID is required' },
          { status: 400 }
        );
      }

      if (!body.title || typeof body.title !== 'string') {
        return NextResponse.json(
          { error: 'Review title is required' },
          { status: 400 }
        );
      }

      if (body.title.length < 3 || body.title.length > 200) {
        return NextResponse.json(
          { error: 'Review title must be between 3 and 200 characters' },
          { status: 400 }
        );
      }

      if (body.description && (typeof body.description !== 'string' || body.description.length > 5000)) {
        return NextResponse.json(
          { error: 'Review description must be a string and less than 5000 characters' },
          { status: 400 }
        );
      }

      if (!Array.isArray(body.reviewerIds) || body.reviewerIds.length === 0) {
        return NextResponse.json(
          { error: 'At least one reviewer is required' },
          { status: 400 }
        );
      }

      if (body.reviewerIds.length > 10) {
        return NextResponse.json(
          { error: 'Maximum of 10 reviewers allowed' },
          { status: 400 }
        );
      }

      // Validate reviewer IDs are strings
      if (!body.reviewerIds.every((id: any) => typeof id === 'string')) {
        return NextResponse.json(
          { error: 'All reviewer IDs must be strings' },
          { status: 400 }
        );
      }

      const input: ReviewCreateInput = {
        projectId: body.projectId,
        authorId: userId,
        title: body.title,
        description: body.description,
        reviewerIds: body.reviewerIds,
        files: body.files || [],
        dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
        priority: body.priority || 'medium',
      };

      const review = await commentsManager.createReview(input);

      return NextResponse.json({
        success: true,
        data: review,
        message: 'Review request created successfully',
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to create review:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found' },
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
        { error: 'Failed to create review request' },
        { status: 500 }
      );
    }
  });
}