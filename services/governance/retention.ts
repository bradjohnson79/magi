/**
 * Data Retention Service
 *
 * Manages automated data retention policies including cleanup of old
 * telemetry events, snapshots based on user plans, and compliance with
 * data retention requirements.
 */

import { prisma } from '@/lib/db';
import { auditLogger } from '@/services/audit/logger';
import { metricsCollector } from '@/services/metrics/collector';

// Retention policies by plan
export const RETENTION_POLICIES = {
  trial: {
    snapshots: 7, // days
    telemetryEvents: 30, // days
    logs: 7, // days
    modelRuns: 90, // days
    auditLogs: 90, // days
  },
  solo: {
    snapshots: 30, // days
    telemetryEvents: 90, // days
    logs: 30, // days
    modelRuns: 365, // days
    auditLogs: 365, // days
  },
  teams: {
    snapshots: 90, // days
    telemetryEvents: 90, // days
    logs: 90, // days
    modelRuns: 730, // days (2 years)
    auditLogs: 365, // days
  },
  admin: {
    snapshots: 365, // days
    telemetryEvents: 365, // days
    logs: 365, // days
    modelRuns: 1095, // days (3 years)
    auditLogs: 1825, // days (5 years)
  },
} as const;

// Global retention policy for compliance
export const COMPLIANCE_RETENTION = {
  // Telemetry events archived after 90 days, deleted after 1 year
  telemetryArchiveDays: 90,
  telemetryDeleteDays: 365,

  // Critical audit logs retained longer
  criticalAuditLogDays: 2555, // 7 years for security/financial events

  // Model training data retention
  modelTrainingDataDays: 730, // 2 years for model improvement

  // User data deletion grace period
  deletionGracePeriodDays: 30,
} as const;

export interface RetentionStats {
  deletedCounts: Record<string, number>;
  archivedCounts: Record<string, number>;
  totalSpace: number;
  errors: string[];
}

export class DataRetentionService {
  /**
   * Run comprehensive data retention cleanup
   */
  async runRetentionCleanup(): Promise<RetentionStats> {
    const stats: RetentionStats = {
      deletedCounts: {},
      archivedCounts: {},
      totalSpace: 0,
      errors: [],
    };

    try {
      await auditLogger.logSystem('system.retention_cleanup_started');

      // Clean up telemetry events
      const telemetryStats = await this.cleanupTelemetryEvents();
      Object.assign(stats.deletedCounts, telemetryStats.deleted);
      Object.assign(stats.archivedCounts, telemetryStats.archived);
      stats.errors.push(...telemetryStats.errors);

      // Clean up snapshots by plan
      const snapshotStats = await this.cleanupSnapshotsByPlan();
      stats.deletedCounts.snapshots = snapshotStats.deleted;
      stats.errors.push(...snapshotStats.errors);

      // Clean up old logs
      const logStats = await this.cleanupLogsByPlan();
      stats.deletedCounts.logs = logStats.deleted;
      stats.errors.push(...logStats.errors);

      // Clean up old model runs
      const modelRunStats = await this.cleanupModelRunsByPlan();
      stats.deletedCounts.modelRuns = modelRunStats.deleted;
      stats.archivedCounts.modelRuns = modelRunStats.archived;
      stats.errors.push(...modelRunStats.errors);

      // Clean up audit logs (with special handling for critical events)
      const auditStats = await this.cleanupAuditLogs();
      stats.deletedCounts.auditLogs = auditStats.deleted;
      stats.errors.push(...auditStats.errors);

      // Record metrics
      await metricsCollector.recordCustomMetric(
        'retention.cleanup.completed',
        1,
        'count',
        {
          totalDeleted: Object.values(stats.deletedCounts).reduce((a, b) => a + b, 0),
          totalArchived: Object.values(stats.archivedCounts).reduce((a, b) => a + b, 0),
          errorCount: stats.errors.length,
        }
      );

      await auditLogger.logSystem('system.retention_cleanup_completed', {
        stats,
      });

      console.log('Data retention cleanup completed:', stats);
      return stats;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      stats.errors.push(`Retention cleanup failed: ${errorMessage}`);

      await auditLogger.logSystem('system.retention_cleanup_failed', {
        error: errorMessage,
        partialStats: stats,
      });

      throw error;
    }
  }

