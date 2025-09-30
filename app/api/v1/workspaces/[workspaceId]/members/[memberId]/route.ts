/**
 * Individual Workspace Member API Routes
 *
 * Handles operations on specific workspace members including update and remove.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { workspaceManager, WorkspaceRole } from '@/services/workspace/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    workspaceId: string;
    memberId: string;
  };
}

/**
 * PUT /api/v1/workspaces/[workspaceId]/members/[memberId]
 * Update workspace member
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.workspace.member.update', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_member_update',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'workspace.id': params.workspaceId,
        'member.id': params.memberId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'workspace_member_update', 50, 3600); // 50 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate role if provided
      if (body.role && !Object.values(WorkspaceRole).includes(body.role)) {
        return NextResponse.json(
          { error: 'Invalid role' },
          { status: 400 }
        );
      }

      const member = await workspaceManager.updateMember(
        params.workspaceId,
        params.memberId,
        userId,
        {
          role: body.role,
          permissions: body.permissions,
        }
      );

      return NextResponse.json({
        success: true,
        data: member,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update workspace member:', error);

      if ((error as Error).message.includes('Permission denied')) {
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update workspace member' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/workspaces/[workspaceId]/members/[memberId]
 * Remove workspace member
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.workspace.member.remove', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_member_remove',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'workspace.id': params.workspaceId,
        'member.id': params.memberId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'workspace_member_remove', 20, 3600); // 20 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      await workspaceManager.removeMember(
        params.workspaceId,
        params.memberId,
        userId
      );

      return NextResponse.json({
        success: true,
        message: 'Member removed successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to remove workspace member:', error);

      if ((error as Error).message.includes('Permission denied')) {
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('Cannot remove workspace owner')) {
        return NextResponse.json(
          { error: 'Cannot remove workspace owner' },
          { status: 400 }
        );
      }

      if ((error as Error).message.includes('Member not found')) {
        return NextResponse.json(
          { error: 'Member not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to remove workspace member' },
        { status: 500 }
      );
    }
  });
}