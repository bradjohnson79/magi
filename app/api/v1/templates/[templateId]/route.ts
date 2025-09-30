/**
 * Individual Template API Routes
 *
 * Handles operations on specific templates.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { templateManager } from '@/services/templates/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    templateId: string;
  };
}

/**
 * GET /api/v1/templates/[templateId]
 * Get template details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.template.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId || 'anonymous',
        'template.id': params.templateId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(
        userId || 'anonymous',
        'template_get',
        200,
        3600
      );
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const template = await templateManager.getTemplate(params.templateId, userId);

      return NextResponse.json({
        success: true,
        data: template,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get template:', error);

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
        { error: 'Failed to get template' },
        { status: 500 }
      );
    }
  });
}