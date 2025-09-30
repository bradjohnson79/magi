/**
 * Usage Middleware Tests
 *
 * Tests for usage tracking middleware and plan enforcement.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withUsageTracking, usageMiddleware } from '@/lib/middleware/usage';
import { usageTrackingService } from '@/lib/usage/tracking';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';

// Mock dependencies
jest.mock('@clerk/nextjs/server');
jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
    },
  },
}));
jest.mock('@/lib/usage/tracking', () => ({
  usageTrackingService: {
    checkFeatureAllowed: jest.fn(),
    checkUsageAllowed: jest.fn(),
    incrementUsage: jest.fn(),
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;
const mockUsageService = usageTrackingService as jest.Mocked<typeof usageTrackingService>;

describe('Usage Middleware', () => {
  const mockUser = {
    id: 'user-1',
    plan: 'trial',
    role: 'user',
    email: 'test@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('withUsageTracking', () => {
    it('should reject unauthenticated requests', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const handler = jest.fn();
      const wrappedHandler = withUsageTracking(handler);

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(401);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should reject requests for non-existent users', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(null);

      const handler = jest.fn();
      const wrappedHandler = withUsageTracking(handler);

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(404);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should allow admin bypass', async () => {
      const adminUser = { ...mockUser, role: 'admin' };
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue(adminUser as any);

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withUsageTracking(handler, { adminBypass: true });

      const request = new NextRequest('http://localhost/api/test');
      await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          userId: 'user-1',
          user: adminUser,
          usage: { allowed: true, reason: 'Admin bypass' },
        })
      );
    });

    it('should reject requests for unavailable features', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkFeatureAllowed.mockResolvedValue({
        allowed: false,
        reason: 'Feature not available on current plan',
        planRequired: 'solo',
      });

      const handler = jest.fn();
      const wrappedHandler = withUsageTracking(handler, { requireFeature: 'gitExport' });

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Feature not available');
      expect(data.planRequired).toBe('solo');
      expect(handler).not.toHaveBeenCalled();
    });

    it('should enforce hard limits for trial users', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkUsageAllowed.mockResolvedValue({
        allowed: false,
        reason: 'Hard limit exceeded',
        currentUsage: 30,
        limit: 30,
        isHardLimit: true,
      });

      const handler = jest.fn();
      const wrappedHandler = withUsageTracking(handler, { trackPrompts: true });

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(429);
      const data = await response.json();
      expect(data.error).toBe('Usage limit exceeded');
      expect(data.currentUsage).toBe(30);
      expect(data.limit).toBe(30);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should warn but allow soft limits for paid users', async () => {
      const soloUser = { ...mockUser, plan: 'solo' };
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(soloUser as any);
      mockUsageService.checkUsageAllowed.mockResolvedValue({
        allowed: false,
        reason: 'Soft limit exceeded',
        currentUsage: 10001,
        limit: 10000,
        isHardLimit: false,
      });

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withUsageTracking(handler, { trackPrompts: true });

      const request = new NextRequest('http://localhost/api/test');
      await wrappedHandler(request);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Soft limit exceeded for user user-1')
      );
      expect(handler).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should track usage after successful requests', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkUsageAllowed.mockResolvedValue({ allowed: true });
      mockUsageService.incrementUsage.mockResolvedValue({} as any);

      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ data: 'test response data' })
      );
      const wrappedHandler = withUsageTracking(handler, {
        trackPrompts: true,
        trackBytesOut: true,
      });

      const request = new NextRequest('http://localhost/api/test', { method: 'POST' });
      await wrappedHandler(request);

      expect(mockUsageService.incrementUsage).toHaveBeenCalledWith(
        'user-1',
        {
          prompts: 1,
          bytesOut: expect.any(Number),
        },
        expect.objectContaining({
          endpoint: '/api/test',
          method: 'POST',
        })
      );
    });

    it('should not track usage for failed requests', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkUsageAllowed.mockResolvedValue({ allowed: true });

      const handler = jest.fn().mockResolvedValue(
        NextResponse.json({ error: 'Bad request' }, { status: 400 })
      );
      const wrappedHandler = withUsageTracking(handler, { trackPrompts: true });

      const request = new NextRequest('http://localhost/api/test');
      await wrappedHandler(request);

      expect(mockUsageService.incrementUsage).not.toHaveBeenCalled();
    });

    it('should handle tracking errors gracefully', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkUsageAllowed.mockResolvedValue({ allowed: true });
      mockUsageService.incrementUsage.mockRejectedValue(new Error('Tracking failed'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withUsageTracking(handler, { trackPrompts: true });

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(200); // Should not affect response
      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to track post-request usage:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('usageMiddleware factories', () => {
    it('should configure prompts middleware correctly', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkUsageAllowed.mockResolvedValue({ allowed: true });
      mockUsageService.incrementUsage.mockResolvedValue({} as any);

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = usageMiddleware.prompts(handler);

      const request = new NextRequest('http://localhost/api/prompts', { method: 'POST' });
      await wrappedHandler(request);

      expect(mockUsageService.checkUsageAllowed).toHaveBeenCalledWith('user-1', 'prompts');
      expect(mockUsageService.incrementUsage).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          prompts: 1,
          bytesOut: expect.any(Number),
        }),
        expect.any(Object)
      );
    });

    it('should configure e2eRuns middleware correctly', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkUsageAllowed.mockResolvedValue({ allowed: true });
      mockUsageService.incrementUsage.mockResolvedValue({} as any);

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = usageMiddleware.e2eRuns(handler);

      const request = new NextRequest('http://localhost/api/e2e');
      await wrappedHandler(request);

      expect(mockUsageService.checkUsageAllowed).toHaveBeenCalledWith('user-1', 'e2eRuns');
    });

    it('should configure gitExport middleware correctly', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkFeatureAllowed.mockResolvedValue({ allowed: true });
      mockUsageService.incrementUsage.mockResolvedValue({} as any);

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = usageMiddleware.gitExport(handler);

      const request = new NextRequest('http://localhost/api/export');
      await wrappedHandler(request);

      expect(mockUsageService.checkFeatureAllowed).toHaveBeenCalledWith('user-1', 'gitExport');
    });

    it('should configure multiUser middleware correctly', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkFeatureAllowed.mockResolvedValue({ allowed: true });

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = usageMiddleware.multiUser(handler);

      const request = new NextRequest('http://localhost/api/teams');
      await wrappedHandler(request);

      expect(mockUsageService.checkFeatureAllowed).toHaveBeenCalledWith('user-1', 'multiUser');
    });

    it('should configure snapshots middleware correctly', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkFeatureAllowed.mockResolvedValue({ allowed: true });
      mockUsageService.incrementUsage.mockResolvedValue({} as any);

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = usageMiddleware.snapshots(handler);

      const request = new NextRequest('http://localhost/api/snapshots');
      await wrappedHandler(request);

      expect(mockUsageService.checkFeatureAllowed).toHaveBeenCalledWith(
        'user-1',
        'activeProjectSnapshots'
      );
    });

    it('should configure admin middleware correctly', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-admin' });
      mockPrisma.user.findFirst.mockResolvedValue({ ...mockUser, role: 'admin' } as any);

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = usageMiddleware.admin(handler);

      const request = new NextRequest('http://localhost/api/admin');
      await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          usage: { allowed: true, reason: 'Admin bypass' },
        })
      );
      expect(mockUsageService.checkUsageAllowed).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle auth errors gracefully', async () => {
      mockAuth.mockRejectedValue(new Error('Auth failed'));

      const handler = jest.fn();
      const wrappedHandler = withUsageTracking(handler);

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(500);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle database errors gracefully', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockRejectedValue(new Error('Database error'));

      const handler = jest.fn();
      const wrappedHandler = withUsageTracking(handler);

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(500);
      expect(handler).not.toHaveBeenCalled();
    });

    it('should handle usage check errors gracefully', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkUsageAllowed.mockRejectedValue(new Error('Usage check failed'));

      const handler = jest.fn();
      const wrappedHandler = withUsageTracking(handler, { trackPrompts: true });

      const request = new NextRequest('http://localhost/api/test');
      const response = await wrappedHandler(request);

      expect(response.status).toBe(500);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  describe('context object', () => {
    it('should provide complete context to handlers', async () => {
      mockAuth.mockResolvedValue({ userId: 'clerk-1' });
      mockPrisma.user.findFirst.mockResolvedValue(mockUser as any);
      mockUsageService.checkUsageAllowed.mockResolvedValue({
        allowed: true,
        currentUsage: 15,
        limit: 30,
        isHardLimit: true,
      });

      const handler = jest.fn().mockResolvedValue(NextResponse.json({ success: true }));
      const wrappedHandler = withUsageTracking(handler, { trackPrompts: true });

      const request = new NextRequest('http://localhost/api/test');
      await wrappedHandler(request);

      expect(handler).toHaveBeenCalledWith(
        request,
        expect.objectContaining({
          userId: 'user-1',
          user: mockUser,
          usage: {
            allowed: true,
            currentUsage: 15,
            limit: 30,
            isHardLimit: true,
          },
        })
      );
    });
  });
});