/**
 * Individual Custom Template API Routes
 *
 * Handles operations on specific custom templates
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { customTemplatesService } from '@/services/templates/custom';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    templateId: string;
  };
}

/**
 * GET /api/v1/templates/custom/[templateId]
 * Get specific custom template details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.templates.custom.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId || 'anonymous',
        'template.id': params.templateId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(
        userId || 'anonymous',
        'custom_template_get',
        100,
        3600
      );
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const template = await customTemplatesService.getTemplate(params.templateId, userId);

      if (!template) {
        return NextResponse.json(
          { error: 'Template not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: template,
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get custom template:', error);

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to get custom template' },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/templates/custom/[templateId]
 * Update custom template
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.templates.custom.update', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_update',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'template.id': params.templateId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'custom_template_update', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input if provided
      if (body.name !== undefined) {
        if (typeof body.name !== 'string' || body.name.length < 2 || body.name.length > 100) {
          return NextResponse.json(
            { error: 'Template name must be between 2 and 100 characters' },
            { status: 400 }
          );
        }
      }

      if (body.description !== undefined && body.description && body.description.length > 1000) {
        return NextResponse.json(
          { error: 'Template description must be less than 1000 characters' },
          { status: 400 }
        );
      }

      if (body.tags !== undefined && (!Array.isArray(body.tags) || body.tags.length > 10)) {
        return NextResponse.json(
          { error: 'Tags must be an array with maximum 10 items' },
          { status: 400 }
        );
      }

      if (body.manifest !== undefined && typeof body.manifest !== 'object') {
        return NextResponse.json(
          { error: 'Template manifest must be an object' },
          { status: 400 }
        );
      }

      const updateInput = {
        templateId: params.templateId,
        userId,
        name: body.name,
        description: body.description,
        manifest: body.manifest,
        category: body.category,
        tags: body.tags,
        isPublic: body.isPublic,
        version: body.version,
        metadata: body.metadata,
      };

      const template = await customTemplatesService.updateTemplate(updateInput);

      return NextResponse.json({
        success: true,
        data: template,
        message: 'Custom template updated successfully',
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update custom template:', error);

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

      if ((error as Error).message.includes('validation') || (error as Error).message.includes('must have')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update custom template' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/templates/custom/[templateId]
 * Delete custom template
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.templates.custom.delete', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_delete',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'template.id': params.templateId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'custom_template_delete', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      await customTemplatesService.deleteTemplate(params.templateId, userId);

      return NextResponse.json({
        success: true,
        message: 'Custom template deleted successfully',
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to delete custom template:', error);

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

      return NextResponse.json(
        { error: 'Failed to delete custom template' },
        { status: 500 }
      );
    }
  });
}