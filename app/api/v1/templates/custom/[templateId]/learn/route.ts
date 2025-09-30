/**
 * Template Learning API
 *
 * Handles learning from corrections and feedback to improve templates
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
 * POST /api/v1/templates/custom/[templateId]/learn
 * Submit corrections and feedback for template learning
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.templates.custom.learn', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_learn',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'template.id': params.templateId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'template_learn', 30, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate corrections if provided
      if (body.corrections) {
        if (!Array.isArray(body.corrections)) {
          return NextResponse.json(
            { error: 'Corrections must be an array' },
            { status: 400 }
          );
        }

        for (const correction of body.corrections) {
          if (!correction.filePath || typeof correction.filePath !== 'string') {
            return NextResponse.json(
              { error: 'Each correction must have a valid filePath' },
              { status: 400 }
            );
          }

          if (!correction.originalContent || typeof correction.originalContent !== 'string') {
            return NextResponse.json(
              { error: 'Each correction must have originalContent' },
              { status: 400 }
            );
          }

          if (!correction.correctedContent || typeof correction.correctedContent !== 'string') {
            return NextResponse.json(
              { error: 'Each correction must have correctedContent' },
              { status: 400 }
            );
          }

          if (!correction.correctionType || !['syntax', 'logic', 'style', 'optimization', 'security'].includes(correction.correctionType)) {
            return NextResponse.json(
              { error: 'Correction type must be one of: syntax, logic, style, optimization, security' },
              { status: 400 }
            );
          }

          if (typeof correction.confidence !== 'number' || correction.confidence < 0 || correction.confidence > 1) {
            return NextResponse.json(
              { error: 'Correction confidence must be a number between 0 and 1' },
              { status: 400 }
            );
          }
        }
      }

      // Validate feedback if provided
      if (body.feedback) {
        if (typeof body.feedback.rating !== 'number' || body.feedback.rating < 1 || body.feedback.rating > 5) {
          return NextResponse.json(
            { error: 'Feedback rating must be a number between 1 and 5' },
            { status: 400 }
          );
        }

        if (body.feedback.comment && typeof body.feedback.comment !== 'string') {
          return NextResponse.json(
            { error: 'Feedback comment must be a string' },
            { status: 400 }
          );
        }

        if (body.feedback.suggestions && !Array.isArray(body.feedback.suggestions)) {
          return NextResponse.json(
            { error: 'Feedback suggestions must be an array' },
            { status: 400 }
          );
        }
      }

      if (!body.corrections && !body.feedback) {
        return NextResponse.json(
          { error: 'Either corrections or feedback must be provided' },
          { status: 400 }
        );
      }

      const learningInput = {
        templateId: params.templateId,
        corrections: body.corrections || [],
        feedback: body.feedback,
      };

      addSpanAttributes(span, {
        'corrections.count': learningInput.corrections.length,
        'feedback.provided': !!learningInput.feedback,
        'feedback.rating': learningInput.feedback?.rating,
      });

      const updatedTemplate = await customTemplatesService.learnFromCorrections(learningInput);

      return NextResponse.json({
        success: true,
        data: updatedTemplate,
        message: 'Template learning updated successfully',
        summary: {
          correctionsProcessed: learningInput.corrections.length,
          feedbackRecorded: !!learningInput.feedback,
          totalLearningData: updatedTemplate.manifest.learningData?.sourceCorrections.length || 0,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update template learning:', error);

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

      if ((error as Error).message.includes('validation')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update template learning' },
        { status: 500 }
      );
    }
  });
}