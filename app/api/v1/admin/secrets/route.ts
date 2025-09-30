/**
 * Admin Secrets Management API
 *
 * Admin-only endpoints for managing platform secrets.
 * All operations are logged to audit_logs for security compliance.
 */

export const runtime = "nodejs";

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import {
  storeSecret,
  getSecret,
  listSecrets,
  updateSecret,
  deleteSecret,
  getSecretStats,
} from '@/services/secrets';
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
      resource: 'admin_secrets',
      reason: 'insufficient_privileges',
      ip: req.headers.get('x-forwarded-for') || 'unknown',
      userAgent: req.headers.get('user-agent') || 'unknown',
    });

    throw new Error('Admin access required');
  }

  return user.id;
}

/**
 * GET /api/v1/admin/secrets
 * List all secrets with masked values
 */
export async function GET(req: NextRequest) {
  return await withSpan('api.admin.secrets.list', async () => {
    try {
      addSpanAttributes({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_api',
        [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/v1/admin/secrets',
        'http.method': 'GET',
      });

      const userId = await validateAdminAccess(req);

      const url = new URL(req.url);
      const includeStats = url.searchParams.get('stats') === 'true';

      const [secrets, stats] = await Promise.all([
        listSecrets(true), // Always return masked values
        includeStats ? getSecretStats() : null,
      ]);

      await auditLogger.logAdmin('admin.secrets_listed', userId, undefined, {
        secretCount: secrets.length,
        includeStats,
      });

      return NextResponse.json({
        success: true,
        data: {
          secrets,
          stats,
        },
      });

    } catch (error) {
      console.error('Failed to list secrets:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to list secrets',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        { status: error instanceof Error && error.message.includes('Admin access') ? 403 : 500 }
      );
    }
  });
}

/**
 * POST /api/v1/admin/secrets
 * Create a new secret
 */
export async function POST(req: NextRequest) {
  return await withSpan('api.admin.secrets.create', async () => {
    try {
      addSpanAttributes({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_api',
        [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/v1/admin/secrets',
        'http.method': 'POST',
      });

      const userId = await validateAdminAccess(req);

      const body = await req.json();
      const { name, value, provider, description } = body;

      // Validate required fields
      if (!name || !value) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required fields',
            message: 'Name and value are required',
          },
          { status: 400 }
        );
      }

      // Validate secret name format
      if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
        return NextResponse.json(
          {
            success: false,
            error: 'Invalid secret name',
            message: 'Secret name can only contain letters, numbers, underscores, and hyphens',
          },
          { status: 400 }
        );
      }

      await storeSecret(name, provider, value, userId, description);

      return NextResponse.json({
        success: true,
        message: 'Secret created successfully',
        data: {
          name,
          provider,
          description,
        },
      });

    } catch (error) {
      console.error('Failed to create secret:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create secret',
          message: error instanceof Error ? error.message : 'Unknown error',
        },
        {
          status: error instanceof Error && error.message.includes('already exists') ? 409 :
                  error instanceof Error && error.message.includes('Admin access') ? 403 : 500
        }
      );
    }
  });
}

/**
 * PUT /api/v1/admin/secrets
 * Update an existing secret
 */
export async function PUT(req: NextRequest) {
  return await withSpan('api.admin.secrets.update', async () => {
    try {
      addSpanAttributes({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_api',
        [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/v1/admin/secrets',
        'http.method': 'PUT',
      });

      const userId = await validateAdminAccess(req);

      const body = await req.json();
      const { name, value, provider, description } = body;

      if (!name) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required field',
            message: 'Secret name is required',
          },
          { status: 400 }
        );
      }

      const updates: any = {};
      if (value !== undefined) updates.value = value;
      if (provider !== undefined) updates.provider = provider;
      if (description !== undefined) updates.description = description;

      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: 'No updates provided',
            message: 'At least one field must be updated',
          },
          { status: 400 }
        );
      }

      await updateSecret(name, updates, userId);

      return NextResponse.json({
        success: true,
        message: 'Secret updated successfully',
        data: {
          name,
          updatedFields: Object.keys(updates),
        },
      });

    } catch (error) {
      console.error('Failed to update secret:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update secret',
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

/**
 * DELETE /api/v1/admin/secrets
 * Delete a secret
 */
export async function DELETE(req: NextRequest) {
  return await withSpan('api.admin.secrets.delete', async () => {
    try {
      addSpanAttributes({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_api',
        [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/v1/admin/secrets',
        'http.method': 'DELETE',
      });

      const userId = await validateAdminAccess(req);

      const url = new URL(req.url);
      const name = url.searchParams.get('name');

      if (!name) {
        return NextResponse.json(
          {
            success: false,
            error: 'Missing required parameter',
            message: 'Secret name is required',
          },
          { status: 400 }
        );
      }

      await deleteSecret(name, userId);

      return NextResponse.json({
        success: true,
        message: 'Secret deleted successfully',
        data: {
          name,
        },
      });

    } catch (error) {
      console.error('Failed to delete secret:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to delete secret',
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