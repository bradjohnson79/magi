/**
 * Individual Plugin API Routes
 *
 * Handles operations on specific plugins including enable/disable,
 * configuration updates, and plugin details.
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
 * GET /api/v1/plugins/[pluginId]
 * Get specific plugin details
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.plugins.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'plugin.id': params.pluginId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'plugin_get', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const plugin = await pluginManager.getPlugin(params.pluginId);

      if (!plugin) {
        return NextResponse.json(
          { error: 'Plugin not found' },
          { status: 404 }
        );
      }

      // Get usage statistics and health check
      const [usageStats, healthCheck] = await Promise.all([
        pluginManager.getPluginUsageStats(params.pluginId),
        pluginManager.checkPluginHealth(params.pluginId),
      ]);

      return NextResponse.json({
        success: true,
        data: {
          ...plugin,
          usage: usageStats,
          health: healthCheck,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get plugin:', error);

      return NextResponse.json(
        { error: 'Failed to get plugin' },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/plugins/[pluginId]
 * Update plugin configuration
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.plugins.update', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_update',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'plugin.id': params.pluginId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'plugin_update', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.config || typeof body.config !== 'object') {
        return NextResponse.json(
          { error: 'Plugin configuration is required' },
          { status: 400 }
        );
      }

      const plugin = await pluginManager.updatePluginConfig(
        params.pluginId,
        body.config,
        userId
      );

      return NextResponse.json({
        success: true,
        data: plugin,
        message: 'Plugin configuration updated successfully',
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update plugin:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Plugin not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('validation')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update plugin' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/plugins/[pluginId]
 * Uninstall plugin
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.plugins.uninstall', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_uninstall',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'plugin.id': params.pluginId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'plugin_uninstall', 10, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      await pluginManager.uninstallPlugin(params.pluginId, userId);

      return NextResponse.json({
        success: true,
        message: 'Plugin uninstalled successfully',
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to uninstall plugin:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Plugin not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to uninstall plugin' },
        { status: 500 }
      );
    }
  });
}