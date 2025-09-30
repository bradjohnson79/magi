/**
 * Templates API Routes
 *
 * Handles template listing, creation, and management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { templateManager, TemplateCreateInput } from '@/services/templates/manager';
import { ProjectCategory } from '@/services/orch/classifier';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/templates
 * List available templates
 */
export async function GET(request: NextRequest) {
  return withSpan('api.templates.list', async (span) => {
    try {
      const { userId } = getAuth(request);
      const url = new URL(request.url);

      const category = url.searchParams.get('category') || undefined;
      const tags = url.searchParams.get('tags')?.split(',') || undefined;
      const search = url.searchParams.get('search') || undefined;
      const includePrivate = url.searchParams.get('includePrivate') === 'true';
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_list',
        [SPAN_ATTRIBUTES.USER_ID]: userId || 'anonymous',
        'query.category': category || 'all',
        'query.limit': limit,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(
        userId || 'anonymous',
        'template_list',
        100,
        3600
      );
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const result = await templateManager.listTemplates({
        category,
        tags,
        search,
        userId,
        includePrivate,
        limit,
        offset,
      });

      return NextResponse.json({
        success: true,
        data: result.templates,
        pagination: {
          limit,
          offset,
          total: result.total,
          hasMore: offset + limit < result.total,
        },
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to list templates:', error);
      return NextResponse.json(
        { error: 'Failed to list templates' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/templates
 * Create new template
 */
export async function POST(request: NextRequest) {
  return withSpan('api.templates.create', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_create',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'template_create', 10, 3600);
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
          { error: 'Template name is required' },
          { status: 400 }
        );
      }

      if (!body.category || typeof body.category !== 'string') {
        return NextResponse.json(
          { error: 'Template category is required' },
          { status: 400 }
        );
      }

      if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
        return NextResponse.json(
          { error: 'Template must have at least one file' },
          { status: 400 }
        );
      }

      const input: TemplateCreateInput = {
        name: body.name,
        description: body.description,
        category: body.category,
        tags: body.tags || [],
        config: body.config,
        files: body.files,
        dependencies: body.dependencies,
        isPublic: body.isPublic || false,
        createdBy: userId,
      };

      const template = await templateManager.createTemplate(input);

      return NextResponse.json({
        success: true,
        data: template,
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to create template:', error);

      if ((error as Error).message.includes('validation') || (error as Error).message.includes('required')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create template' },
        { status: 500 }
      );
    }
  });
}