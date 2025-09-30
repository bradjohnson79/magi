/**
 * Workspace API Routes
 *
 * Handles CRUD operations for workspaces with proper authentication and permissions.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { workspaceManager, WorkspaceCreateInput } from '@/services/workspace/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/workspaces
 * Get user's workspaces
 */
export async function GET(request: NextRequest) {
  return withSpan('api.workspaces.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_list',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'workspace_list', 100, 3600); // 100 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const workspaces = await workspaceManager.getUserWorkspaces(userId);

      return NextResponse.json({
        success: true,
        data: workspaces,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get workspaces:', error);
      return NextResponse.json(
        { error: 'Failed to get workspaces' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/workspaces
 * Create new workspace
 */
export async function POST(request: NextRequest) {
  return withSpan('api.workspaces.create', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_create',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'workspace_create', 10, 3600); // 10 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.name || typeof body.name !== 'string') {
        return NextResponse.json(
          { error: 'Workspace name is required' },
          { status: 400 }
        );
      }

      if (body.name.length < 2 || body.name.length > 100) {
        return NextResponse.json(
          { error: 'Workspace name must be between 2 and 100 characters' },
          { status: 400 }
        );
      }

      const input: WorkspaceCreateInput = {
        name: body.name,
        description: body.description,
        slug: body.slug,
        isPublic: body.isPublic || false,
        settings: body.settings || {},
        ownerId: userId,
      };

      const workspace = await workspaceManager.createWorkspace(input);

      return NextResponse.json({
        success: true,
        data: workspace,
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to create workspace:', error);

      if ((error as Error).message.includes('slug already exists')) {
        return NextResponse.json(
          { error: 'Workspace slug already exists' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create workspace' },
        { status: 500 }
      );
    }
  });
}