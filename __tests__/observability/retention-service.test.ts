/**
 * Data Retention Service Tests
 *
 * Tests for the comprehensive data retention and cleanup system
 * including plan-based policies and compliance requirements.
 */

import { DataRetentionService } from '@/services/governance/retention';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    telemetryEvent: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      updateMany: jest.fn(),
    },
    modelSnapshot: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock('@/services/audit/logger', () => ({
  auditLogger: {
    logSystem: jest.fn(),
  },
}));

const { prisma } = require('@/lib/db');
const { auditLogger } = require('@/services/audit/logger');

describe('DataRetentionService', () => {
  let retentionService: DataRetentionService;

  beforeEach(() => {
    jest.clearAllMocks();
    retentionService = new DataRetentionService();

    // Mock transaction to execute the callback immediately
    prisma.$transaction.mockImplementation(async (callback) => {
      return await callback(prisma);
    });
  });

  describe('Cleanup Estimates', () => {
    it('should calculate cleanup estimates for all data types', async () => {
      // Mock data counts
      prisma.telemetryEvent.findMany.mockResolvedValue([
        { id: '1' }, { id: '2' }, { id: '3' }
      ]);
      prisma.modelSnapshot.findMany.mockResolvedValue([
        { id: '1' }, { id: '2' }
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        { id: '1' }
      ]);

      const estimates = await retentionService.getCleanupEstimates();

      expect(estimates).toEqual({
        telemetryEvents: {
          toDelete: 3,
          toArchive: 0,
        },
        modelSnapshots: {
          toDelete: 2,
          toArchive: 0,
        },
        auditLogs: {
          toDelete: 1,
          toArchive: 0,
        },
      });
    });

    it('should respect retention policies for different plans', async () => {
      // Mock users with different plans
      prisma.user.findMany.mockResolvedValue([
        { id: 'user1', plan: 'enterprise' },
        { id: 'user2', plan: 'pro' },
        { id: 'user3', plan: 'trial' },
      ]);

      prisma.telemetryEvent.findMany.mockImplementation(({ where }) => {
        // Return different counts based on retention period
        if (where.createdAt?.lt) {
          const cutoffDate = where.createdAt.lt;
          const now = new Date();
          const daysDiff = Math.floor((now.getTime() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000));

          if (daysDiff >= 90) return Promise.resolve([{ id: '1' }]); // Trial data
          if (daysDiff >= 365) return Promise.resolve([{ id: '2' }]); // Pro data
          if (daysDiff >= 1095) return Promise.resolve([{ id: '3' }]); // Enterprise data
        }
        return Promise.resolve([]);
      });

      const estimates = await retentionService.getCleanupEstimates();

      expect(prisma.telemetryEvent.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: expect.objectContaining({
              lt: expect.any(Date),
            }),
          }),
        })
      );
    });
  });

  describe('Retention Cleanup Execution', () => {
    it('should perform cleanup and return statistics', async () => {
      // Mock successful deletions
      prisma.telemetryEvent.deleteMany.mockResolvedValue({ count: 100 });
      prisma.modelSnapshot.deleteMany.mockResolvedValue({ count: 25 });
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 10 });

      const stats = await retentionService.runRetentionCleanup();

      expect(stats).toEqual({
        deletedCounts: {
          telemetryEvents: 100,
          modelSnapshots: 25,
          auditLogs: 10,
        },
        archivedCounts: {
          telemetryEvents: 0,
          modelSnapshots: 0,
          auditLogs: 0,
        },
        errors: [],
        executionTime: expect.any(Number),
      });

      // Verify audit logging
      expect(auditLogger.logSystem).toHaveBeenCalledWith(
        'system.retention_cleanup_completed',
        expect.objectContaining({
          stats,
        })
      );
    });

    it('should handle cleanup errors gracefully', async () => {
      // Mock one successful and one failed operation
      prisma.telemetryEvent.deleteMany.mockResolvedValue({ count: 50 });
      prisma.modelSnapshot.deleteMany.mockRejectedValue(new Error('Storage full'));
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 5 });

      const stats = await retentionService.runRetentionCleanup();

      expect(stats.deletedCounts.telemetryEvents).toBe(50);
      expect(stats.deletedCounts.auditLogs).toBe(5);
      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0]).toContain('modelSnapshots: Storage full');
    });

    it('should preserve critical audit logs', async () => {
      await retentionService.runRetentionCleanup();

      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date),
          },
          severity: {
            not: 'critical',
          },
        },
      });
    });
  });

  describe('Plan-Based Retention', () => {
    it('should apply trial plan retention (90 days)', async () => {
      const trialDate = new Date();
      trialDate.setDate(trialDate.getDate() - 90);

      await retentionService.cleanupByPlan('trial');

      expect(prisma.telemetryEvent.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date),
          },
          userId: {
            in: expect.any(Array),
          },
        },
      });
    });

    it('should apply pro plan retention (1 year)', async () => {
      await retentionService.cleanupByPlan('pro');

      const calls = prisma.telemetryEvent.deleteMany.mock.calls;
      const whereClause = calls[0][0].where;
      const cutoffDate = whereClause.createdAt.lt;

      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000));

      expect(daysDiff).toBeCloseTo(365, 1);
    });

    it('should apply enterprise plan retention (3 years)', async () => {
      await retentionService.cleanupByPlan('enterprise');

      const calls = prisma.telemetryEvent.deleteMany.mock.calls;
      const whereClause = calls[0][0].where;
      const cutoffDate = whereClause.createdAt.lt;

      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - cutoffDate.getTime()) / (24 * 60 * 60 * 1000));

      expect(daysDiff).toBeCloseTo(1095, 1); // 3 years
    });
  });

  describe('Archive Operations', () => {
    it('should archive data instead of deleting when configured', async () => {
      // Mock archiving operation
      prisma.telemetryEvent.updateMany.mockResolvedValue({ count: 75 });

      const stats = await retentionService.archiveOldData('telemetryEvents', 180);

      expect(stats.archivedCount).toBe(75);
      expect(prisma.telemetryEvent.updateMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date),
          },
          archived: {
            not: true,
          },
        },
        data: {
          archived: true,
          archivedAt: expect.any(Date),
        },
      });
    });

    it('should handle archive failures', async () => {
      prisma.telemetryEvent.updateMany.mockRejectedValue(new Error('Archive storage unavailable'));

      const stats = await retentionService.archiveOldData('telemetryEvents', 180);

      expect(stats.error).toBe('Archive storage unavailable');
      expect(stats.archivedCount).toBe(0);
    });
  });

  describe('GDPR Compliance', () => {
    it('should support immediate data deletion for GDPR requests', async () => {
      const userId = 'gdpr-user-123';

      await retentionService.deleteUserDataImmediately(userId);

      expect(prisma.telemetryEvent.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });
      expect(prisma.modelSnapshot.deleteMany).toHaveBeenCalledWith({
        where: { userId },
      });

      // Audit logs should be anonymized, not deleted
      expect(prisma.auditLog.updateMany).toHaveBeenCalledWith({
        where: { userId },
        data: {
          userId: null,
          details: expect.any(Object), // Anonymized details
        },
      });
    });

    it('should handle user data export for compliance', async () => {
      const userId = 'export-user-456';

      // Mock user data
      prisma.telemetryEvent.findMany.mockResolvedValue([
        { id: '1', type: 'api_call', createdAt: new Date() },
      ]);
      prisma.modelSnapshot.findMany.mockResolvedValue([
        { id: '2', name: 'model_v1', createdAt: new Date() },
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        { id: '3', action: 'user.login', createdAt: new Date() },
      ]);

      const exportData = await retentionService.exportUserData(userId);

      expect(exportData).toHaveProperty('telemetryEvents');
      expect(exportData).toHaveProperty('modelSnapshots');
      expect(exportData).toHaveProperty('auditLogs');
      expect(exportData.telemetryEvents).toHaveLength(1);
      expect(exportData.modelSnapshots).toHaveLength(1);
      expect(exportData.auditLogs).toHaveLength(1);
    });
  });

  describe('Cleanup Scheduling', () => {
    it('should determine next cleanup time based on data volume', async () => {
      // Mock high data volume
      prisma.telemetryEvent.findMany.mockResolvedValue(
        Array.from({ length: 10000 }, (_, i) => ({ id: `event-${i}` }))
      );

      const nextCleanup = await retentionService.getNextCleanupTime();

      expect(nextCleanup).toBeInstanceOf(Date);
      expect(nextCleanup.getTime()).toBeGreaterThan(Date.now());
    });

    it('should suggest daily cleanup for high-volume systems', async () => {
      // Mock very high data volume
      prisma.telemetryEvent.findMany.mockResolvedValue(
        Array.from({ length: 50000 }, (_, i) => ({ id: `event-${i}` }))
      );

      const schedule = await retentionService.getRecommendedSchedule();

      expect(schedule.frequency).toBe('daily');
      expect(schedule.reason).toContain('high data volume');
    });

    it('should suggest weekly cleanup for normal volume', async () => {
      // Mock normal data volume
      prisma.telemetryEvent.findMany.mockResolvedValue(
        Array.from({ length: 5000 }, (_, i) => ({ id: `event-${i}` }))
      );

      const schedule = await retentionService.getRecommendedSchedule();

      expect(schedule.frequency).toBe('weekly');
    });
  });

  describe('Error Recovery', () => {
    it('should retry failed operations with exponential backoff', async () => {
      let attempt = 0;
      prisma.telemetryEvent.deleteMany.mockImplementation(() => {
        attempt++;
        if (attempt <= 2) {
          return Promise.reject(new Error('Temporary failure'));
        }
        return Promise.resolve({ count: 100 });
      });

      const stats = await retentionService.runRetentionCleanup();

      expect(attempt).toBe(3); // Two failures, then success
      expect(stats.deletedCounts.telemetryEvents).toBe(100);
      expect(stats.errors).toHaveLength(0); // Eventually succeeded
    });

    it('should abort after maximum retry attempts', async () => {
      prisma.telemetryEvent.deleteMany.mockRejectedValue(new Error('Persistent failure'));

      const stats = await retentionService.runRetentionCleanup();

      expect(stats.errors).toHaveLength(1);
      expect(stats.errors[0]).toContain('Persistent failure');
    });
  });
});