  /**
   * Clean up telemetry events based on retention policy
   */
  private async cleanupTelemetryEvents(): Promise<{
    deleted: Record<string, number>;
    archived: Record<string, number>;
    errors: string[];
  }> {
    const deleted: Record<string, number> = {};
    const archived: Record<string, number> = {};
    const errors: string[] = [];

    try {
      // Archive telemetry events older than 90 days
      const archiveDate = new Date();
      archiveDate.setDate(archiveDate.getDate() - COMPLIANCE_RETENTION.telemetryArchiveDays);

      // Delete telemetry events older than 1 year
      const deleteDate = new Date();
      deleteDate.setDate(deleteDate.getDate() - COMPLIANCE_RETENTION.telemetryDeleteDays);

      // First, archive recent events (move to cold storage)
      // For now, we'll just mark them as archived
      const archivedResult = await prisma.telemetryEvent.updateMany({
        where: {
          createdAt: {
            lt: archiveDate,
            gte: deleteDate,
          },
          // Don't archive events that are already archived or contain critical data
          NOT: {
            eventType: {
              in: ['alert.triggered', 'security.*', 'data.deletion*'],
            },
          },
        },
        data: {
          payload: {
            // Mark as archived
            archived: true,
            archivedAt: new Date().toISOString(),
          },
        },
      });

      archived.telemetryEvents = archivedResult.count;

      // Delete very old events
      const deletedResult = await prisma.telemetryEvent.deleteMany({
        where: {
          createdAt: { lt: deleteDate },
          // Don't delete critical events
          NOT: {
            eventType: {
              in: ['alert.triggered', 'security.*', 'data.deletion*', 'system.*'],
            },
          },
        },
      });

      deleted.telemetryEvents = deletedResult.count;

    } catch (error) {
      errors.push(`Telemetry cleanup error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return { deleted, archived, errors };
  }

  /**
   * Clean up snapshots based on user plan retention policies
   */
  private async cleanupSnapshotsByPlan(): Promise<{
    deleted: number;
    errors: string[];
  }> {
    let totalDeleted = 0;
    const errors: string[] = [];

    try {
      // Get all users with their plans
      const users = await prisma.user.findMany({
        select: { id: true, plan: true },
      });

      for (const user of users) {
        const policy = RETENTION_POLICIES[user.plan as keyof typeof RETENTION_POLICIES] ||
          RETENTION_POLICIES.trial;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.snapshots);

        try {
          const result = await prisma.snapshot.deleteMany({
            where: {
              createdBy: user.id,
              createdAt: { lt: cutoffDate },
            },
          });

          totalDeleted += result.count;

          if (result.count > 0) {
            await auditLogger.logData('data.snapshots_cleaned', user.id, {
              deletedCount: result.count,
              cutoffDate: cutoffDate.toISOString(),
              plan: user.plan,
              retentionDays: policy.snapshots,
            });
          }

        } catch (error) {
          errors.push(`Snapshot cleanup error for user ${user.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

    } catch (error) {
      errors.push(`Snapshot cleanup error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return { deleted: totalDeleted, errors };
  }

  /**
   * Clean up logs based on user plan retention policies
   */
  private async cleanupLogsByPlan(): Promise<{
    deleted: number;
    errors: string[];
  }> {
    let totalDeleted = 0;
    const errors: string[] = [];

    try {
      // Get all users with their plans
      const users = await prisma.user.findMany({
        select: { id: true, plan: true },
      });

      for (const user of users) {
        const policy = RETENTION_POLICIES[user.plan as keyof typeof RETENTION_POLICIES] ||
          RETENTION_POLICIES.trial;

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - policy.logs);

        try {
          const result = await prisma.log.deleteMany({
            where: {
              userId: user.id,
              createdAt: { lt: cutoffDate },
              // Don't delete error logs or important system logs
              level: { notIn: ['error', 'critical'] },
            },
          });

          totalDeleted += result.count;

        } catch (error) {
          errors.push(`Log cleanup error for user ${user.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

    } catch (error) {
      errors.push(`Log cleanup error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return { deleted: totalDeleted, errors };
  }

  /**
   * Clean up model runs based on user plan retention policies
   */
  private async cleanupModelRunsByPlan(): Promise<{
    deleted: number;
    archived: number;
    errors: string[];
  }> {
    let totalDeleted = 0;
    let totalArchived = 0;
    const errors: string[] = [];

    try {
      // Get all users with their plans
      const users = await prisma.user.findMany({
        select: { id: true, plan: true },
      });

      for (const user of users) {
        const policy = RETENTION_POLICIES[user.plan as keyof typeof RETENTION_POLICIES] ||
          RETENTION_POLICIES.trial;

        const deleteCutoffDate = new Date();
        deleteCutoffDate.setDate(deleteCutoffDate.getDate() - policy.modelRuns);

        const archiveCutoffDate = new Date();
        archiveCutoffDate.setDate(archiveCutoffDate.getDate() - COMPLIANCE_RETENTION.modelTrainingDataDays);

        try {
          // Archive old model runs (anonymize but keep for training)
          const archivedResult = await prisma.modelRun.updateMany({
            where: {
              userId: user.id,
              createdAt: {
                lt: archiveCutoffDate,
                gte: deleteCutoffDate,
              },
            },
            data: {
              // Anonymize the data but keep the run for model training
              userId: null,
              inputPayload: {},
              outputPayload: {},
              provenance: {
                anonymized: true,
                anonymizedAt: new Date().toISOString(),
                originalUser: user.id,
              },
            },
          });

          totalArchived += archivedResult.count;

          // Delete very old model runs
          const deletedResult = await prisma.modelRun.deleteMany({
            where: {
              OR: [
                { userId: user.id, createdAt: { lt: deleteCutoffDate } },
                { userId: null, createdAt: { lt: deleteCutoffDate } }, // Already anonymized
              ],
            },
          });

          totalDeleted += deletedResult.count;

        } catch (error) {
          errors.push(`Model run cleanup error for user ${user.id}: ${error instanceof Error ? error.message : 'Unknown'}`);
        }
      }

    } catch (error) {
      errors.push(`Model run cleanup error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return { deleted: totalDeleted, archived: totalArchived, errors };
  }

  /**
   * Clean up audit logs with special handling for critical events
   */
  private async cleanupAuditLogs(): Promise<{
    deleted: number;
    errors: string[];
  }> {
    let totalDeleted = 0;
    const errors: string[] = [];

    try {
      // Standard audit log cleanup (1 year)
      const standardCutoffDate = new Date();
      standardCutoffDate.setDate(standardCutoffDate.getDate() - 365);

      const standardResult = await prisma.auditLog.deleteMany({
        where: {
          createdAt: { lt: standardCutoffDate },
          severity: { notIn: ['critical'] },
          action: {
            notIn: [
              'security.breach_attempt',
              'data.deletion_requested',
              'data.deleted',
              'admin.user_impersonation',
            ],
          },
        },
      });

      totalDeleted += standardResult.count;

      // Critical events cleanup (7 years for compliance)
      const criticalCutoffDate = new Date();
      criticalCutoffDate.setDate(criticalCutoffDate.getDate() - COMPLIANCE_RETENTION.criticalAuditLogDays);

      const criticalResult = await prisma.auditLog.deleteMany({
        where: {
          createdAt: { lt: criticalCutoffDate },
          // Even critical events are eventually deleted
        },
      });

      totalDeleted += criticalResult.count;

    } catch (error) {
      errors.push(`Audit log cleanup error: ${error instanceof Error ? error.message : 'Unknown'}`);
    }

    return { deleted: totalDeleted, errors };
  }

  /**
   * Get retention policy for a specific user
   */
  async getUserRetentionPolicy(userId: string): Promise<typeof RETENTION_POLICIES.trial> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true, role: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    // Admin users get extended retention
    if (user.role === 'admin') {
      return RETENTION_POLICIES.admin;
    }

    return RETENTION_POLICIES[user.plan as keyof typeof RETENTION_POLICIES] ||
      RETENTION_POLICIES.trial;
  }

  /**
   * Get data size estimates for cleanup
   */
  async getCleanupEstimates(): Promise<{
    telemetryEvents: { count: number; estimated_size_mb: number };
    snapshots: { count: number; estimated_size_mb: number };
    logs: { count: number; estimated_size_mb: number };
    modelRuns: { count: number; estimated_size_mb: number };
    auditLogs: { count: number; estimated_size_mb: number };
  }> {
    const archiveDate = new Date();
    archiveDate.setDate(archiveDate.getDate() - COMPLIANCE_RETENTION.telemetryArchiveDays);

    const deleteDate = new Date();
    deleteDate.setDate(deleteDate.getDate() - COMPLIANCE_RETENTION.telemetryDeleteDays);

    const [
      telemetryCount,
      snapshotCount,
      logCount,
      modelRunCount,
      auditLogCount,
    ] = await Promise.all([
      prisma.telemetryEvent.count({
        where: { createdAt: { lt: deleteDate } },
      }),
      prisma.snapshot.count({
        where: { createdAt: { lt: archiveDate } },
      }),
      prisma.log.count({
        where: { createdAt: { lt: archiveDate } },
      }),
      prisma.modelRun.count({
        where: { createdAt: { lt: archiveDate } },
      }),
      prisma.auditLog.count({
        where: { createdAt: { lt: deleteDate } },
      }),
    ]);

    return {
      telemetryEvents: {
        count: telemetryCount,
        estimated_size_mb: Math.round(telemetryCount * 0.001), // ~1KB per event
      },
      snapshots: {
        count: snapshotCount,
        estimated_size_mb: Math.round(snapshotCount * 10), // ~10MB per snapshot
      },
      logs: {
        count: logCount,
        estimated_size_mb: Math.round(logCount * 0.0005), // ~0.5KB per log
      },
      modelRuns: {
        count: modelRunCount,
        estimated_size_mb: Math.round(modelRunCount * 0.1), // ~100KB per run
      },
      auditLogs: {
        count: auditLogCount,
        estimated_size_mb: Math.round(auditLogCount * 0.002), // ~2KB per audit log
      },
    };
  }
}

// Export singleton instance
export const dataRetentionService = new DataRetentionService();

// Export types and constants
export type {
  RetentionStats,
};