/**
 * Plugin Enable/Disable API Routes
 *
 * Handles enabling and disabling plugins with proper
 * lifecycle hook execution and validation.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { pluginManager } from '@/services/plugins/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    pluginId: string;
  };
}

/**
 * POST /api/v1/plugins/[pluginId]/enable
 * Enable a plugin
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.plugins.enable', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_enable',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'plugin.id': params.pluginId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'plugin_enable', 30, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const plugin = await pluginManager.enablePlugin(params.pluginId, userId);

      return NextResponse.json({
        success: true,
        data: plugin,
        message: 'Plugin enabled successfully',
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to enable plugin:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Plugin not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('already enabled')) {
        return NextResponse.json(
          { error: 'Plugin is already enabled' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to enable plugin' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/plugins/[pluginId]/enable
 * Disable a plugin
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.plugins.disable', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_disable',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'plugin.id': params.pluginId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'plugin_disable', 30, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const plugin = await pluginManager.disablePlugin(params.pluginId, userId);

      return NextResponse.json({
        success: true,
        data: plugin,
        message: 'Plugin disabled successfully',
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to disable plugin:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Plugin not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('already disabled')) {
        return NextResponse.json(
          { error: 'Plugin is already disabled' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to disable plugin' },
        { status: 500 }
      );
    }
  });
}