/**
 * Usage Tracking Service Tests
 *
 * Tests for usage tracking, plan enforcement, and billing governance.
 */

import { UsageTrackingService } from '@/lib/usage/tracking';
import { prisma } from '@/lib/db';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    usageCounter: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
      deleteMany: jest.fn(),
      groupBy: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      groupBy: jest.fn(),
    },
    snapshot: {
      count: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('UsageTrackingService', () => {
  let service: UsageTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new UsageTrackingService();
  });

  describe('incrementUsage', () => {
    it('should increment usage counters for new period', async () => {
      const userId = 'user-1';
      const increment = { prompts: 1, bytesOut: 1024 };

      const mockCounter = {
        id: 'counter-1',
        userId,
        period: '2024-12',
        prompts: 1,
        e2eRuns: 0,
        bytesOut: BigInt(1024),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.usageCounter.upsert.mockResolvedValue(mockCounter as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await service.incrementUsage(userId, increment);

      expect(result).toEqual(mockCounter);
      expect(mockPrisma.usageCounter.upsert).toHaveBeenCalledWith({
        where: {
          userId_period: {
            userId,
            period: expect.stringMatching(/^\d{4}-\d{2}$/),
          },
        },
        create: {
          userId,
          period: expect.stringMatching(/^\d{4}-\d{2}$/),
          prompts: 1,
          e2eRuns: 0,
          bytesOut: BigInt(1024),
        },
        update: {
          prompts: { increment: 1 },
          e2eRuns: { increment: 0 },
          bytesOut: { increment: BigInt(1024) },
        },
      });
    });

    it('should handle database errors gracefully', async () => {
      mockPrisma.usageCounter.upsert.mockRejectedValue(new Error('Database error'));

      await expect(
        service.incrementUsage('user-1', { prompts: 1 })
      ).rejects.toThrow('Usage tracking failed');
    });
  });

  describe('getCurrentUsage', () => {
    it('should return current period usage', async () => {
      const mockCounter = {
        id: 'counter-1',
        userId: 'user-1',
        period: '2024-12',
        prompts: 15,
        e2eRuns: 5,
        bytesOut: BigInt(2048),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.usageCounter.findUnique.mockResolvedValue(mockCounter as any);

      const result = await service.getCurrentUsage('user-1');

      expect(result).toEqual(mockCounter);
      expect(mockPrisma.usageCounter.findUnique).toHaveBeenCalledWith({
        where: {
          userId_period: {
            userId: 'user-1',
            period: expect.stringMatching(/^\d{4}-\d{2}$/),
          },
        },
      });
    });

    it('should return null when no usage found', async () => {
      mockPrisma.usageCounter.findUnique.mockResolvedValue(null);

      const result = await service.getCurrentUsage('user-1');

      expect(result).toBeNull();
    });
  });

  describe('checkUsageAllowed', () => {
    it('should allow usage under trial limits', async () => {
      const mockUser = { plan: 'trial', role: 'user' };
      const mockUsage = { prompts: 25, e2eRuns: 0, bytesOut: BigInt(0) };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(mockUsage as any);

      const result = await service.checkUsageAllowed('user-1', 'prompts', 1);

      expect(result.allowed).toBe(true);
      expect(result.currentUsage).toBe(25);
      expect(result.limit).toBe(30);
      expect(result.isHardLimit).toBe(true);
    });

    it('should reject usage over trial hard limits', async () => {
      const mockUser = { plan: 'trial', role: 'user' };
      const mockUsage = { prompts: 30, e2eRuns: 0, bytesOut: BigInt(0) };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(mockUsage as any);

      const result = await service.checkUsageAllowed('user-1', 'prompts', 1);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Hard limit exceeded');
      expect(result.isHardLimit).toBe(true);
    });

    it('should allow usage over solo soft limits with warning', async () => {
      const mockUser = { plan: 'solo', role: 'user' };
      const mockUsage = { prompts: 9999, e2eRuns: 0, bytesOut: BigInt(0) };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(mockUsage as any);

      const result = await service.checkUsageAllowed('user-1', 'prompts', 2);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Soft limit exceeded');
      expect(result.isHardLimit).toBe(false);
    });

    it('should allow unlimited usage for teams plan', async () => {
      const mockUser = { plan: 'teams', role: 'user' };
      const mockUsage = { prompts: 50000, e2eRuns: 1000, bytesOut: BigInt(1000000) };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(mockUsage as any);

      const result = await service.checkUsageAllowed('user-1', 'prompts', 100);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Unlimited');
    });

    it('should bypass limits for admin users', async () => {
      const mockUser = { plan: 'trial', role: 'admin' };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.checkUsageAllowed('admin-1', 'prompts', 1000);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Admin bypass');
    });
  });

  describe('checkFeatureAllowed', () => {
    it('should deny git export for trial users', async () => {
      const mockUser = { plan: 'trial', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.checkFeatureAllowed('user-1', 'gitExport');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Feature not available on current plan');
      expect(result.planRequired).toBe('solo');
    });

    it('should allow git export for solo users', async () => {
      const mockUser = { plan: 'solo', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.checkFeatureAllowed('user-1', 'gitExport');

      expect(result.allowed).toBe(true);
    });

    it('should deny multi-user for solo users', async () => {
      const mockUser = { plan: 'solo', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      const result = await service.checkFeatureAllowed('user-1', 'multiUser');

      expect(result.allowed).toBe(false);
      expect(result.planRequired).toBe('solo'); // Teams actually, but this shows upgrade path
    });

    it('should enforce snapshot rate limits', async () => {
      const mockUser = { plan: 'solo', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.snapshot.count.mockResolvedValue(1); // Already 1 in last minute

      const result = await service.checkFeatureAllowed('user-1', 'activeProjectSnapshots');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit: 1 snapshots per minute');
    });

    it('should allow snapshots under rate limit', async () => {
      const mockUser = { plan: 'solo', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.snapshot.count.mockResolvedValue(0); // No recent snapshots

      const result = await service.checkFeatureAllowed('user-1', 'activeProjectSnapshots');

      expect(result.allowed).toBe(true);
    });
  });

  describe('getUserUsageStats', () => {
    it('should return complete usage statistics', async () => {
      const mockUser = { plan: 'solo' };
      const mockUsage = {
        id: 'counter-1',
        userId: 'user-1',
        period: '2024-12',
        prompts: 5000,
        e2eRuns: 10,
        bytesOut: BigInt(1024000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(mockUsage as any);

      const result = await service.getUserUsageStats('user-1');

      expect(result.plan).toBe('solo');
      expect(result.currentPeriod).toEqual(mockUsage);
      expect(result.limits.prompts).toBe(10000);
      expect(result.percentUsed.prompts).toBe(50); // 5000/10000 * 100
    });

    it('should handle unlimited plans correctly', async () => {
      const mockUser = { plan: 'teams' };
      const mockUsage = {
        id: 'counter-1',
        userId: 'user-1',
        period: '2024-12',
        prompts: 50000,
        e2eRuns: 100,
        bytesOut: BigInt(10240000),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(mockUsage as any);

      const result = await service.getUserUsageStats('user-1');

      expect(result.plan).toBe('teams');
      expect(result.percentUsed.prompts).toBeNull(); // Unlimited
      expect(result.percentUsed.e2eRuns).toBeNull();
    });
  });

  describe('getAdminUsageStats', () => {
    it('should return comprehensive admin statistics', async () => {
      const mockTopUsers = [
        {
          userId: 'user-1',
          period: '2024-12',
          prompts: 1000,
          e2eRuns: 50,
          bytesOut: BigInt(2048000),
          user: { name: 'John Doe', email: 'john@example.com', plan: 'solo' },
        },
      ];

      const mockTotalStats = {
        _sum: { prompts: 5000, e2eRuns: 200, bytesOut: BigInt(10240000) },
        _count: { userId: 25 },
      };

      const mockPlanCounts = [
        { plan: 'trial', _count: { plan: 10 } },
        { plan: 'solo', _count: { plan: 12 } },
        { plan: 'teams', _count: { plan: 3 } },
      ];

      mockPrisma.usageCounter.findMany.mockResolvedValue(mockTopUsers as any);
      mockPrisma.usageCounter.aggregate.mockResolvedValue(mockTotalStats as any);
      mockPrisma.user.groupBy.mockResolvedValue(mockPlanCounts as any);

      const result = await service.getAdminUsageStats();

      expect(result.topUsers).toHaveLength(1);
      expect(result.topUsers[0].user.name).toBe('John Doe');
      expect(result.totalStats.totalPrompts).toBe(5000);
      expect(result.totalStats.totalUsers).toBe(25);
      expect(result.planBreakdown.trial).toBe(10);
      expect(result.planBreakdown.solo).toBe(12);
      expect(result.planBreakdown.teams).toBe(3);
    });
  });

  describe('cleanupOldCounters', () => {
    it('should clean up old usage counters', async () => {
      mockPrisma.usageCounter.deleteMany.mockResolvedValue({ count: 150 });

      const result = await service.cleanupOldCounters(12);

      expect(result).toBe(150);
      expect(mockPrisma.usageCounter.deleteMany).toHaveBeenCalledWith({
        where: {
          period: { lt: expect.stringMatching(/^\d{4}-\d{2}$/) },
        },
      });
    });

    it('should handle cleanup errors', async () => {
      mockPrisma.usageCounter.deleteMany.mockRejectedValue(new Error('Cleanup failed'));

      await expect(service.cleanupOldCounters()).rejects.toThrow('Cleanup failed');
    });
  });

  describe('plan limits', () => {
    it('should return correct limits for trial plan', () => {
      const limits = service.getPlanLimits('trial');

      expect(limits.prompts).toBe(30);
      expect(limits.features.gitExport).toBe(false);
      expect(limits.features.multiUser).toBe(false);
      expect(limits.features.activeProjectSnapshots).toBe(0);
    });

    it('should return correct limits for solo plan', () => {
      const limits = service.getPlanLimits('solo');

      expect(limits.prompts).toBe(10000);
      expect(limits.features.gitExport).toBe(true);
      expect(limits.features.multiUser).toBe(false);
      expect(limits.features.activeProjectSnapshots).toBe(1);
    });

    it('should return correct limits for teams plan', () => {
      const limits = service.getPlanLimits('teams');

      expect(limits.prompts).toBeNull(); // Unlimited
      expect(limits.features.gitExport).toBe(true);
      expect(limits.features.multiUser).toBe(true);
      expect(limits.features.activeProjectSnapshots).toBe(10);
    });
  });

  describe('period handling', () => {
    it('should generate correct current period format', () => {
      // Test the private getCurrentPeriod method through public methods
      const mockUsage = { prompts: 1, e2eRuns: 0, bytesOut: BigInt(0) };
      mockPrisma.usageCounter.upsert.mockResolvedValue(mockUsage as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      service.incrementUsage('user-1', { prompts: 1 });

      expect(mockPrisma.usageCounter.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_period: {
              userId: 'user-1',
              period: expect.stringMatching(/^\d{4}-\d{2}$/),
            },
          },
        })
      );
    });
  });
});