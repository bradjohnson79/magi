/**
 * Individual Preview Branch API Routes
 *
 * Handles operations on specific preview branches.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { neonBranchManager } from '@/services/preview/neon-branches';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    branchId: string;
  };
}

/**
 * GET /api/v1/preview/branches/[branchId]
 * Get preview branch details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.preview.branch.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'preview_branch_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'branch.id': params.branchId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'preview_branch_get', 200, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const branch = await neonBranchManager.getBranch(params.branchId, userId);

      return NextResponse.json({
        success: true,
        data: branch,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get preview branch:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Preview branch not found' },
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
        { error: 'Failed to get preview branch' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/preview/branches/[branchId]
 * Delete preview branch
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.preview.branch.delete', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'preview_branch_delete',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'branch.id': params.branchId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'preview_branch_delete', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      await neonBranchManager.deleteBranch(params.branchId, userId);

      return NextResponse.json({
        success: true,
        message: 'Preview branch deleted successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to delete preview branch:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Preview branch not found' },
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
        { error: 'Failed to delete preview branch' },
        { status: 500 }
      );
    }
  });
}