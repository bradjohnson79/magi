/**
 * Create Template from Project API
 *
 * Handles creating custom templates from existing projects with learning capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { customTemplatesService } from '@/services/templates/custom';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * POST /api/v1/templates/custom/from-project
 * Create custom template from existing project
 */
export async function POST(request: NextRequest) {
  return withSpan('api.templates.custom.from_project', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_from_project',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'template_from_project', 10, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate required fields
      if (!body.projectId || typeof body.projectId !== 'string') {
        return NextResponse.json(
          { error: 'Project ID is required' },
          { status: 400 }
        );
      }

      if (!body.templateName || typeof body.templateName !== 'string') {
        return NextResponse.json(
          { error: 'Template name is required' },
          { status: 400 }
        );
      }

      if (body.templateName.length < 2 || body.templateName.length > 100) {
        return NextResponse.json(
          { error: 'Template name must be between 2 and 100 characters' },
          { status: 400 }
        );
      }

      if (body.description && body.description.length > 1000) {
        return NextResponse.json(
          { error: 'Template description must be less than 1000 characters' },
          { status: 400 }
        );
      }

      if (body.tags && (!Array.isArray(body.tags) || body.tags.length > 10)) {
        return NextResponse.json(
          { error: 'Tags must be an array with maximum 10 items' },
          { status: 400 }
        );
      }

      const options = {
        description: body.description,
        category: body.category,
        tags: body.tags || [],
        isPublic: body.isPublic || false,
        includeCorrections: body.includeCorrections || false,
      };

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.PROJECT_ID]: body.projectId,
        'template.name': body.templateName,
        'template.include_corrections': options.includeCorrections,
        'template.is_public': options.isPublic,
      });

      const template = await customTemplatesService.createFromProject(
        body.projectId,
        userId,
        body.templateName,
        options
      );

      return NextResponse.json({
        success: true,
        data: template,
        message: 'Template created from project successfully',
      }, { status: 201 });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to create template from project:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied to project' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('validation')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create template from project' },
        { status: 500 }
      );
    }
  });
}