/**
 * Model Status Management API Routes
 *
 * Handles model status changes and promotions
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
 * PUT /api/v1/admin/models/[modelId]/status
 * Update model status with special handling for promotions
 */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.admin.model.status_update', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_model_status_update',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'model.id': params.modelId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'admin_model_status', 30, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      if (!body.status || typeof body.status !== 'string') {
        return NextResponse.json(
          { error: 'status is required and must be a string' },
          { status: 400 }
        );
      }

      const validStatuses = ['stable', 'canary', 'disabled'];
      if (!validStatuses.includes(body.status)) {
        return NextResponse.json(
          { error: 'status must be one of: stable, canary, disabled' },
          { status: 400 }
        );
      }

      addSpanAttributes(span, {
        'model.new_status': body.status,
      });

      // Handle special case: promoting canary to stable
      if (body.status === 'stable') {
        const currentModel = await modelRegistry.getModel(params.modelId);

        if (!currentModel) {
          return NextResponse.json(
            { error: 'Model not found' },
            { status: 404 }
          );
        }

        if (currentModel.status === 'canary') {
          // Use the promotion logic which handles demoting current stable models
          const result = await modelRegistry.promoteCanaryToStable(params.modelId);

          if (!result.success) {
            return NextResponse.json(
              { error: result.message },
              { status: 400 }
            );
          }

          return NextResponse.json({
            success: true,
            message: result.message,
            data: {
              modelId: params.modelId,
              newStatus: 'stable',
              promoted: true,
            },
          });
        }
      }

      // Standard status update
      const success = await modelRegistry.updateModelStatus(params.modelId, body.status);

      if (!success) {
        return NextResponse.json(
          { error: 'Failed to update model status' },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: `Model status updated to ${body.status}`,
        data: {
          modelId: params.modelId,
          newStatus: body.status,
          promoted: false,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to update model status:', error);

      if ((error as Error).message.includes('not found')) {
        return NextResponse.json(
          { error: 'Model not found' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to update model status' },
        { status: 500 }
      );
    }
  });
}

/**
 * POST /api/v1/admin/models/[modelId]/status
 * Promote canary model to stable (explicit promotion endpoint)
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  return withSpan('api.admin.model.promote', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_model_promote',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'model.id': params.modelId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'admin_model_promote', 10, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const result = await modelRegistry.promoteCanaryToStable(params.modelId);

      if (!result.success) {
        return NextResponse.json(
          { error: result.message },
          { status: 400 }
        );
      }

      addSpanAttributes(span, {
        'model.promotion_success': true,
      });

      return NextResponse.json({
        success: true,
        message: result.message,
        data: {
          modelId: params.modelId,
          promotedToStable: true,
        },
      });

    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to promote model:', error);

      return NextResponse.json(
        { error: 'Failed to promote model' },
        { status: 500 }
      );
    }
  });
}