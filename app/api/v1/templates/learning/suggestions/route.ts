/**
 * Template Learning Suggestions API
 *
 * Provides personalized template learning suggestions based on user corrections
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { templateFeedbackIntegration } from '@/services/templates/feedback-integration';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/templates/learning/suggestions
 * Get personalized template learning suggestions
 */
export async function GET(request: NextRequest) {
  return withSpan('api.templates.learning.suggestions', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_learning_suggestions',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'template_suggestions', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 20);
      const priority = url.searchParams.get('priority') as 'low' | 'medium' | 'high' | undefined;
      const category = url.searchParams.get('category') || undefined;

      // Get learning suggestions
      const suggestions = await templateFeedbackIntegration.getLearningSuggestions(userId, limit);

      // Filter by priority if specified
      const filteredSuggestions = priority
        ? suggestions.filter(s => s.priority === priority)
        : suggestions;

      // Filter by category if specified
      const finalSuggestions = category
        ? filteredSuggestions.filter(s => s.category === category)
        : filteredSuggestions;

      addSpanAttributes(span, {
        'suggestions.total': suggestions.length,
        'suggestions.filtered': finalSuggestions.length,
        'suggestions.high_priority': suggestions.filter(s => s.priority === 'high').length,
        'filter.priority': priority || 'all',
        'filter.category': category || 'all',
      });

      // Group suggestions by priority for better organization
      const groupedSuggestions = {
        high: finalSuggestions.filter(s => s.priority === 'high'),
        medium: finalSuggestions.filter(s => s.priority === 'medium'),
        low: finalSuggestions.filter(s => s.priority === 'low'),
      };

      return NextResponse.json({
        success: true,
        data: {
          suggestions: finalSuggestions.slice(0, limit),
          grouped: groupedSuggestions,
          summary: {
            total: finalSuggestions.length,
            highPriority: groupedSuggestions.high.length,
            mediumPriority: groupedSuggestions.medium.length,
            lowPriority: groupedSuggestions.low.length,
            categories: [...new Set(finalSuggestions.map(s => s.category).filter(Boolean))],
          },
        },
        pagination: {
          limit,
          total: finalSuggestions.length,
          hasMore: finalSuggestions.length > limit,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get template learning suggestions:', error);

      return NextResponse.json(
        { error: 'Failed to get template learning suggestions' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/templates/learning/suggestions
 * Process multiple corrections and generate suggestions
 */
export async function POST(request: NextRequest) {
  return withSpan('api.templates.learning.process_corrections', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_corrections_process',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'template_process_corrections', 10, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate corrections array
      if (!body.corrections || !Array.isArray(body.corrections)) {
        return NextResponse.json(
          { error: 'Corrections array is required' },
          { status: 400 }
        );
      }

      if (body.corrections.length === 0) {
        return NextResponse.json(
          { error: 'At least one correction is required' },
          { status: 400 }
        );
      }

      if (body.corrections.length > 50) {
        return NextResponse.json(
          { error: 'Maximum 50 corrections allowed per request' },
          { status: 400 }
        );
      }

      // Validate each correction
      for (const correction of body.corrections) {
        if (!correction.projectId || !correction.filePath || !correction.originalContent || !correction.correctedContent) {
          return NextResponse.json(
            { error: 'Each correction must have projectId, filePath, originalContent, and correctedContent' },
            { status: 400 }
          );
        }

        if (!correction.correctionType || !['syntax', 'logic', 'style', 'optimization', 'security', 'template'].includes(correction.correctionType)) {
          return NextResponse.json(
            { error: 'Each correction must have a valid correctionType' },
            { status: 400 }
          );
        }

        if (typeof correction.confidence !== 'number' || correction.confidence < 0 || correction.confidence > 1) {
          return NextResponse.json(
            { error: 'Each correction must have a confidence between 0 and 1' },
            { status: 400 }
          );
        }
      }

      // Add userId to each correction
      const correctionsWithUser = body.corrections.map((correction: any) => ({
        ...correction,
        userId,
      }));

      addSpanAttributes(span, {
        'corrections.count': correctionsWithUser.length,
        'corrections.avg_confidence': correctionsWithUser.reduce((sum: number, c: any) => sum + c.confidence, 0) / correctionsWithUser.length,
      });

      // Process corrections and generate suggestions
      const suggestions = await templateFeedbackIntegration.processProjectCorrections(correctionsWithUser);

      addSpanAttributes(span, {
        'suggestions.generated': suggestions.length,
        'suggestions.auto_created': suggestions.filter(s => s.confidence >= 0.9).length,
      });

      return NextResponse.json({
        success: true,
        data: {
          suggestions,
          summary: {
            correctionsProcessed: correctionsWithUser.length,
            suggestionsGenerated: suggestions.length,
            autoCreatedTemplates: suggestions.filter(s => s.confidence >= 0.9).length,
            highPrioritySuggestions: suggestions.filter(s => s.priority === 'high').length,
          },
        },
        message: `Processed ${correctionsWithUser.length} corrections and generated ${suggestions.length} template suggestions`,
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to process corrections for template learning:', error);

      if ((error as Error).message.includes('validation')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to process corrections for template learning' },
        { status: 500 }
      );
    }
  });
}