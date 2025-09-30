/**
 * Scheduled Data Retention Cleanup
 *
 * Vercel Cron job endpoint for automated data retention cleanup.
 * Runs daily to enforce retention policies and maintain compliance.
 */

import { NextRequest, NextResponse } from 'next/server';
import { dataRetentionService } from '@/services/governance/retention';
import { auditLogger } from '@/services/audit/logger';
import { alertManager } from '@/services/alerts/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

// This endpoint is called by Vercel Cron
export async function GET(req: NextRequest) {
  return await withSpan(
    'cron.retention_cleanup',
    async () => {
      try {
        // Verify this is called from Vercel Cron or authorized source
        const authHeader = req.headers.get('authorization');
        const cronSecret = process.env.CRON_SECRET;

        if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
          await auditLogger.logSecurity('security.access_denied', undefined, {
            resource: 'cron_retention_cleanup',
            reason: 'invalid_auth_header',
            ip: req.headers.get('x-forwarded-for') || 'unknown',
          });

          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // Add span attributes
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'scheduled_cleanup',
          'cron.job': 'retention_cleanup',
        });

        // Get cleanup estimates first
        const estimates = await dataRetentionService.getCleanupEstimates();

        await auditLogger.logSystem('system.retention_cleanup_starting', {
          estimates,
          scheduledBy: 'cron',
        });

        // Run the cleanup
        const stats = await dataRetentionService.runRetentionCleanup();

        // Check for any issues
        if (stats.errors.length > 0) {
          // Alert on cleanup errors
          await alertManager.triggerAlert(
            'job_failure',
            'Data Retention Cleanup Errors',
            `Data retention cleanup completed with ${stats.errors.length} errors`,
            {
              errors: stats.errors,
              stats,
              jobType: 'retention_cleanup',
            }
          );
        }

        // Calculate total savings
        const totalDeleted = Object.values(stats.deletedCounts).reduce((a, b) => a + b, 0);
        const totalArchived = Object.values(stats.archivedCounts).reduce((a, b) => a + b, 0);

        // Alert on significant cleanup activity
        if (totalDeleted > 10000) {
          await alertManager.triggerAlert(
            'custom',
            'Large Data Cleanup Completed',
            `Retention cleanup deleted ${totalDeleted} records and archived ${totalArchived} records`,
            {
              stats,
              jobType: 'retention_cleanup',
              significance: 'large_cleanup',
            }
          );
        }

        return NextResponse.json({
          success: true,
          message: 'Data retention cleanup completed successfully',
          stats: {
            deleted: stats.deletedCounts,
            archived: stats.archivedCounts,
            totalDeleted,
            totalArchived,
            errorCount: stats.errors.length,
            executionTime: new Date().toISOString(),
          },
          estimates,
        });

      } catch (error) {
        console.error('Retention cleanup cron job failed:', error);

        // Alert on job failure
        await alertManager.triggerAlert(
          'job_failure',
          'Data Retention Cleanup Failed',
          `Scheduled data retention cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          {
            error: error instanceof Error ? error.message : 'Unknown error',
            jobType: 'retention_cleanup',
            severity: 'error',
          }
        );

        await auditLogger.logSystem('system.retention_cleanup_failed', {
          error: error instanceof Error ? error.message : 'Unknown error',
          scheduledBy: 'cron',
        });

        return NextResponse.json(
          {
            success: false,
            error: 'Retention cleanup failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}

// POST endpoint for manual triggers (admin only)
export async function POST(req: NextRequest) {
  return await withSpan(
    'cron.retention_cleanup.manual',
    async () => {
      try {
        // For manual triggers, we need authentication
        // In a real implementation, you'd verify admin authentication here
        const authHeader = req.headers.get('authorization');
        if (!authHeader) {
          return NextResponse.json(
            { error: 'Authentication required for manual cleanup' },
            { status: 401 }
          );
        }

        const body = await req.json();
        const { dryRun = false, force = false } = body;

        // Add span attributes
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'manual_cleanup',
          'cleanup.dry_run': dryRun,
          'cleanup.force': force,
        });

        if (dryRun) {
          // Just get estimates, don't actually delete anything
          const estimates = await dataRetentionService.getCleanupEstimates();

          await auditLogger.logSystem('system.retention_cleanup_dry_run', {
            estimates,
            triggeredBy: 'manual',
          });

          return NextResponse.json({
            success: true,
            dryRun: true,
            message: 'Dry run completed - no data was deleted',
            estimates,
          });
        }

        // Run actual cleanup
        const stats = await dataRetentionService.runRetentionCleanup();

        await auditLogger.logSystem('system.retention_cleanup_manual', {
          stats,
          triggeredBy: 'manual',
          force,
        });

        return NextResponse.json({
          success: true,
          message: 'Manual retention cleanup completed successfully',
          stats,
        });

      } catch (error) {
        console.error('Manual retention cleanup failed:', error);

        return NextResponse.json(
          {
            success: false,
            error: 'Manual cleanup failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}