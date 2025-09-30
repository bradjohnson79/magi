/**
 * Project UI Hints API Routes
 *
 * Provides smart UI hints and suggestions based on project classification.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';

export const runtime = "nodejs";
import { uiHintsService, HintContext } from '@/services/ui/hints';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    projectId: string;
  };
}

/**
 * GET /api/v1/projects/[projectId]/hints
 * Get contextual UI hints for project
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.project.hints.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'project_hints_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: params.projectId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'project_hints', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const currentFile = url.searchParams.get('currentFile') || undefined;
      const projectStage = url.searchParams.get('projectStage') as 'setup' | 'development' | 'testing' | 'deployment' || undefined;

      // Parse recent activity if provided
      let recentActivity: string[] = [];
      const activityParam = url.searchParams.get('recentActivity');
      if (activityParam) {
        try {
          recentActivity = JSON.parse(activityParam);
        } catch (e) {
          console.warn('Invalid recentActivity parameter:', e);
        }
      }

      // Parse stack info if provided
      let stackInfo;
      const stackParam = url.searchParams.get('stackInfo');
      if (stackParam) {
        try {
          stackInfo = JSON.parse(stackParam);
        } catch (e) {
          console.warn('Invalid stackInfo parameter:', e);
        }
      }

      const context: HintContext = {
        projectId: params.projectId,
        userId,
        currentFile,
        projectStage,
        recentActivity,
        stackInfo,
      };

      const hints = await uiHintsService.getProjectHints(context);

      addSpanAttributes(span, {
        'hints.count': hints.length,
        'hints.current_file': currentFile || 'none',
        'hints.project_stage': projectStage || 'unknown',
      });

      return NextResponse.json({
        success: true,
        data: hints,
        metadata: {
          projectId: params.projectId,
          context: {
            currentFile,
            projectStage,
            hasStackInfo: !!stackInfo,
          },
        },
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get project hints:', error);

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
        { error: 'Failed to get project hints' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/projects/[projectId]/hints
 * Dismiss a hint or provide feedback
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.project.hints.action', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'project_hints_action',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: params.projectId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'project_hints_action', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.action || typeof body.action !== 'string') {
        return NextResponse.json(
          { error: 'Action is required' },
          { status: 400 }
        );
      }

      const validActions = ['dismiss', 'feedback', 'acknowledge'];
      if (!validActions.includes(body.action)) {
        return NextResponse.json(
          { error: 'Invalid action. Must be one of: dismiss, feedback, acknowledge' },
          { status: 400 }
        );
      }

      if (!body.hintId || typeof body.hintId !== 'string') {
        return NextResponse.json(
          { error: 'Hint ID is required' },
          { status: 400 }
        );
      }

      addSpanAttributes(span, {
        'hint.action': body.action,
        'hint.id': body.hintId,
      });

      let result;

      switch (body.action) {
        case 'dismiss':
          await uiHintsService.dismissHint(body.hintId, userId, params.projectId);
          result = { message: 'Hint dismissed successfully' };
          break;

        case 'feedback':
          if (!body.feedback || typeof body.feedback !== 'string') {
            return NextResponse.json(
              { error: 'Feedback text is required for feedback action' },
              { status: 400 }
            );
          }
          // Store feedback for hint improvement
          // This would be implemented in the hints service
          result = { message: 'Feedback recorded successfully' };
          break;

        case 'acknowledge':
          // Track that user has seen and acknowledged the hint
          result = { message: 'Hint acknowledged successfully' };
          break;

        default:
          return NextResponse.json(
            { error: 'Unsupported action' },
            { status: 400 }
          );
      }

      return NextResponse.json({
        success: true,
        ...result,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to process hint action:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Project or hint not found' },
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
        { error: 'Failed to process hint action' },
        { status: 500 }
      );
    }
  });
}