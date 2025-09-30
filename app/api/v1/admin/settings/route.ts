/**
 * Admin Platform Settings API
 *
 * Admin-only endpoints for managing feature flags, quotas, model weights,
 * and other platform configurations. All operations are logged to audit_logs.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { platformSettings, SETTING_KEYS, FEATURE_FLAGS } from '@/services/platform/settings';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

async function validateAdminAccess(req: NextRequest): Promise<string> {
  const { userId } = auth();

  if (!userId) {
    throw new Error('Authentication required');
  }

  // Get user to check role
  const user = await prisma.user.findUnique({
    where: { clerkId: userId },
    select: { id: true, role: true, email: true },
  });

  if (!user || user.role !== 'admin') {
    await auditLogger.logSecurity('security.access_denied', user?.id, {
      resource: 'admin_settings',
      reason: 'insufficient_privileges',
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    throw new Error('Admin access required');
  }

  return user.id;
}

/**
 * GET /api/v1/admin/settings
 * Get platform settings, feature flags, and configurations
 */
export async function GET(req: NextRequest) {
  return await withSpan('api.admin.settings.get', async () => {
    try {
      addSpanAttributes({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_api',
        [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/v1/admin/settings',
        'http.method': 'GET',
      });

      const userId = await validateAdminAccess(req);

      const url = new URL(req.url);
      const category = url.searchParams.get('category');
      const type = url.searchParams.get('type');

      let data: any = {};

      if (!type || type === 'settings') {
        // Get platform settings
        if (category) {
          data.settings = await platformSettings.getSettingsByCategory(category);
        } else {
          // Get settings by common categories
          const [general, models, billing, security, monitoring] = await Promise.all([
            platformSettings.getSettingsByCategory('general'),
            platformSettings.getSettingsByCategory('models'),
            platformSettings.getSettingsByCategory('billing'),
            platformSettings.getSettingsByCategory('security'),
            platformSettings.getSettingsByCategory('monitoring'),
          ]);

          data.settings = {
            general,
            models,
            billing,
            security,
            monitoring,
          };
        }
      }

      if (!type || type === 'flags') {
        // Get feature flags
        data.featureFlags = await platformSettings.getAllFeatureFlags();
      }

      if (!type || type === 'weights') {
        // Get model weights
        data.modelWeights = await platformSettings.getModelWeights();
      }

      if (!type || type === 'quotas') {
        // Get plan quotas
        data.planQuotas = await platformSettings.getPlanQuotas();
      }

      // Get public settings (safe to cache)
      if (!type || type === 'public') {
        data.publicSettings = await platformSettings.getPublicSettings();
      }

      await auditLogger.logAdmin('admin.settings_viewed', userId, undefined, {
        category,
        type,
        dataTypes: Object.keys(data),
      });

      return NextResponse.json({
        success: true,
        data,
      });

    } catch (error) {
      console.error('Failed to get settings:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to get settings',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: error instanceof Error && error.message.includes('Admin access') ? 403 : 500 }
      );
    }
  });
}

/**
 * POST /api/v1/admin/settings
 * Update platform settings, feature flags, and configurations
 */
