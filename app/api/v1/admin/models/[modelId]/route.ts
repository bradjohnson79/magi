/**
 * Individual Model Admin API Routes
 *
 * Handles admin operations on specific models
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { modelRegistry } from '@/services/models/registry';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

interface RouteParams {
  params: {
    modelId: string;
  };
}

/**
 * GET /api/v1/admin/models/[modelId]
 * Get specific model details for admin
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.admin.model.get', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_model_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'model.id': params.modelId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'admin_model_get', 200, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const model = await modelRegistry.getModel(params.modelId);

      if (!model) {
        return NextResponse.json(
          { error: 'Model not found' },
          { status: 404 }
        );
      }

      return NextResponse.json({
        success: true,
        data: model,
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get model:', error);

      return NextResponse.json(
        { error: 'Failed to get model' },
        { status: 500 }
      );
    }
  });
}

/**
 * PUT /api/v1/admin/models/[modelId]
 * Update model configuration and status
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.admin.model.update', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_model_update',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'model.id': params.modelId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'admin_model_update', 50, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate what can be updated
      const allowedUpdates = ['config', 'status', 'capabilities', 'versionTag'];
      const updates: any = {};

      for (const [key, value] of Object.entries(body)) {
        if (!allowedUpdates.includes(key)) {
          return NextResponse.json(
            { error: `Field '${key}' cannot be updated` },
            { status: 400 }
          );
        }

        if (key === 'status') {
          const validStatuses = ['stable', 'canary', 'disabled'];
          if (!validStatuses.includes(value as string)) {
            return NextResponse.json(
              { error: 'status must be one of: stable, canary, disabled' },
              { status: 400 }
            );
          }
        }

        if (key === 'capabilities' && !Array.isArray(value)) {
          return NextResponse.json(
            { error: 'capabilities must be an array' },
            { status: 400 }
          );
        }

        if (key === 'config' && typeof value !== 'object') {
          return NextResponse.json(
            { error: 'config must be an object' },
            { status: 400 }
          );
        }

        updates[key] = value;
      }

      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          { error: 'No valid updates provided' },
          { status: 400 }
        );
      }

      addSpanAttributes(span, {
        'model.update_fields': Object.keys(updates).join(','),
      });

      const updatedModel = await modelRegistry.updateModel(params.modelId, updates);

      return NextResponse.json({
        success: true,
        data: updatedModel,
        message: 'Model updated successfully',
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update model:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Model not found' },
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
        { error: 'Failed to update model' },
        { status: 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/admin/models/[modelId]
 * Deactivate model (soft delete)
 */
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.admin.model.deactivate', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_model_deactivate',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'model.id': params.modelId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'admin_model_delete', 20, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const success = await modelRegistry.setModelActive(params.modelId, false);

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to deactivate model' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: 'Model deactivated successfully',
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to deactivate model:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Model not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to deactivate model' },
        { status: 500 }
      );
    }
  });
}