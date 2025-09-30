/**
 * Project Corrections API
 *
 * Handles recording and managing project corrections for template learning
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { templateFeedbackIntegration } from '@/services/templates/feedback-integration';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    projectId: string;
  };
}

/**
 * POST /api/v1/projects/[projectId]/corrections
 * Record project corrections for template learning
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.projects.corrections.create', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'project_correction_record',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: params.projectId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'project_corrections', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate required fields
      if (!body.filePath || typeof body.filePath !== 'string') {
        return NextResponse.json(
          { error: 'File path is required' },
          { status: 400 }
        );
      }

      if (!body.originalContent || typeof body.originalContent !== 'string') {
        return NextResponse.json(
          { error: 'Original content is required' },
          { status: 400 }
        );
      }

      if (!body.correctedContent || typeof body.correctedContent !== 'string') {
        return NextResponse.json(
          { error: 'Corrected content is required' },
          { status: 400 }
        );
      }

      if (!body.correctionType || !['syntax', 'logic', 'style', 'optimization', 'security', 'template'].includes(body.correctionType)) {
        return NextResponse.json(
          { error: 'Correction type must be one of: syntax, logic, style, optimization, security, template' },
          { status: 400 }
        );
      }

      if (typeof body.confidence !== 'number' || body.confidence < 0 || body.confidence > 1) {
        return NextResponse.json(
          { error: 'Confidence must be a number between 0 and 1' },
          { status: 400 }
        );
      }

      const correction = {
        projectId: params.projectId,
        userId,
        filePath: body.filePath,
        originalContent: body.originalContent,
        correctedContent: body.correctedContent,
        correctionType: body.correctionType,
        confidence: body.confidence,
        description: body.description,
        metadata: body.metadata || {},
      };

      addSpanAttributes(span, {
        'correction.type': correction.correctionType,
        'correction.confidence': correction.confidence,
        'correction.file_path': correction.filePath,
      });

      // Record the correction
      await templateFeedbackIntegration.recordProjectCorrection(correction);

      return NextResponse.json({
        success: true,
        message: 'Project correction recorded successfully',
        data: {
          correctionId: correction.projectId, // This would be the actual ID in real implementation
          learningTriggered: correction.confidence > 0.8, // Simplified check
        },
      }, { status: 201 });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to record project correction:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('Access denied')) {
        return NextResponse.json(
          { error: 'Access denied' },
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
        { error: 'Failed to record project correction' },
        { status: 500 }
      );
    }
  });
}

/**
 * GET /api/v1/projects/[projectId]/corrections
 * Get project corrections history
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.projects.corrections.list', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'project_corrections_list',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: params.projectId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'project_corrections_list', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const correctionType = url.searchParams.get('correctionType') || undefined;
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
      const offset = parseInt(url.searchParams.get('offset') || '0');

      // This would be implemented in the actual service
      const corrections = await templateFeedbackIntegration.getProjectCorrections(
        params.projectId,
        userId,
        {
          correctionType,
          limit,
          offset,
        }
      );

      addSpanAttributes(span, {
        'corrections.count': corrections.length,
        'filter.correction_type': correctionType || 'all',
      });

      return NextResponse.json({
        success: true,
        data: corrections,
        pagination: {
          limit,
          offset,
          hasMore: corrections.length === limit,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get project corrections:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project not found' },
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
        { error: 'Failed to get project corrections' },
        { status: 500 }
      );
    }
  });
}