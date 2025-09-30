/**
 * Plan Gating Integration Tests
 *
 * End-to-end tests for the complete plan gating and usage tracking system.
 */

import { prisma } from '@/lib/db';
import { UsageTrackingService } from '@/lib/usage/tracking';
import { usageMiddleware } from '@/lib/middleware/usage';
import { NextRequest, NextResponse } from 'next/server';

// Mock external dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    usageCounter: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
      aggregate: jest.fn(),
    },
    snapshot: {
      count: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
    },
  },
}));

jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const { auth } = require('@clerk/nextjs/server');

describe('Plan Gating Integration', () => {
  let usageService: UsageTrackingService;

  beforeEach(() => {
    jest.clearAllMocks();
    usageService = new UsageTrackingService();
  });

  describe('Monthly Usage Rollover', () => {
    it('should create new usage counters for new months', async () => {
      const userId = 'user-1';

      // Mock empty current usage (new month)
      mockPrisma.usageCounter.findUnique.mockResolvedValue(null);

      // Mock creating new counter
      const newCounter = {
        id: 'counter-1',
        userId,
        period: '2025-01',
        prompts: 1,
        e2eRuns: 0,
        bytesOut: BigInt(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.usageCounter.upsert.mockResolvedValue(newCounter as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await usageService.incrementUsage(userId, { prompts: 1 });

      expect(result.prompts).toBe(1);
      expect(mockPrisma.usageCounter.upsert).toHaveBeenCalledWith({
        where: {
          userId_period: {
            userId,
            period: expect.stringMatching(/^\d{4}-\d{2}$/),
          },
        },
        create: expect.objectContaining({
          prompts: 1,
        }),
        update: expect.objectContaining({
          prompts: { increment: 1 },
        }),
      });
    });

    it('should increment existing usage counters', async () => {
      const userId = 'user-1';
      const existingCounter = {
        id: 'counter-1',
        userId,
        period: '2025-01',
        prompts: 15,
        e2eRuns: 2,
        bytesOut: BigInt(1024),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const updatedCounter = {
        ...existingCounter,
        prompts: 16,
        e2eRuns: 3,
        bytesOut: BigInt(2048),
      };

      mockPrisma.usageCounter.upsert.mockResolvedValue(updatedCounter as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await usageService.incrementUsage(userId, {
        prompts: 1,
        e2eRuns: 1,
        bytesOut: 1024,
      });

      expect(result.prompts).toBe(16);
      expect(result.e2eRuns).toBe(3);
      expect(result.bytesOut).toBe(BigInt(2048));
    });
  });

  describe('Plan Enforcement Scenarios', () => {
    it('should enforce trial plan limits strictly', async () => {
      const trialUser = { id: 'user-1', plan: 'trial', role: 'user' };
      const maxUsage = { prompts: 30, e2eRuns: 0, bytesOut: BigInt(0) };

      mockPrisma.user.findUnique.mockResolvedValue(trialUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(maxUsage as any);

      // Should reject additional usage
      const result = await usageService.checkUsageAllowed('user-1', 'prompts', 1);

      expect(result.allowed).toBe(false);
      expect(result.isHardLimit).toBe(true);
      expect(result.currentUsage).toBe(30);
      expect(result.limit).toBe(30);
    });

    it('should allow unlimited usage for teams plan', async () => {
      const teamsUser = { id: 'user-1', plan: 'teams', role: 'user' };
      const highUsage = { prompts: 100000, e2eRuns: 5000, bytesOut: BigInt(1000000000) };

      mockPrisma.user.findUnique.mockResolvedValue(teamsUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(highUsage as any);

      const result = await usageService.checkUsageAllowed('user-1', 'prompts', 1000);

      expect(result.allowed).toBe(true);
      expect(result.reason).toBe('Unlimited');
    });

    it('should warn but allow solo plan soft limit overages', async () => {
      const soloUser = { id: 'user-1', plan: 'solo', role: 'user' };
      const highUsage = { prompts: 9999, e2eRuns: 0, bytesOut: BigInt(0) };

      mockPrisma.user.findUnique.mockResolvedValue(soloUser as any);
      mockPrisma.usageCounter.findUnique.mockResolvedValue(highUsage as any);

      const result = await usageService.checkUsageAllowed('user-1', 'prompts', 2);

      expect(result.allowed).toBe(false);
      expect(result.isHardLimit).toBe(false);
      expect(result.reason).toBe('Soft limit exceeded');
    });
  });

  describe('Feature Gating', () => {
    it('should deny git export for trial users', async () => {
      const trialUser = { id: 'user-1', plan: 'trial', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(trialUser as any);

      const result = await usageService.checkFeatureAllowed('user-1', 'gitExport');

      expect(result.allowed).toBe(false);
      expect(result.planRequired).toBe('solo');
    });

    it('should allow git export for paid plans', async () => {
      const soloUser = { id: 'user-1', plan: 'solo', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(soloUser as any);

      const result = await usageService.checkFeatureAllowed('user-1', 'gitExport');

      expect(result.allowed).toBe(true);
    });

    it('should enforce snapshot rate limits', async () => {
      const soloUser = { id: 'user-1', plan: 'solo', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(soloUser as any);

      // Mock 1 snapshot in last minute (at limit)
      mockPrisma.snapshot.count.mockResolvedValue(1);

      const result = await usageService.checkFeatureAllowed('user-1', 'activeProjectSnapshots');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Rate limit: 1 snapshots per minute');
    });

    it('should allow snapshots under rate limit', async () => {
      const teamsUser = { id: 'user-1', plan: 'teams', role: 'user' };
      mockPrisma.user.findUnique.mockResolvedValue(teamsUser as any);

      // Mock 5 snapshots in last minute (under teams limit of 10)
      mockPrisma.snapshot.count.mockResolvedValue(5);

      const result = await usageService.checkFeatureAllowed('user-1', 'activeProjectSnapshots');

      expect(result.allowed).toBe(true);
    });
  });

  describe('Admin Bypass', () => {
    it('should bypass all limits for admin users', async () => {
      const adminUser = { id: 'admin-1', plan: 'trial', role: 'admin' };
      mockPrisma.user.findUnique.mockResolvedValue(adminUser as any);

      // Test usage bypass
      const usageResult = await usageService.checkUsageAllowed('admin-1', 'prompts', 1000);
      expect(usageResult.allowed).toBe(true);
      expect(usageResult.reason).toBe('Admin bypass');

      // Test feature bypass
      const featureResult = await usageService.checkFeatureAllowed('admin-1', 'gitExport');
      expect(featureResult.allowed).toBe(true);
      expect(featureResult.reason).toBe('Admin bypass');
    });
  });

  describe('End-to-End API Flow', () => {
    it('should complete full middleware flow for valid requests', async () => {
      // Mock authenticated user
      auth.mockResolvedValue({ userId: 'clerk-1' });

      const trialUser = {
        id: 'user-1',
        plan: 'trial',
        role: 'user',
        email: 'test@example.com',
      };

      mockPrisma.user.findFirst.mockResolvedValue(trialUser as any);

      // Mock usage check (under limit)
      mockPrisma.usageCounter.findUnique.mockResolvedValue({
        prompts: 15,
        e2eRuns: 0,
        bytesOut: BigInt(0),
      } as any);

      // Mock successful tracking
      mockPrisma.usageCounter.upsert.mockResolvedValue({
        id: 'counter-1',
        userId: 'user-1',
        period: '2025-01',
        prompts: 16,
        e2eRuns: 0,
        bytesOut: BigInt(1024),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      // Create mock handler
      const mockHandler = jest.fn().mockResolvedValue(
        NextResponse.json({ success: true, data: 'test' })
      );

      const wrappedHandler = usageMiddleware.prompts(mockHandler);

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify({ content: 'test prompt' }),
      });

      const response = await wrappedHandler(request);

      expect(response.status).toBe(200);
      expect(mockHandler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          userId: 'user-1',
          user: trialUser,
          usage: expect.objectContaining({
            allowed: true,
            currentUsage: 15,
            limit: 30,
          }),
        })
      );
    });

    it('should reject requests over trial limits', async () => {
      auth.mockResolvedValue({ userId: 'clerk-1' });

      const trialUser = {
        id: 'user-1',
        plan: 'trial',
        role: 'user',
        email: 'test@example.com',
      };

      mockPrisma.user.findFirst.mockResolvedValue(trialUser as any);

      // Mock usage at limit
      mockPrisma.usageCounter.findUnique.mockResolvedValue({
        prompts: 30,
        e2eRuns: 0,
        bytesOut: BigInt(0),
      } as any);

      const mockHandler = jest.fn();
      const wrappedHandler = usageMiddleware.prompts(mockHandler);

      const request = new NextRequest('http://localhost/api/prompts', {
        method: 'POST',
        body: JSON.stringify({ content: 'test prompt' }),
      });

      const response = await wrappedHandler(request);
      const data = await response.json();

      expect(response.status).toBe(429);
      expect(data.error).toBe('Usage limit exceeded');
      expect(data.currentUsage).toBe(30);
      expect(data.limit).toBe(30);
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should reject git export for trial users', async () => {
      auth.mockResolvedValue({ userId: 'clerk-1' });

      const trialUser = {
        id: 'user-1',
        plan: 'trial',
        role: 'user',
        email: 'test@example.com',
      };

      mockPrisma.user.findFirst.mockResolvedValue(trialUser as any);

      const mockHandler = jest.fn();
      const wrappedHandler = usageMiddleware.gitExport(mockHandler);

      const request = new NextRequest('http://localhost/api/export', {
        method: 'POST',
      });

      const response = await wrappedHandler(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.error).toBe('Feature not available');
      expect(data.planRequired).toBe('solo');
      expect(data.currentPlan).toBe('trial');
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Data Cleanup and Maintenance', () => {
    it('should clean up old usage counters', async () => {
      mockPrisma.usageCounter.deleteMany.mockResolvedValue({ count: 200 });

      const deletedCount = await usageService.cleanupOldCounters(6);

      expect(deletedCount).toBe(200);
      expect(mockPrisma.usageCounter.deleteMany).toHaveBeenCalledWith({
        where: {
          period: { lt: expect.stringMatching(/^\d{4}-\d{2}$/) },
        },
      });
    });

    it('should handle month transitions correctly', async () => {
      // Test that period calculation works across month boundaries
      const currentDate = new Date();
      const expectedPeriod = `${currentDate.getFullYear()}-${String(
        currentDate.getMonth() + 1
      ).padStart(2, '0')}`;

      mockPrisma.usageCounter.upsert.mockImplementation(({ where }) => {
        expect(where.userId_period.period).toBe(expectedPeriod);
        return Promise.resolve({
          id: 'counter-1',
          userId: 'user-1',
          period: expectedPeriod,
          prompts: 1,
          e2eRuns: 0,
          bytesOut: BigInt(0),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any);
      });

      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      await usageService.incrementUsage('user-1', { prompts: 1 });

      expect(mockPrisma.usageCounter.upsert).toHaveBeenCalled();
    });
  });

  describe('Error Resilience', () => {
    it('should handle database errors gracefully in usage tracking', async () => {
      mockPrisma.usageCounter.upsert.mockRejectedValue(new Error('Database connection failed'));

      await expect(usageService.incrementUsage('user-1', { prompts: 1 })).rejects.toThrow(
        'Usage tracking failed'
      );
    });

    it('should handle usage check errors gracefully', async () => {
      mockPrisma.user.findUnique.mockRejectedValue(new Error('Database error'));

      const result = await usageService.checkUsageAllowed('user-1', 'prompts');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Usage check failed');
    });

    it('should continue operation if telemetry logging fails', async () => {
      mockPrisma.usageCounter.upsert.mockResolvedValue({
        id: 'counter-1',
        userId: 'user-1',
        period: '2025-01',
        prompts: 1,
        e2eRuns: 0,
        bytesOut: BigInt(0),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockPrisma.telemetryEvent.create.mockRejectedValue(new Error('Telemetry failed'));

      // Should not throw even though telemetry fails
      const result = await usageService.incrementUsage('user-1', { prompts: 1 });

      expect(result.prompts).toBe(1);
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent usage increments correctly', async () => {
      const userId = 'user-1';
      let currentPrompts = 0;

      mockPrisma.usageCounter.upsert.mockImplementation(async ({ create, update }) => {
        // Simulate atomic increment
        currentPrompts += (update as any).prompts.increment;
        return {
          id: 'counter-1',
          userId,
          period: '2025-01',
          prompts: currentPrompts,
          e2eRuns: 0,
          bytesOut: BigInt(0),
          createdAt: new Date(),
          updatedAt: new Date(),
        } as any;
      });

      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      // Simulate 10 concurrent increments
      const promises = Array.from({ length: 10 }, () =>
        usageService.incrementUsage(userId, { prompts: 1 })
      );

      const results = await Promise.all(promises);

      // All increments should complete
      expect(results).toHaveLength(10);
      results.forEach(result => {
        expect(result.userId).toBe(userId);
        expect(result.prompts).toBeGreaterThan(0);
      });
    });
  });
});