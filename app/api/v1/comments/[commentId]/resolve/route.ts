/**
 * Comment Resolution API Routes
 *
 * Handles comment resolution and status changes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { commentsManager } from '@/services/comments/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    commentId: string;
  };
}

/**
 * POST /api/v1/comments/[commentId]/resolve
 * Mark comment as resolved
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.comment.resolve', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_resolve',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'comment.id': params.commentId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'comment_resolve', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const comment = await commentsManager.resolveComment(params.commentId, userId);

      return NextResponse.json({
        success: true,
        data: comment,
        message: 'Comment resolved successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to resolve comment:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Comment not found' },
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
        { error: 'Failed to resolve comment' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/comments/[commentId]/resolve
 * Mark comment as unresolved
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.comment.unresolve', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_unresolve',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'comment.id': params.commentId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'comment_unresolve', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const comment = await commentsManager.unresolveComment(params.commentId, userId);

      return NextResponse.json({
        success: true,
        data: comment,
        message: 'Comment marked as unresolved',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to unresolve comment:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Comment not found' },
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
        { error: 'Failed to unresolve comment' },
        { status: 500 }
      );
    }
  });
}