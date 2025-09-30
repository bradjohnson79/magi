/**
 * Custom Templates API Routes
 *
 * Handles CRUD operations for user-created custom templates with learning capabilities
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { customTemplatesService } from '@/services/templates/custom';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/templates/custom
 * List custom templates with filtering options
 */
export async function GET(request: NextRequest) {
  return withSpan('api.templates.custom.list', async (span) => {
    try {
      const { userId } = getAuth(request);

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_templates_list',
        [SPAN_ATTRIBUTES.USER_ID]: userId || 'anonymous',
      });

      // Rate limiting (higher for authenticated users)
      const rateLimitKey = userId || 'anonymous';
      const rateLimitResult = await rateLimiter.limit(
        rateLimitKey,
        'custom_templates_list',
        userId ? 200 : 50,
        3600
      );

      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const category = url.searchParams.get('category') || undefined;
      const tags = url.searchParams.get('tags')?.split(',').filter(Boolean) || undefined;
      const isPublic = url.searchParams.get('isPublic');
      const includePublic = url.searchParams.get('includePublic') === 'true';
      const searchTerm = url.searchParams.get('search') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const filter = {
        userId: userId || undefined,
        category,
        tags,
        isPublic: isPublic === 'true' ? true : isPublic === 'false' ? false : undefined,
        includePublic: userId ? includePublic : true, // Anonymous users only see public
        searchTerm,
        limit: Math.min(limit, 100),
        offset,
      };

      const result = await customTemplatesService.listTemplates(filter);

      addSpanAttributes(span, {
        'templates.count': result.templates.length,
        'templates.total': result.total,
        'filter.category': category || 'all',
        'filter.include_public': includePublic,
      });

      return NextResponse.json({
        success: true,
        data: result.templates,
        pagination: {
          limit: filter.limit,
          offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to list custom templates:', error);

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to list custom templates' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/templates/custom
 * Create new custom template
 */
export async function POST(request: NextRequest) {
  return withSpan('api.templates.custom.create', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_create',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'custom_template_create', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate required fields
      if (!body.name || typeof body.name !== 'string') {
        return NextResponse.json(
          { error: 'Template name is required' },
          { status: 400 }
        );
      }

      if (!body.manifest || typeof body.manifest !== 'object') {
        return NextResponse.json(
          { error: 'Template manifest is required' },
          { status: 400 }
        );
      }

      if (body.name.length < 2 || body.name.length > 100) {
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

      const templateInput = {
        userId,
        name: body.name,
        description: body.description,
        manifest: body.manifest,
        category: body.category,
        tags: body.tags || [],
        isPublic: body.isPublic || false,
        sourceProjectId: body.sourceProjectId,
        parentTemplateId: body.parentTemplateId,
      };

      addSpanAttributes(span, {
        'template.name': body.name,
        'template.category': body.category || 'general',
        'template.is_public': body.isPublic || false,
        'template.has_source_project': !!body.sourceProjectId,
      });

      const template = await customTemplatesService.createTemplate(templateInput);

      return NextResponse.json({
        success: true,
        data: template,
        message: 'Custom template created successfully',
      }, { status: 201 });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to create custom template:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Referenced project or template not found' },
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
        { error: 'Failed to create custom template' },
        { status: 500 }
      );
    }
  });
}