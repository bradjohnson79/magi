/**
 * Admin Model Management API Routes
 *
 * Provides admin functionality for managing AI models in the registry
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { modelRegistry } from '@/services/models/registry';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * GET /api/v1/admin/models
 * List all models with admin details
 */
export async function GET(request: NextRequest) {
  return withSpan('api.admin.models.list', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      // TODO: Add admin role check
      // const user = await getUserByClerkId(userId);
      // if (!user || user.role !== 'admin') {
      //   return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
      // }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_models_list',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'admin_models', 100, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const url = new URL(request.url);
      const provider = url.searchParams.get('provider') || undefined;
      const role = url.searchParams.get('role') || undefined;
      const status = url.searchParams.get('status') || undefined;
      const includeInactive = url.searchParams.get('includeInactive') === 'true';

      const models = await modelRegistry.getModels({
        provider,
        role,
        status,
        isActive: includeInactive ? undefined : true,
      });

      // Get model statistics
      const stats = await modelRegistry.getModelStats();

      // Group models by role for easier admin management
      const modelsByRole = await modelRegistry.getModelsByRole();

      addSpanAttributes(span, {
        'models.total_count': models.length,
        'models.provider_filter': provider || 'all',
        'models.role_filter': role || 'all',
      });

      return NextResponse.json({
        success: true,
        data: {
          models,
          stats,
          modelsByRole,
        },
        pagination: {
          total: models.length,
          page: 1,
          limit: models.length,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to list admin models:', error);

      return NextResponse.json(
        { error: 'Failed to list models' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/admin/models
 * Create new model in registry
 */
export async function POST(request: NextRequest) {
  return withSpan('api.admin.models.create', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_models_create',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'admin_models_create', 10, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate required fields
      const requiredFields = ['name', 'provider', 'role', 'versionTag'];
      for (const field of requiredFields) {
        if (!body[field] || typeof body[field] !== 'string') {
          return NextResponse.json(
            { error: `${field} is required and must be a string` },
            { status: 400 }
          );
        }
      }

      if (!Array.isArray(body.capabilities)) {
        return NextResponse.json(
          { error: 'capabilities must be an array' },
          { status: 400 }
        );
      }

      if (!body.config || typeof body.config !== 'object') {
        return NextResponse.json(
          { error: 'config is required and must be an object' },
          { status: 400 }
        );
      }

      // Validate status
      const validStatuses = ['stable', 'canary', 'disabled'];
      if (body.status && !validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: 'status must be one of: stable, canary, disabled' },
          { status: 400 }
        );
      }

      const modelData = {
        name: body.name,
        provider: body.provider,
        role: body.role,
        version: body.version,
        versionTag: body.versionTag,
        config: body.config,
        capabilities: body.capabilities,
        status: body.status || 'canary',
      };

      addSpanAttributes(span, {
        'model.name': modelData.name,
        'model.provider': modelData.provider,
        'model.role': modelData.role,
        'model.version_tag': modelData.versionTag,
      });

      const model = await modelRegistry.addModel(modelData);

      if (!model) {
        return NextResponse.json(
          { error: 'Failed to create model' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: model,
        message: 'Model created successfully',
      }, { status: 201 });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to create model:', error);

      if ((error as Error).message.includes('validation')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to create model' },
        { status: 500 }
      );
    }
  });
}