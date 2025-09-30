/**
 * Audit Logs API Endpoint
 *
 * Admin-only endpoint for retrieving and managing audit logs.
 * Supports filtering, pagination, and statistical analysis.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { prisma } from '@/lib/db';

// Admin user check
async function checkAdminAccess(userId: string): Promise<boolean> {
  // Check if user is in admin list (from environment or database)
  const adminIds = process.env.ADMIN_USER_IDS?.split(',') || [];
  return adminIds.includes(userId);
}

// GET /api/v1/audit - Retrieve audit logs
export async function GET(req: NextRequest) {
  return await withSpan(
    'audit.api.get',
    async () => {
      try {
        // Authenticate user
        const { userId } = await auth();
        if (!userId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // Check admin access
        const isAdmin = await checkAdminAccess(userId);
        if (!isAdmin) {
          // Log access attempt
          await auditLogger.logSecurity('security.access_denied', userId, {
            resource: 'audit_logs',
            endpoint: '/api/v1/audit',
            reason: 'insufficient_privileges',
          });

          return NextResponse.json(
            { error: 'Forbidden - Admin access required' },
            { status: 403 }
          );
        }

        // Add span attributes
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'audit_query',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'audit.admin_access': true,
        });

        // Parse query parameters
        const url = new URL(req.url);
        const params = {
          userId: url.searchParams.get('userId') || undefined,
          action: url.searchParams.get('action') || undefined,
          resource: url.searchParams.get('resource') || undefined,
          severity: url.searchParams.get('severity') as any || undefined,
          startDate: url.searchParams.get('startDate') ? new Date(url.searchParams.get('startDate')!) : undefined,
          endDate: url.searchParams.get('endDate') ? new Date(url.searchParams.get('endDate')!) : undefined,
          limit: url.searchParams.get('limit') ? parseInt(url.searchParams.get('limit')!) : 50,
          offset: url.searchParams.get('offset') ? parseInt(url.searchParams.get('offset')!) : 0,
          traceId: url.searchParams.get('traceId') || undefined,
          includeStats: url.searchParams.get('includeStats') === 'true',
        };

        // Validate parameters
        if (params.limit > 1000) params.limit = 1000; // Max limit
        if (params.offset < 0) params.offset = 0;

        // Get audit logs
        const logsData = await auditLogger.getLogs(params);

        // Get statistics if requested
        let stats = null;
        if (params.includeStats) {
          stats = await auditLogger.getStats({
            startDate: params.startDate,
            endDate: params.endDate,
            userId: params.userId,
          });
        }

        // Log the audit query
        await auditLogger.logAdmin('admin.audit_accessed', userId, undefined, {
          queryParams: params,
          resultsCount: logsData.logs.length,
          totalResults: logsData.total,
        });

        // Add response attributes
        addSpanAttributes({
          'audit.query.results_count': logsData.logs.length,
          'audit.query.total_count': logsData.total,
          'audit.query.included_stats': !!stats,
        });

        return NextResponse.json({
          success: true,
          data: {
            logs: logsData.logs,
            pagination: {
              total: logsData.total,
              limit: logsData.limit,
              offset: logsData.offset,
              hasNext: logsData.offset + logsData.limit < logsData.total,
              hasPrev: logsData.offset > 0,
            },
            stats,
          },
        });

      } catch (error) {
        console.error('Audit API error:', error);

        return NextResponse.json(
          {
            success: false,
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}

// POST /api/v1/audit - Administrative actions
export async function POST(req: NextRequest) {
  return await withSpan(
    'audit.api.post',
    async () => {
      try {
        // Authenticate user
        const { userId } = await auth();
        if (!userId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // Check admin access
        const isAdmin = await checkAdminAccess(userId);
        if (!isAdmin) {
          await auditLogger.logSecurity('security.access_denied', userId, {
            resource: 'audit_logs',
            endpoint: '/api/v1/audit',
            method: 'POST',
            reason: 'insufficient_privileges',
          });

          return NextResponse.json(
            { error: 'Forbidden - Admin access required' },
            { status: 403 }
          );
        }

        const body = await req.json();
        const { action, ...params } = body;

        // Add span attributes
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'audit_admin_action',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'audit.admin_action': action,
        });

        let result: any = { success: true };

        switch (action) {
          case 'cleanup':
            {
              const daysToKeep = params.daysToKeep || 365;
              if (daysToKeep < 30) {
                return NextResponse.json(
                  { error: 'Cannot delete audit logs newer than 30 days' },
                  { status: 400 }
                );
              }

              const deletedCount = await auditLogger.cleanup(daysToKeep);

              await auditLogger.logAdmin('admin.data_cleanup', userId, undefined, {
                resourceType: 'audit_logs',
                daysToKeep,
                deletedCount,
              });

              result.data = {
                deletedCount,
                daysToKeep,
                message: `Deleted ${deletedCount} audit log entries older than ${daysToKeep} days`,
              };
            }
            break;

          case 'export':
            {
              const { format = 'json', ...exportParams } = params;

              // Get logs for export
              const exportData = await auditLogger.getLogs({
                ...exportParams,
                limit: 10000, // Large limit for export
              });

              await auditLogger.logAdmin('admin.audit_export', userId, undefined, {
                format,
                exportParams,
                recordCount: exportData.logs.length,
              });

              if (format === 'csv') {
                // Convert to CSV format
                const csvHeaders = [
                  'ID',
                  'User ID',
                  'User Email',
                  'Action',
                  'Resource',
                  'Resource ID',
                  'Severity',
                  'Outcome',
                  'IP Address',
                  'Trace ID',
                  'Created At',
                ].join(',');

                const csvRows = exportData.logs.map(log => [
                  log.id,
                  log.userId || '',
                  log.user?.email || '',
                  log.action,
                  log.resource || '',
                  log.resourceId || '',
                  log.severity,
                  log.outcome,
                  log.ipAddress || '',
                  log.traceId || '',
                  log.createdAt.toISOString(),
                ].map(field => `"${String(field).replace(/"/g, '""')}"`).join(','));

                const csv = [csvHeaders, ...csvRows].join('\n');

                return new Response(csv, {
                  headers: {
                    'Content-Type': 'text/csv',
                    'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`,
                  },
                });
              }

              result.data = {
                logs: exportData.logs,
                total: exportData.total,
                exportedAt: new Date().toISOString(),
                format,
              };
            }
            break;

          case 'stats':
            {
              const stats = await auditLogger.getStats(params);

              await auditLogger.logAdmin('admin.audit_stats', userId, undefined, {
                queryParams: params,
                totalLogs: stats.total,
              });

              result.data = stats;
            }
            break;

          default:
            return NextResponse.json(
              { error: `Unknown action: ${action}` },
              { status: 400 }
            );
        }

        return NextResponse.json(result);

      } catch (error) {
        console.error('Audit API POST error:', error);

        return NextResponse.json(
          {
            success: false,
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}

// DELETE /api/v1/audit - Delete specific audit logs (admin only, with restrictions)
export async function DELETE(req: NextRequest) {
  return await withSpan(
    'audit.api.delete',
    async () => {
      try {
        // Authenticate user
        const { userId } = await auth();
        if (!userId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // Check admin access
        const isAdmin = await checkAdminAccess(userId);
        if (!isAdmin) {
          await auditLogger.logSecurity('security.access_denied', userId, {
            resource: 'audit_logs',
            endpoint: '/api/v1/audit',
            method: 'DELETE',
            reason: 'insufficient_privileges',
          });

          return NextResponse.json(
            { error: 'Forbidden - Admin access required' },
            { status: 403 }
          );
        }

        const url = new URL(req.url);
        const logId = url.searchParams.get('id');

        if (!logId) {
          return NextResponse.json(
            { error: 'Log ID is required' },
            { status: 400 }
          );
        }

        // Get the log to be deleted for audit purposes
        const logToDelete = await auditLogger.getLogs({ limit: 1, offset: 0 });
        const targetLog = logToDelete.logs.find(log => log.id === logId);

        if (!targetLog) {
          return NextResponse.json(
            { error: 'Audit log not found' },
            { status: 404 }
          );
        }

        // Prevent deletion of critical security events
        if (targetLog.severity === 'critical') {
          return NextResponse.json(
            { error: 'Cannot delete critical security audit logs' },
            { status: 403 }
          );
        }

        // Prevent deletion of recent logs (security measure)
        const daysSinceCreation = (Date.now() - new Date(targetLog.createdAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 30) {
          return NextResponse.json(
            { error: 'Cannot delete audit logs newer than 30 days' },
            { status: 403 }
          );
        }

        // Delete the log
        await prisma.auditLog.delete({
          where: { id: logId },
        });

        // Log the deletion
        await auditLogger.logAdmin('admin.audit_log_deleted', userId, targetLog.userId, {
          deletedLogId: logId,
          deletedLogAction: targetLog.action,
          deletedLogResource: targetLog.resource,
          deletedLogCreatedAt: targetLog.createdAt,
          reason: 'manual_admin_deletion',
        });

        return NextResponse.json({
          success: true,
          message: 'Audit log deleted successfully',
          deletedLog: {
            id: targetLog.id,
            action: targetLog.action,
            createdAt: targetLog.createdAt,
          },
        });

      } catch (error) {
        console.error('Audit API DELETE error:', error);

        return NextResponse.json(
          {
            success: false,
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}