/**
 * Plugin Execution API Routes
 *
 * Handles plugin execution requests with proper validation,
 * resource management, and result tracking.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { pluginRouter } from '@/services/plugins/router';
import { PluginValidator } from '@/services/plugins/schema';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    pluginId: string;
  };
}

/**
 * POST /api/v1/plugins/[pluginId]/execute
 * Execute a plugin with provided inputs
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.plugins.execute', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_execute',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'plugin.id': params.pluginId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'plugin_execute', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate required fields
      if (!body.input || typeof body.input !== 'object') {
        return NextResponse.json(
          { error: 'Plugin input is required' },
          { status: 400 }
        );
      }

      // Build execution context
      const context = {
        pluginId: params.pluginId,
        userId,
        projectId: body.projectId,
        workspaceId: body.workspaceId,
        sessionId: body.sessionId || `session-${Date.now()}`,
        traceId: body.traceId,
        input: body.input,
        config: body.config || {},
        metadata: {
          userAgent: request.headers.get('user-agent'),
          timestamp: new Date().toISOString(),
          ...body.metadata,
        },
      };

      // Validate execution context
      let validatedContext;
      try {
        validatedContext = PluginValidator.validateExecutionContext(context);
      } catch (error) {
        return NextResponse.json(
          { error: `Invalid execution context: ${(error as Error).message}` },
          { status: 400 }
        );
      }

      addSpanAttributes(span, {
        'execution.session_id': validatedContext.sessionId,
        'execution.project_id': validatedContext.projectId || 'none',
        'execution.workspace_id': validatedContext.workspaceId || 'none',
      });

      // Execute plugin through router
      const result = await pluginRouter.executePlugin(validatedContext);

      // Validate execution result
      let validatedResult;
      try {
        validatedResult = PluginValidator.validateExecutionResult(result);
      } catch (error) {
        console.error('Plugin execution result validation failed:', error);
        // Return the result anyway but log the validation error
        validatedResult = result;
      }

      addSpanAttributes(span, {
        'execution.success': validatedResult.success,
        'execution.time': validatedResult.metadata.executionTime,
        'execution.tokens_used': validatedResult.metadata.tokensUsed || 0,
        'execution.cost': validatedResult.metadata.cost || 0,
      });

      const statusCode = validatedResult.success ? 200 : 500;

      return NextResponse.json({
        success: validatedResult.success,
        data: validatedResult.output,
        metadata: validatedResult.metadata,
        logs: validatedResult.logs,
        error: validatedResult.error,
      }, { status: statusCode });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to execute plugin:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Plugin not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('not enabled') || (error as Error).message.includes('disabled')) {
        return NextResponse.json(
          { error: 'Plugin is not enabled' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('timeout')) {
        return NextResponse.json(
          { error: 'Plugin execution timed out' },
          { status: 408 }
        );
      }

      if ((error as Error).message.includes('permission') || (error as Error).message.includes('access')) {
        return NextResponse.json(
          { error: 'Insufficient permissions to execute plugin' },
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
        {
          error: 'Plugin execution failed',
          details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined,
        },
        { status: 500 }
      );
    }
  });
}