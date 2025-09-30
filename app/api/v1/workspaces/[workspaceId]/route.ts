/**
 * Individual Workspace API Routes
 *
 * Handles operations on specific workspaces including get, update, and delete.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { workspaceManager } from '@/services/workspace/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    workspaceId: string;
  };
}

/**
 * GET /api/v1/workspaces/[workspaceId]
 * Get workspace details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.workspace.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'workspace.id': params.workspaceId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'workspace_get', 200, 3600); // 200 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const workspace = await workspaceManager.getWorkspace(params.workspaceId, userId);

      return NextResponse.json({
        success: true,
        data: workspace,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get workspace:', error);

      if ((error as Error).message.includes('Access denied') || (error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Workspace not found or access denied' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to get workspace' },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/workspaces/[workspaceId]
 * Update workspace
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.workspace.update', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_update',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'workspace.id': params.workspaceId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'workspace_update', 50, 3600); // 50 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (body.name && (typeof body.name !== 'string' || body.name.length < 2 || body.name.length > 100)) {
        return NextResponse.json(
          { error: 'Workspace name must be between 2 and 100 characters' },
          { status: 400 }
        );
      }

      const workspace = await workspaceManager.updateWorkspace(
        params.workspaceId,
        userId,
        body
      );

      return NextResponse.json({
        success: true,
        data: workspace,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update workspace:', error);

      if ((error as Error).message.includes('Permission denied')) {
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('slug already exists')) {
        return NextResponse.json(
          { error: 'Workspace slug already exists' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update workspace' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/workspaces/[workspaceId]
 * Delete workspace
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.workspace.delete', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_delete',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'workspace.id': params.workspaceId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'workspace_delete', 10, 3600); // 10 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      await workspaceManager.deleteWorkspace(params.workspaceId, userId);

      return NextResponse.json({
        success: true,
        message: 'Workspace deleted successfully',
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to delete workspace:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Workspace not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('Only workspace owner')) {
        return NextResponse.json(
          { error: 'Only workspace owner can delete workspace' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to delete workspace' },
        { status: 500 }
      );
    }
  });
}