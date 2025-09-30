/**
 * Comments API Routes
 *
 * Handles comment creation, listing, and management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { commentsManager, CommentCreateInput, CommentFilter } from '@/services/comments/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/comments
 * List comments with filtering
 */
export async function GET(request: NextRequest) {
  return withSpan('api.comments.list', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comments_list',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'comments_list', 200, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const projectId = url.searchParams.get('projectId') || undefined;
      const filePath = url.searchParams.get('filePath') || undefined;
      const isResolved = url.searchParams.get('isResolved');
      const parentId = url.searchParams.get('parentId') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const dateFrom = url.searchParams.get('dateFrom')
        ? new Date(url.searchParams.get('dateFrom')!)
        : undefined;
      const dateTo = url.searchParams.get('dateTo')
        ? new Date(url.searchParams.get('dateTo')!)
        : undefined;

      const filter: CommentFilter = {
        projectId,
        filePath,
        isResolved: isResolved === null ? undefined : isResolved === 'true',
        parentId,
        dateFrom,
        dateTo,
        limit: Math.min(limit, 100), // Cap at 100
        offset,
      };

      const result = await commentsManager.listComments(filter);

      return NextResponse.json({
        success: true,
        data: result.comments,
        pagination: {
          limit: filter.limit,
          offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to list comments:', error);

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to list comments' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/comments
 * Create new comment
 */
export async function POST(request: NextRequest) {
  return withSpan('api.comments.create', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_create',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'comment_create', 100, 3600);
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

      // Validate line numbers if provided
      if (body.lineNumber !== undefined && (typeof body.lineNumber !== 'number' || body.lineNumber < 0)) {
        return NextResponse.json(
          { error: 'Line number must be a positive number' },
          { status: 400 }
        );
      }

      const input: CommentCreateInput = {
        projectId: body.projectId,
        userId,
        content: body.content,
        filePath: body.filePath,
        lineNumber: body.lineNumber,
        startLine: body.startLine,
        endLine: body.endLine,
        position: body.position,
        parentId: body.parentId,
      };

      const comment = await commentsManager.createComment(input);

      return NextResponse.json({
        success: true,
        data: comment,
        message: 'Comment created successfully',
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to create comment:', error);

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
        { error: 'Failed to create comment' },
        { status: 500 }
      );
    }
  });
}