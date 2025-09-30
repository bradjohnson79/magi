/**
 * Privacy and Governance Service Tests
 *
 * Tests for data scrubbing, consent management, and privacy compliance.
 */

import { PrivacyGovernanceService } from '@/services/privacy/scrub';
import { prisma } from '@/lib/db';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    modelRun: {
      findMany: jest.fn(),
      update: jest.fn(),
    },
    feedback: {
      count: jest.fn(),
      deleteMany: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
      count: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('PrivacyGovernanceService', () => {
  let service: PrivacyGovernanceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PrivacyGovernanceService();
  });

  describe('scrubUserData', () => {
    const mockUser = {
      id: 'user-1',
      clerkId: 'clerk-1',
      allowTraining: false,
      createdAt: new Date(),
    };

    const mockModelRun = {
      id: 'run-1',
      success: true,
      createdAt: new Date(),
      feedback: [],
    };

    it('should scrub data for non-consenting users', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser] as any);
      mockPrisma.modelRun.findMany.mockResolvedValue([mockModelRun] as any);
      mockPrisma.feedback.count.mockResolvedValue(2);
      mockPrisma.telemetryEvent.count.mockResolvedValue(5);
      mockPrisma.modelRun.update.mockResolvedValue({} as any);
      mockPrisma.feedback.deleteMany.mockResolvedValue({ count: 2 } as any);
      mockPrisma.telemetryEvent.deleteMany.mockResolvedValue({ count: 5 } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await service.scrubUserData();

      expect(result.scrubbed).toBeGreaterThan(0);
      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.modelRun.update).toHaveBeenCalledWith({
        where: { id: 'run-1' },
        data: {
          inputPayload: { scrubbed: true, timestamp: expect.any(String) },
          outputPayload: { scrubbed: true, timestamp: expect.any(String) },
          provenance: {
            scrubbed: true,
            originalId: 'run-1',
            scrubbed_at: expect.any(String),
          },
        },
      });
    });

    it('should preserve data for consenting users', async () => {
      const consentingUser = { ...mockUser, allowTraining: true };
      mockPrisma.user.findMany.mockResolvedValue([consentingUser] as any);
      mockPrisma.modelRun.findMany.mockResolvedValue([mockModelRun] as any);
      mockPrisma.telemetryEvent.count.mockResolvedValue(3);
      mockPrisma.telemetryEvent.deleteMany.mockResolvedValue({ count: 3 } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await service.scrubUserData();

      expect(result.preserved).toBeGreaterThan(0);
      expect(mockPrisma.modelRun.update).not.toHaveBeenCalled();
      expect(mockPrisma.feedback.deleteMany).not.toHaveBeenCalled();
    });

    it('should handle dry run mode', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser] as any);
      mockPrisma.modelRun.findMany.mockResolvedValue([mockModelRun] as any);
      mockPrisma.feedback.count.mockResolvedValue(1);
      mockPrisma.telemetryEvent.count.mockResolvedValue(2);

      const result = await service.scrubUserData({ dryRun: true });

      expect(result.scrubbed).toBeGreaterThan(0);
      expect(mockPrisma.modelRun.update).not.toHaveBeenCalled();
      expect(mockPrisma.feedback.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.telemetryEvent.deleteMany).not.toHaveBeenCalled();
    });

    it('should scrub specific user when userId provided', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser] as any);
      mockPrisma.modelRun.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);
      mockPrisma.telemetryEvent.count.mockResolvedValue(1);
      mockPrisma.telemetryEvent.deleteMany.mockResolvedValue({ count: 1 } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await service.scrubUserData({ userId: 'user-1' });

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        select: expect.any(Object),
      });
      expect(result.errors).toHaveLength(0);
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.user.findMany.mockResolvedValue([mockUser] as any);
      mockPrisma.modelRun.findMany.mockRejectedValue(new Error('Database error'));

      const result = await service.scrubUserData();

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('user-1');
    });

    it('should respect force parameter', async () => {
      const consentingUser = { ...mockUser, allowTraining: true };
      mockPrisma.user.findMany.mockResolvedValue([consentingUser] as any);
      mockPrisma.modelRun.findMany.mockResolvedValue([mockModelRun] as any);
      mockPrisma.feedback.count.mockResolvedValue(0);
      mockPrisma.telemetryEvent.count.mockResolvedValue(1);
      mockPrisma.modelRun.update.mockResolvedValue({} as any);
      mockPrisma.telemetryEvent.deleteMany.mockResolvedValue({ count: 1 } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await service.scrubUserData({ force: true });

      // Even consenting user should be scrubbed when forced
      expect(result.scrubbed).toBeGreaterThan(0);
      expect(mockPrisma.modelRun.update).toHaveBeenCalled();
    });
  });

  describe('updateUserConsent', () => {
    const mockUser = {
      id: 'user-1',
      clerkId: 'clerk-1',
      allowTraining: false,
    };

    it('should update user consent successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.user.update.mockResolvedValue({ ...mockUser, allowTraining: true } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await service.updateUserConsent('clerk-1', true, 'user_request');

      expect(result.success).toBe(true);
      expect(result.message).toContain('enabled');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { allowTraining: true },
      });
      expect(mockPrisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'consent_updated',
          userId: 'user-1',
          payload: expect.objectContaining({
            previousConsent: false,
            newConsent: true,
            reason: 'user_request',
          }),
        },
      });
    });

    it('should handle user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await service.updateUserConsent('nonexistent', true);

      expect(result.success).toBe(false);
      expect(result.message).toBe('User not found');
    });

    it('should handle database errors', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.user.update.mockRejectedValue(new Error('Update failed'));

      const result = await service.updateUserConsent('clerk-1', true);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to update consent');
    });
  });

  describe('getConsentStats', () => {
    it('should return consent statistics', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(100) // total users
        .mockResolvedValueOnce(75); // consenting users

      mockPrisma.telemetryEvent.count.mockResolvedValue(5); // recent opt-outs

      const stats = await service.getConsentStats();

      expect(stats.totalUsers).toBe(100);
      expect(stats.consentingUsers).toBe(75);
      expect(stats.consentRate).toBe(0.75);
      expect(stats.recentOptOuts).toBe(5);
    });

    it('should handle empty user base', async () => {
      mockPrisma.user.count
        .mockResolvedValueOnce(0)
        .mockResolvedValueOnce(0);
      mockPrisma.telemetryEvent.count.mockResolvedValue(0);

      const stats = await service.getConsentStats();

      expect(stats.totalUsers).toBe(0);
      expect(stats.consentingUsers).toBe(0);
      expect(stats.consentRate).toBe(0);
    });

    it('should handle database errors', async () => {
      mockPrisma.user.count.mockRejectedValue(new Error('DB error'));

      const stats = await service.getConsentStats();

      expect(stats.totalUsers).toBe(0);
      expect(stats.consentingUsers).toBe(0);
      expect(stats.consentRate).toBe(0);
      expect(stats.recentOptOuts).toBe(0);
    });
  });

  describe('exportUserData', () => {
    const mockUser = {
      id: 'user-1',
      clerkId: 'clerk-1',
      name: 'Test User',
      email: 'test@example.com',
      allowTraining: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      modelRuns: [
        {
          id: 'run-1',
          success: true,
          confidence: 0.9,
          costUsd: 0.01,
          runtimeMs: 1000,
          createdAt: new Date(),
          feedback: [],
        },
      ],
      feedback: [
        {
          id: 'feedback-1',
          rating: 5,
          comment: 'Great!',
          correction: null,
          createdAt: new Date(),
          modelRun: { id: 'run-1' },
        },
      ],
      telemetryEvents: [
        {
          eventType: 'user_action',
          createdAt: new Date(),
        },
      ],
    };

    it('should export user data successfully', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await service.exportUserData('clerk-1');

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data.user.email).toBe('test@example.com');
      expect(result.data.modelRuns).toHaveLength(1);
      expect(result.data.feedback).toHaveLength(1);
      expect(result.data.telemetryEvents).toHaveLength(1);
      expect(result.data.exportMetadata.totalModelRuns).toBe(1);

      // Verify sensitive data is excluded
      expect(result.data.modelRuns[0]).not.toHaveProperty('inputPayload');
      expect(result.data.modelRuns[0]).not.toHaveProperty('outputPayload');
      expect(result.data.telemetryEvents[0]).not.toHaveProperty('payload');
    });

    it('should handle user not found', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const result = await service.exportUserData('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toBe('User not found');
    });

    it('should handle export errors', async () => {
      mockPrisma.user.findFirst.mockRejectedValue(new Error('Export error'));

      const result = await service.exportUserData('clerk-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Export failed');
    });

    it('should log export request', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      await service.exportUserData('clerk-1');

      expect(mockPrisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'data_export_requested',
          userId: 'user-1',
          payload: expect.objectContaining({
            exportedAt: expect.any(String),
            recordCount: expect.any(Object),
          }),
        },
      });
    });
  });

  describe('getGovernanceMetrics', () => {
    it('should return comprehensive governance metrics', async () => {
      // Mock consent stats
      mockPrisma.user.count
        .mockResolvedValueOnce(200) // total users
        .mockResolvedValueOnce(150); // consenting users

      // Mock telemetry events
      mockPrisma.telemetryEvent.count
        .mockResolvedValueOnce(3) // recent opt-outs
        .mockResolvedValueOnce(8) // recent scrubs
        .mockResolvedValueOnce(2); // export requests

      service = new PrivacyGovernanceService({
        deleteAfterDays: 365,
      });

      const metrics = await service.getGovernanceMetrics();

      expect(metrics.consentStats.totalUsers).toBe(200);
      expect(metrics.consentStats.consentingUsers).toBe(150);
      expect(metrics.consentStats.consentRate).toBe(0.75);
      expect(metrics.recentScrubs).toBe(8);
      expect(metrics.exportRequests).toBe(2);
      expect(metrics.dataRetentionCompliance).toBeGreaterThan(0);
    });
  });

  describe('configuration options', () => {
    it('should respect custom configuration', async () => {
      const customService = new PrivacyGovernanceService({
        respectUserConsent: false,
        deleteAfterDays: 30,
        preserveMetrics: false,
        logActions: false,
      });

      const config = (customService as any).config;

      expect(config.respectUserConsent).toBe(false);
      expect(config.deleteAfterDays).toBe(30);
      expect(config.preserveMetrics).toBe(false);
      expect(config.logActions).toBe(false);
    });

    it('should use default configuration when not specified', async () => {
      const defaultService = new PrivacyGovernanceService();
      const config = (defaultService as any).config;

      expect(config.respectUserConsent).toBe(true);
      expect(config.preserveMetrics).toBe(true);
      expect(config.logActions).toBe(true);
      expect(config.deleteAfterDays).toBeUndefined();
    });
  });
});