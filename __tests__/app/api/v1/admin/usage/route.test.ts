/**
 * Admin Usage API Tests
 *
 * Tests for the admin usage dashboard API endpoints.
 */

import { GET, POST } from '@/app/api/v1/admin/usage/route';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { usageTrackingService } from '@/lib/usage/tracking';
import { NextRequest } from 'next/server';

// Mock dependencies
jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    usageCounter: {
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));
jest.mock('@/lib/usage/tracking', () => ({
  usageTrackingService: {
    getUserUsageStats: jest.fn(),
    getAdminUsageStats: jest.fn(),
    cleanupOldCounters: jest.fn(),
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockUsageService = usageTrackingService as jest.Mocked<typeof usageTrackingService>;

describe('/api/v1/admin/usage', () => {
  const mockAdminUser = {
    id: 'admin-1',
    email: 'admin@magi.com',
    role: 'admin',
    team: [],
  };

  const mockRegularUser = {
    id: 'user-1',
    email: 'user@example.com',
    role: 'user',
    team: [],
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/admin/usage', () => {
    it('should reject unauthenticated requests', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const request = new NextRequest('http://localhost/api/v1/admin/usage');
      const response = await GET(request);

      expect(response.status).toBe(401);
    });

    it('should reject non-admin requests', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-user' });
      mockPrisma.user.findFirst.mockResolvedValue(mockRegularUser as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage');
      const response = await GET(request);

      expect(response.status).toBe(403);
    });

    it('should return comprehensive dashboard data for admins', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);

      const mockAdminStats = {
        topUsers: [
          {
            userId: 'user-1',
            user: { name: 'John Doe', email: 'john@example.com', plan: 'solo' },
            prompts: 1000,
            e2eRuns: 50,
            bytesOut: BigInt(2048000),
          },
        ],
        totalStats: {
          totalPrompts: 5000,
          totalE2eRuns: 200,
          totalBytesOut: BigInt(10240000),
          totalUsers: 25,
        },
        planBreakdown: { trial: 10, solo: 12, teams: 3 },
      };

      const mockPlanBreakdown = [
        { plan: 'trial', _count: { plan: 10 } },
        { plan: 'solo', _count: { plan: 12 } },
        { plan: 'teams', _count: { plan: 3 } },
      ];

      const mockRecentActivity = [
        {
          id: 'event-1',
          createdAt: new Date(),
          payload: { increment: { prompts: 1 } },
          user: { name: 'Jane Doe', email: 'jane@example.com', plan: 'trial' },
        },
      ];

      mockUsageService.getAdminUsageStats.mockResolvedValue(mockAdminStats);
      mockPrisma.user.groupBy.mockResolvedValue(mockPlanBreakdown as any);
      mockPrisma.telemetryEvent.findMany.mockResolvedValue(mockRecentActivity as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.adminStats.totalStats.totalPrompts).toBe(5000);
      expect(data.adminStats.topUsers[0].bytesOut).toBe('2048000'); // BigInt converted to string
      expect(data.planBreakdown.trial).toBe(10);
      expect(data.recentActivity).toHaveLength(1);
      expect(data.metadata.adminUser).toBe('admin@magi.com');
    });

    it('should return specific user usage stats', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);

      const targetUser = {
        id: 'user-1',
        name: 'John Doe',
        email: 'john@example.com',
        plan: 'solo',
        role: 'user',
        createdAt: new Date(),
      };

      const mockUserStats = {
        currentPeriod: {
          id: 'counter-1',
          userId: 'user-1',
          period: '2024-12',
          prompts: 500,
          e2eRuns: 25,
          bytesOut: BigInt(1024000),
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        plan: 'solo' as const,
        limits: {
          prompts: 10000,
          e2eRuns: null,
          bytesOut: null,
          features: {
            gitExport: true,
            multiUser: false,
            activeProjectSnapshots: 1,
          },
        },
        percentUsed: { prompts: 5, e2eRuns: null, bytesOut: null },
      };

      const mockUsageHistory = [
        {
          period: '2024-12',
          prompts: 500,
          e2eRuns: 25,
          bytesOut: BigInt(1024000),
        },
        {
          period: '2024-11',
          prompts: 800,
          e2eRuns: 30,
          bytesOut: BigInt(2048000),
        },
      ];

      mockPrisma.user.findUnique.mockResolvedValue(targetUser as any);
      mockUsageService.getUserUsageStats.mockResolvedValue(mockUserStats);
      mockPrisma.usageCounter.findMany.mockResolvedValue(mockUsageHistory as any);

      const request = new NextRequest(
        'http://localhost/api/v1/admin/usage?endpoint=user&userId=user-1'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.user.email).toBe('john@example.com');
      expect(data.currentUsage.plan).toBe('solo');
      expect(data.history).toHaveLength(2);
      expect(data.history[0].bytesOut).toBe('1024000'); // BigInt converted to string
    });

    it('should return top offenders data', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);

      const mockOffendersStats = {
        topUsers: [
          {
            userId: 'user-1',
            user: { name: 'Heavy User', email: 'heavy@example.com', plan: 'solo' },
            prompts: 5000,
            e2eRuns: 200,
            bytesOut: BigInt(10240000),
          },
        ],
        totalStats: {
          totalPrompts: 10000,
          totalE2eRuns: 500,
          totalBytesOut: BigInt(50000000),
          totalUsers: 50,
        },
        planBreakdown: { trial: 20, solo: 25, teams: 5 },
      };

      mockUsageService.getAdminUsageStats.mockResolvedValue(mockOffendersStats);

      const request = new NextRequest(
        'http://localhost/api/v1/admin/usage?endpoint=offenders&limit=10'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.topUsers[0].prompts).toBe(5000);
      expect(data.totalStats.totalUsers).toBe(50);
    });

    it('should return plan distribution data', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);

      const mockPlanStats = [
        { plan: 'trial', _count: { plan: 15 } },
        { plan: 'solo', _count: { plan: 20 } },
        { plan: 'teams', _count: { plan: 5 } },
      ];

      mockPrisma.user.groupBy.mockResolvedValue(mockPlanStats as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage?endpoint=plans');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.distribution.trial).toBe(15);
      expect(data.distribution.solo).toBe(20);
      expect(data.distribution.teams).toBe(5);
      expect(data.revenueEstimates.solo).toBe(580); // 20 * $29
      expect(data.revenueEstimates.teams).toBe(495); // 5 * $99
      expect(data.total).toBe(40);
    });

    it('should handle invalid query parameters', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);

      const request = new NextRequest(
        'http://localhost/api/v1/admin/usage?limit=invalid&offset=-1'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid query parameters');
    });
  });

  describe('POST /api/v1/admin/usage', () => {
    it('should reject unauthenticated requests', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });

    it('should reject non-admin requests', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-user' });
      mockPrisma.user.findFirst.mockResolvedValue(mockRegularUser as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(403);
    });

    it('should handle cleanup action', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);
      mockUsageService.cleanupOldCounters.mockResolvedValue(150);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({
          action: 'cleanup',
          retentionMonths: 6,
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.deletedCount).toBe(150);
      expect(mockUsageService.cleanupOldCounters).toHaveBeenCalledWith(6);
      expect(mockPrisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'admin_usage_cleanup',
          userId: 'admin-1',
          payload: expect.objectContaining({
            deletedCount: 150,
            retentionMonths: 6,
          }),
        },
      });
    });

    it('should handle plan upgrade action', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);

      const targetUser = {
        id: 'user-1',
        plan: 'trial',
        email: 'user@example.com',
      };

      mockPrisma.user.findUnique.mockResolvedValue(targetUser as any);
      mockPrisma.user.update.mockResolvedValue({ ...targetUser, plan: 'solo' } as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upgrade_plan',
          userId: 'user-1',
          plan: 'solo',
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.previousPlan).toBe('trial');
      expect(data.newPlan).toBe('solo');
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { plan: 'solo' },
      });
    });

    it('should handle user usage reset action', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);
      mockPrisma.usageCounter.deleteMany.mockResolvedValue({ count: 1 });
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({
          action: 'reset_user',
          userId: 'user-1',
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(mockPrisma.usageCounter.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-1',
          period: expect.stringMatching(/^\d{4}-\d{2}$/),
        },
      });
    });

    it('should handle user not found for plan upgrade', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({
          action: 'upgrade_plan',
          userId: 'nonexistent',
          plan: 'solo',
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(404);
    });

    it('should validate input schema', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({
          action: 'invalid_action',
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('Invalid input');
    });

    it('should reject invalid actions', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({
          action: 'cleanup',
          // Missing required fields for cleanup
        }),
      });
      const response = await POST(request);

      expect(response.status).toBe(200); // cleanup doesn't require additional fields
    });

    it('should handle database errors gracefully', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(mockAdminUser as any);
      mockUsageService.cleanupOldCounters.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('http://localhost/api/v1/admin/usage', {
        method: 'POST',
        body: JSON.stringify({ action: 'cleanup' }),
      });
      const response = await POST(request);

      expect(response.status).toBe(500);
    });
  });

  describe('authorization checks', () => {
    it('should allow access for email domain admins', async () => {
      const domainAdmin = {
        ...mockRegularUser,
        email: 'admin@magi.com',
        role: 'user',
      };

      mockAuth.mockResolvedValue({ userId: 'clerk-domain-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(domainAdmin as any);
      mockUsageService.getAdminUsageStats.mockResolvedValue({
        topUsers: [],
        totalStats: {
          totalPrompts: 0,
          totalE2eRuns: 0,
          totalBytesOut: BigInt(0),
          totalUsers: 0,
        },
        planBreakdown: { trial: 0, solo: 0, teams: 0 },
      });
      mockPrisma.user.groupBy.mockResolvedValue([]);
      mockPrisma.telemetryEvent.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/admin/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });

    it('should allow access for configured admin user IDs', async () => {
      process.env.ADMIN_USER_IDS = 'clerk-special-admin';

      const specialAdmin = {
        ...mockRegularUser,
        email: 'special@example.com',
        role: 'user',
      };

      mockAuth.mockResolvedValue({ userId: 'clerk-special-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(specialAdmin as any);
      mockUsageService.getAdminUsageStats.mockResolvedValue({
        topUsers: [],
        totalStats: {
          totalPrompts: 0,
          totalE2eRuns: 0,
          totalBytesOut: BigInt(0),
          totalUsers: 0,
        },
        planBreakdown: { trial: 0, solo: 0, teams: 0 },
      });
      mockPrisma.user.groupBy.mockResolvedValue([]);
      mockPrisma.telemetryEvent.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/admin/usage');
      const response = await GET(request);

      expect(response.status).toBe(200);

      delete process.env.ADMIN_USER_IDS;
    });
  });
});