/**
 * Individual Comment API Routes
 *
 * Handles operations on specific comments.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { commentsManager, CommentUpdateInput } from '@/services/comments/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    commentId: string;
  };
}

/**
 * GET /api/v1/comments/[commentId]
 * Get specific comment details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.comment.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'comment.id': params.commentId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'comment_get', 500, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const comment = await commentsManager.getComment(params.commentId, userId);

      return NextResponse.json({
        success: true,
        data: comment,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get comment:', error);

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
        { error: 'Failed to get comment' },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/comments/[commentId]
 * Update comment content
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.comment.update', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_update',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'comment.id': params.commentId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'comment_update', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.content || typeof body.content !== 'string') {
        return NextResponse.json(
          { error: 'Comment content is required' },
          { status: 400 }
        );
      }

      if (body.content.length < 1 || body.content.length > 10000) {
        return NextResponse.json(
          { error: 'Comment content must be between 1 and 10000 characters' },
          { status: 400 }
        );
      }

      const input: CommentUpdateInput = {
        commentId: params.commentId,
        userId,
        content: body.content,
      };

      const comment = await commentsManager.updateComment(input);

      return NextResponse.json({
        success: true,
        data: comment,
        message: 'Comment updated successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update comment:', error);

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

      if ((error as Error).message.includes('validation') || (error as Error).message.includes('required')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update comment' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/comments/[commentId]
 * Delete comment
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.comment.delete', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_delete',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'comment.id': params.commentId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'comment_delete', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      await commentsManager.deleteComment(params.commentId, userId);

      return NextResponse.json({
        success: true,
        message: 'Comment deleted successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to delete comment:', error);

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
        { error: 'Failed to delete comment' },
        { status: 500 }
      );
    }
  });
}