/**
 * Workspace Members API Routes
 *
 * Handles member management operations for workspaces.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { workspaceManager, WorkspaceRole } from '@/services/workspace/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    workspaceId: string;
  };
}

/**
 * GET /api/v1/workspaces/[workspaceId]/members
 * Get workspace members
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.workspace.members.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_members_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'workspace.id': params.workspaceId,
      });

      // Validate access
      await workspaceManager.validateMemberAccess(params.workspaceId, userId);

      const workspace = await workspaceManager.getWorkspace(params.workspaceId, userId);

      return NextResponse.json({
        success: true,
        data: workspace.members,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get workspace members:', error);

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to get workspace members' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/workspaces/[workspaceId]/members
 * Add member to workspace
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.workspace.members.add', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_members_add',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'workspace.id': params.workspaceId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'workspace_invite', 20, 3600); // 20 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.email || typeof body.email !== 'string') {
        return NextResponse.json(
          { error: 'Email is required' },
          { status: 400 }
        );
      }

      if (!body.role || !Object.values(WorkspaceRole).includes(body.role)) {
        return NextResponse.json(
          { error: 'Valid role is required' },
          { status: 400 }
        );
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }

      const member = await workspaceManager.inviteMember({
        workspaceId: params.workspaceId,
        email: body.email,
        role: body.role,
        permissions: body.permissions,
        invitedBy: userId,
      });

      return NextResponse.json({
        success: true,
        data: member,
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to add workspace member:', error);

      if ((error as Error).message.includes('Permission denied')) {
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('User not found')) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('already a member')) {
        return NextResponse.json(
          { error: 'User is already a member of this workspace' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to add workspace member' },
        { status: 500 }
      );
    }
  });
}