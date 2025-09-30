/**
 * Preview Branch Merge API Routes
 *
 * Handles merging preview branch changes back to main branches.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { neonBranchManager, BranchMergeOptions } from '@/services/preview/neon-branches';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    branchId: string;
  };
}

/**
 * POST /api/v1/preview/branches/[branchId]/merge
 * Merge preview branch changes
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.preview.branch.merge', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'preview_branch_merge',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'branch.id': params.branchId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'preview_branch_merge', 5, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.targetBranchId || typeof body.targetBranchId !== 'string') {
        return NextResponse.json(
          { error: 'Target branch ID is required' },
          { status: 400 }
        );
      }

      const validStrategies = ['merge', 'squash', 'rebase'];
      if (!body.strategy || !validStrategies.includes(body.strategy)) {
        return NextResponse.json(
          { error: 'Valid merge strategy is required (merge, squash, rebase)' },
          { status: 400 }
        );
      }

      const options: BranchMergeOptions = {
        sourceBranchId: params.branchId,
        targetBranchId: body.targetBranchId,
        userId,
        strategy: body.strategy,
        deleteSourceAfterMerge: body.deleteSourceAfterMerge || false,
        conflictResolution: body.conflictResolution || 'auto',
      };

      addSpanAttributes(span, {
        'merge.target_branch': body.targetBranchId,
        'merge.strategy': body.strategy,
        'merge.delete_source': options.deleteSourceAfterMerge,
      });

      const result = await neonBranchManager.mergeBranch(options);

      return NextResponse.json({
        success: true,
        data: result,
        message: result.success ? 'Branch merged successfully' : 'Merge failed due to conflicts',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to merge preview branch:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Branch not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('Permission denied') || (error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Permission denied' },
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
        { error: 'Failed to merge branch' },
        { status: 500 }
      );
    }
  });
}