/**
 * Preview Branches API Routes
 *
 * Handles creation and management of isolated preview branches.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { previewBranches } from '@/services/previewBranches';
import { withSpan, addSpanAttributes } from '@/lib/observability/otel';

/**
 * GET /api/v1/preview/branches
 * List user's preview branches
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  return withSpan('preview-branches.list-api', async (span) => {
    try {
      const { userId } = await auth();

      if (!userId) {
        addSpanAttributes({ 'auth.status': 'unauthorized' });
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes({
        'operation.type': 'api_request',
        'http.method': 'GET',
        'http.route': '/api/v1/preview/branches',
        'auth.status': 'authorized',
        'user.id': userId,
      });

      const url = new URL(request.url);
      const projectId = url.searchParams.get('projectId');

      if (!projectId) {
        return NextResponse.json(
          { error: 'Project ID is required' },
          { status: 400 }
        );
      }

      const branches = await previewBranches.listPreviewBranches(projectId);

      addSpanAttributes({
        'response.status': 'success',
        'branches.count': branches.length,
      });

      return NextResponse.json({
        success: true,
        data: branches,
      });
    } catch (error) {
      addSpanAttributes({
        'response.status': 'error',
        'error.message': error instanceof Error ? error.message : 'Unknown error'
      });
      console.error('Failed to list preview branches:', error);

      return NextResponse.json(
        { error: 'Failed to list preview branches' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/preview/branches
 * Create new preview branch
 */
export async function POST(request: NextRequest) {
  return withSpan('preview-branches.create-api', async (span) => {
    try {
      const { userId } = await auth();

      if (!userId) {
        addSpanAttributes({ 'auth.status': 'unauthorized' });
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes({
        'operation.type': 'api_request',
        'http.method': 'POST',
        'http.route': '/api/v1/preview/branches',
        'auth.status': 'authorized',
        'user.id': userId,
      });

      const body = await request.json();

      // Validate input
      if (!body.branchName || typeof body.branchName !== 'string') {
        return NextResponse.json(
          { error: 'Branch name is required' },
          { status: 400 }
        );
      }

      if (!body.projectId || typeof body.projectId !== 'string') {
        return NextResponse.json(
          { error: 'Project ID is required' },
          { status: 400 }
        );
      }

      if (body.branchName.length < 2 || body.branchName.length > 50) {
        return NextResponse.json(
          { error: 'Branch name must be between 2 and 50 characters' },
          { status: 400 }
        );
      }

      // Validate name format
      if (!/^[a-zA-Z0-9-_\s]+$/.test(body.branchName)) {
        return NextResponse.json(
          { error: 'Branch name can only contain letters, numbers, hyphens, underscores, and spaces' },
          { status: 400 }
        );
      }

      addSpanAttributes({
        'project.id': body.projectId,
        'branch.name': body.branchName,
      });

      const branch = await previewBranches.createPreviewBranch({
        projectId: body.projectId,
        branchName: body.branchName,
        description: body.description,
        sourceBranch: body.sourceBranch,
      });

      addSpanAttributes({
        'response.status': 'success',
        'branch.id': branch.id,
      });

      return NextResponse.json({
        success: true,
        data: branch,
        message: 'Preview branch created successfully',
      }, { status: 201 });
    } catch (error) {
      addSpanAttributes({
        'response.status': 'error',
        'error.message': error instanceof Error ? error.message : 'Unknown error'
      });
      console.error('Failed to create preview branch:', error);

      if ((error as Error).message.includes('validation') || (error as Error).message.includes('required')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create preview branch' },
        { status: 500 }
      );
    }
  });
}