export async function POST(req: NextRequest) {
  return await withSpan('api.admin.settings.update', async () => {
    try {
      addSpanAttributes({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_api',
        [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/v1/admin/settings',
        'http.method': 'POST',
      });

      const userId = await validateAdminAccess(req);

      const body = await req.json();
      const { type, data } = body;

      if (!type || !data) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required fields',
            message: 'Type and data are required',
          },
          { status: 400 }
        );
      }

      const results: any = {};

      switch (type) {
        case 'setting':
          {
            const { key, value, valueType, description, category, isPublic } = data;

            if (!key || value === undefined || !valueType) {
              return NextResponse.json(
                {
                  success: false,
                  error: 'Invalid setting data',
                  message: 'Key, value, and valueType are required',
                },
                { status: 400 }
              );
            }

            await platformSettings.setSetting(
              key,
              value,
              valueType,
              userId,
              {
                description,
                category: category || 'general',
                isPublic: isPublic || false,
              }
            );

            results.setting = { key, updated: true };
          }
          break;

        case 'feature_flag':
          {
            const { name, enabled, rolloutPercentage, description, conditions } = data;

            if (!name || enabled === undefined) {
              return NextResponse.json(
                {
                  success: false,
                  error: 'Invalid feature flag data',
                  message: 'Name and enabled status are required',
                },
                { status: 400 }
              );
            }

            await platformSettings.setFeatureFlag(
              name,
              enabled,
              rolloutPercentage || 100,
              userId,
              {
                description,
                conditions: conditions || {},
              }
            );

            results.featureFlag = { name, updated: true };
          }
          break;

        case 'model_weights':
          {
            if (!Array.isArray(data.weights)) {
              return NextResponse.json(
                {
                  success: false,
                  error: 'Invalid model weights data',
                  message: 'Weights must be an array',
                },
                { status: 400 }
              );
            }

            // Validate weights structure
            for (const weight of data.weights) {
              if (!weight.modelId || typeof weight.weight !== 'number') {
                return NextResponse.json(
                  {
                    success: false,
                    error: 'Invalid weight structure',
                    message: 'Each weight must have modelId and numeric weight',
                  },
                  { status: 400 }
                );
              }
            }

            await platformSettings.setModelWeights(data.weights, userId);
            results.modelWeights = { updated: true, count: data.weights.length };
          }
          break;

        case 'plan_quotas':
          {
            if (typeof data.quotas !== 'object') {
              return NextResponse.json(
                {
                  success: false,
                  error: 'Invalid quotas data',
                  message: 'Quotas must be an object',
                },
                { status: 400 }
              );
            }

            await platformSettings.setPlanQuotas(data.quotas, userId);
            results.planQuotas = { updated: true, plans: Object.keys(data.quotas) };
          }
          break;

        case 'bulk_settings':
          {
            if (!Array.isArray(data.settings)) {
              return NextResponse.json(
                {
                  success: false,
                  error: 'Invalid bulk settings data',
                  message: 'Settings must be an array',
                },
                { status: 400 }
              );
            }

            const updateResults = [];
            for (const setting of data.settings) {
              try {
                await platformSettings.setSetting(
                  setting.key,
                  setting.value,
                  setting.type,
                  userId,
                  {
                    description: setting.description,
                    category: setting.category || 'general',
                    isPublic: setting.isPublic || false,
                  }
                );
                updateResults.push({ key: setting.key, success: true });
              } catch (error) {
                updateResults.push({
                  key: setting.key,
                  success: false,
                  error: error instanceof Error ? error.message : 'Unknown error',
                });
              }
            }

            results.bulkSettings = {
              total: data.settings.length,
              successful: updateResults.filter(r => r.success).length,
              failed: updateResults.filter(r => !r.success).length,
              results: updateResults,
            };
          }
          break;

        default:
          return NextResponse.json(
            {
              success: false,
              error: 'Invalid type',
              message: 'Supported types: setting, feature_flag, model_weights, plan_quotas, bulk_settings',
            },
            { status: 400 }
          );
      }

      return NextResponse.json({
        success: true,
        message: 'Settings updated successfully',
        data: results,
      });

    } catch (error) {
      console.error('Failed to update settings:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update settings',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: error instanceof Error && error.message.includes('Admin access') ? 403 : 500 }
      );
    }
  });
}

/**
 * DELETE /api/v1/admin/settings
 * Delete settings, feature flags, etc.
 */
export async function DELETE(req: NextRequest) {
  return await withSpan('api.admin.settings.delete', async () => {
    try {
      addSpanAttributes({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_api',
        [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/v1/admin/settings',
        'http.method': 'DELETE',
      });

      const userId = await validateAdminAccess(req);

      const url = new URL(req.url);
      const type = url.searchParams.get('type');
      const key = url.searchParams.get('key');
      const name = url.searchParams.get('name');

      if (!type) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing type parameter',
            message: 'Type parameter is required',
          },
          { status: 400 }
        );
      }

      switch (type) {
        case 'setting':
          if (!key) {
            return NextResponse.json(
              { success: false, error: 'Setting key required' },
              { status: 400 }
            );
          }

          await prisma.platformSetting.delete({
            where: { key },
          });

          // Clear cache
          platformSettings.clearCache();

          await auditLogger.logAdmin('admin.setting_deleted', userId, key, {
            type: 'setting',
          });

          break;

        case 'feature_flag':
          if (!name) {
            return NextResponse.json(
              { success: false, error: 'Feature flag name required' },
              { status: 400 }
            );
          }

          await prisma.featureFlag.delete({
            where: { name },
          });

          // Clear cache
          platformSettings.clearCache();

          await auditLogger.logAdmin('admin.feature_flag_deleted', userId, name, {
            type: 'feature_flag',
          });

          break;

        default:
          return NextResponse.json(
            {
              success: false,
              error: 'Invalid type',
              message: 'Supported types: setting, feature_flag',
            },
            { status: 400 }
          );
      }

      return NextResponse.json({
        success: true,
        message: 'Item deleted successfully',
      });

    } catch (error) {
      console.error('Failed to delete setting:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to delete item',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        {
          status: error instanceof Error && error.message.includes('not found') ? 404 :
                  error instanceof Error && error.message.includes('Admin access') ? 403 : 500
        }
      );
    }
  });
}