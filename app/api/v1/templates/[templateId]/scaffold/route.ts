/**
 * Template Scaffolding API Routes
 *
 * Handles project scaffolding from templates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { templateManager, ScaffoldOptions } from '@/services/templates/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    templateId: string;
  };
}

/**
 * POST /api/v1/templates/[templateId]/scaffold
 * Scaffold project from template
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.template.scaffold', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_scaffold',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'template.id': params.templateId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'template_scaffold', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.projectName || typeof body.projectName !== 'string') {
        return NextResponse.json(
          { error: 'Project name is required' },
          { status: 400 }
        );
      }

      if (body.projectName.length < 2 || body.projectName.length > 100) {
        return NextResponse.json(
          { error: 'Project name must be between 2 and 100 characters' },
          { status: 400 }
        );
      }

      // Validate project name format (no special characters)
      if (!/^[a-zA-Z0-9-_]+$/.test(body.projectName)) {
        return NextResponse.json(
          { error: 'Project name can only contain letters, numbers, hyphens, and underscores' },
          { status: 400 }
        );
      }

      const options: ScaffoldOptions = {
        projectName: body.projectName,
        variables: body.variables || {},
        targetDirectory: body.targetDirectory,
        userId,
        workspaceId: body.workspaceId,
      };

      const result = await templateManager.scaffoldProject(params.templateId, options);

      return NextResponse.json({
        success: true,
        data: result,
        message: 'Project scaffolded successfully',
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to scaffold project:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Template not found' },
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
        { error: 'Failed to scaffold project' },
        { status: 500 }
      );
    }
  });
}