/**
 * Plugins API Routes
 *
 * Handles CRUD operations for plugin management including
 * installation, configuration, and lifecycle operations.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { pluginManager } from '@/services/plugins/manager';
import { PluginValidator } from '@/services/plugins/schema';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/plugins
 * List installed plugins with filtering options
 */
export async function GET(request: NextRequest) {
  return withSpan('api.plugins.list', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugins_list',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'plugins_list', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const enabled = url.searchParams.get('enabled');
      const category = url.searchParams.get('category') || undefined;
      const capabilities = url.searchParams.get('capabilities')?.split(',').filter(Boolean) || undefined;
      const search = url.searchParams.get('search') || undefined;
      const installedBy = url.searchParams.get('installedBy') || undefined;
      const limit = parseInt(url.searchParams.get('limit') || '20');
      const offset = parseInt(url.searchParams.get('offset') || '0');

      const options = {
        enabled: enabled === 'true' ? true : enabled === 'false' ? false : undefined,
        category,
        capabilities,
        search,
        installedBy,
        limit: Math.min(limit, 100),
        offset,
      };

      const result = await pluginManager.listPlugins(options);

      addSpanAttributes(span, {
        'plugins.count': result.plugins.length,
        'plugins.total': result.total,
        'filter.enabled': enabled || 'all',
        'filter.category': category || 'all',
      });

      return NextResponse.json({
        success: true,
        data: result.plugins,
        pagination: {
          limit: options.limit,
          offset,
          total: result.total,
          hasMore: result.hasMore,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to list plugins:', error);

      return NextResponse.json(
        { error: 'Failed to list plugins' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/plugins
 * Install a new plugin
 */
export async function POST(request: NextRequest) {
  return withSpan('api.plugins.install', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_install',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'plugin_install', 5, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate required fields
      if (!body.manifest || typeof body.manifest !== 'object') {
        return NextResponse.json(
          { error: 'Plugin manifest is required' },
          { status: 400 }
        );
      }

      // Validate manifest schema
      let validatedManifest;
      try {
        validatedManifest = PluginValidator.validateManifest(body.manifest);
      } catch (error) {
        return NextResponse.json(
          { error: `Invalid plugin manifest: ${(error as Error).message}` },
          { status: 400 }
        );
      }

      // Installation options
      const options = {
        source: body.source || 'local',
        sourceUrl: body.sourceUrl,
        autoEnable: body.autoEnable || false,
        config: body.config || {},
      };

      // Validate source
      if (!['marketplace', 'local', 'git', 'npm'].includes(options.source)) {
        return NextResponse.json(
          { error: 'Invalid plugin source' },
          { status: 400 }
        );
      }

      addSpanAttributes(span, {
        'plugin.name': validatedManifest.name,
        'plugin.version': validatedManifest.version,
        'plugin.source': options.source,
        'plugin.auto_enable': options.autoEnable,
      });

      const plugin = await pluginManager.installPlugin(validatedManifest, userId, options);

      return NextResponse.json({
        success: true,
        data: plugin,
        message: 'Plugin installed successfully',
      }, { status: 201 });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to install plugin:', error);

      if ((error as Error).message.includes('already installed')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 409 }
        );
      }

      if ((error as Error).message.includes('validation') || (error as Error).message.includes('Invalid')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to install plugin' },
        { status: 500 }
      );
    }
  });
}