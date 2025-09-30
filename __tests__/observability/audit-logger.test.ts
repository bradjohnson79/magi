/**
 * Audit Logger Tests
 *
 * Tests for the comprehensive audit logging system including
 * log creation, retrieval, statistics, and cleanup functionality.
 */

import { auditLogger, AuditLogger } from '@/services/audit/logger';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      deleteMany: jest.fn(),
    },
  },
}));

jest.mock('@/services/tracing/setup', () => ({
  getCurrentTraceId: jest.fn(() => 'test-trace-id'),
  getCurrentSpanId: jest.fn(() => 'test-span-id'),
}));

const { prisma } = require('@/lib/db');

describe('Audit Logger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    jest.clearAllMocks();
    logger = new AuditLogger();
  });

  describe('Basic Logging', () => {
    it('should log a basic audit entry', async () => {
      prisma.auditLog.create.mockResolvedValue({
        id: 'test-id',
        action: 'user.login',
        createdAt: new Date(),
      });

      await logger.log({
        userId: 'user-123',
        action: 'user.login',
        resource: 'auth',
        details: { method: 'email' },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          userId: 'user-123',
          action: 'user.login',
          resource: 'auth',
          resourceId: undefined,
          details: { method: 'email' },
          metadata: expect.objectContaining({
            timestamp: expect.any(String),
            environment: process.env.NODE_ENV,
            platform: 'magi',
          }),
          ipAddress: undefined,
          userAgent: undefined,
          traceId: 'test-trace-id',
          spanId: 'test-span-id',
          severity: 'info',
          outcome: 'success',
        },
      });
    });

    it('should include tracing information in audit logs', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.log({
        action: 'system.startup',
        resource: 'system',
      }, {
        traceId: 'custom-trace-id',
        spanId: 'custom-span-id',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          traceId: 'custom-trace-id',
          spanId: 'custom-span-id',
        }),
      });
    });

    it('should handle audit logging failures gracefully', async () => {
      prisma.auditLog.create.mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(logger.log({
        action: 'test.action',
      })).resolves.not.toThrow();

      expect(prisma.auditLog.create).toHaveBeenCalled();
    });
  });

  describe('Authentication Logging', () => {
    it('should log successful login', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logAuth('auth.login', 'user-123', { method: 'email' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'user-123',
          action: 'auth.login',
          resource: 'auth',
          severity: 'info',
          outcome: 'success',
          details: { method: 'email' },
        }),
      });
    });

    it('should log failed login with warning severity', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logAuth('auth.login_failed', 'user-123', { reason: 'invalid_password' });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'auth.login_failed',
          severity: 'warning',
          outcome: 'failure',
        }),
      });
    });
  });

  describe('User Management Logging', () => {
    it('should log user creation', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logUser('user.created', 'admin-123', 'new-user-456', {
        email: 'new@example.com',
        plan: 'trial',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin-123',
          action: 'user.created',
          resource: 'user',
          resourceId: 'new-user-456',
          details: {
            email: 'new@example.com',
            plan: 'trial',
          },
        }),
      });
    });

    it('should log user deletion with warning severity', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logUser('user.deleted', 'admin-123', 'deleted-user-456');

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'user.deleted',
          severity: 'warning',
        }),
      });
    });
  });

  describe('Security Logging', () => {
    it('should log security events with error severity', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logSecurity('security.access_denied', 'user-123', {
        resource: 'admin_panel',
        reason: 'insufficient_privileges',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'security.access_denied',
          resource: 'auth',
          severity: 'error',
          outcome: 'failure',
        }),
      });
    });
  });

  describe('Administrative Logging', () => {
    it('should log admin actions with warning severity', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logAdmin('admin.user_impersonation', 'admin-123', 'target-user-456', {
        reason: 'support_request',
        ticketId: 'TICKET-789',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: 'admin-123',
          action: 'admin.user_impersonation',
          resource: 'admin',
          resourceId: 'target-user-456',
          severity: 'warning',
        }),
      });
    });
  });

  describe('System Logging', () => {
    it('should log system events', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logSystem('system.startup', {
        version: '1.0.0',
        environment: 'production',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'system.startup',
          resource: 'system',
          severity: 'info',
          outcome: 'success',
        }),
      });
    });

    it('should log system failures with error severity', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logSystem('system.health_check_failed', {
        component: 'database',
        error: 'Connection timeout',
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'system.health_check_failed',
          severity: 'error',
          outcome: 'failure',
        }),
      });
    });
  });

  describe('Data Operations Logging', () => {
    it('should log data export with warning severity', async () => {
      prisma.auditLog.create.mockResolvedValue({});

      await logger.logData('data.export', 'user-123', {
        format: 'json',
        recordCount: 1500,
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'data.export',
          resource: 'data',
          severity: 'warning',
        }),
      });
    });
  });

  describe('Log Retrieval', () => {
    it('should retrieve audit logs with pagination', async () => {
      const mockLogs = [
        { id: '1', action: 'user.login', createdAt: new Date() },
        { id: '2', action: 'user.logout', createdAt: new Date() },
      ];

      prisma.auditLog.findMany.mockResolvedValue(mockLogs);
      prisma.auditLog.count.mockResolvedValue(150);

      const result = await logger.getLogs({
        limit: 10,
        offset: 20,
      });

      expect(result).toEqual({
        logs: mockLogs,
        total: 150,
        limit: 10,
        offset: 20,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {},
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        skip: 20,
      });
    });

    it('should filter logs by user ID', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await logger.getLogs({
        userId: 'user-123',
        action: 'login',
        severity: 'warning',
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'user-123',
          action: { contains: 'login', mode: 'insensitive' },
          severity: 'warning',
        },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('should filter logs by date range', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      const startDate = new Date('2024-01-01');
      const endDate = new Date('2024-01-31');

      await logger.getLogs({
        startDate,
        endDate,
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lte: endDate,
          },
        },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });

    it('should filter logs by trace ID', async () => {
      prisma.auditLog.findMany.mockResolvedValue([]);
      prisma.auditLog.count.mockResolvedValue(0);

      await logger.getLogs({
        traceId: 'trace-123',
      });

      expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          traceId: 'trace-123',
        },
        include: expect.any(Object),
        orderBy: { createdAt: 'desc' },
        take: 50,
        skip: 0,
      });
    });
  });

  describe('Statistics', () => {
    it('should generate audit statistics', async () => {
      prisma.auditLog.count.mockResolvedValue(1000);
      prisma.auditLog.groupBy.mockImplementation(({ by }) => {
        if (by.includes('action')) {
          return Promise.resolve([
            { action: 'user.login', _count: { action: 500 } },
            { action: 'user.logout', _count: { action: 300 } },
          ]);
        }
        if (by.includes('severity')) {
          return Promise.resolve([
            { severity: 'info', _count: { severity: 800 } },
            { severity: 'warning', _count: { severity: 150 } },
            { severity: 'error', _count: { severity: 50 } },
          ]);
        }
        if (by.includes('outcome')) {
          return Promise.resolve([
            { outcome: 'success', _count: { outcome: 900 } },
            { outcome: 'failure', _count: { outcome: 100 } },
          ]);
        }
        if (by.includes('resource')) {
          return Promise.resolve([
            { resource: 'auth', _count: { resource: 600 } },
            { resource: 'user', _count: { resource: 200 } },
          ]);
        }
        return Promise.resolve([]);
      });

      const stats = await logger.getStats();

      expect(stats).toEqual({
        total: 1000,
        byAction: [
          { action: 'user.login', count: 500 },
          { action: 'user.logout', count: 300 },
        ],
        bySeverity: [
          { severity: 'info', count: 800 },
          { severity: 'warning', count: 150 },
          { severity: 'error', count: 50 },
        ],
        byOutcome: [
          { outcome: 'success', count: 900 },
          { outcome: 'failure', count: 100 },
        ],
        byResource: [
          { resource: 'auth', count: 600 },
          { resource: 'user', count: 200 },
        ],
      });
    });
  });

  describe('Cleanup', () => {
    it('should clean up old audit logs', async () => {
      prisma.auditLog.deleteMany.mockResolvedValue({ count: 500 });
      prisma.auditLog.create.mockResolvedValue({});

      const deletedCount = await logger.cleanup(365);

      expect(deletedCount).toBe(500);
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

      // Should log the cleanup
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'system.audit_cleanup',
          details: expect.objectContaining({
            deletedCount: 500,
            daysToKeep: 365,
          }),
        }),
      });
    });

    it('should not clean up critical audit logs', async () => {
      await logger.cleanup(30);

      expect(prisma.auditLog.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          severity: {
            not: 'critical',
          },
        }),
      });
    });
  });

  describe('Context Extraction', () => {
    it('should extract context from request', () => {
      const mockRequest = {
        ip: '192.168.1.100',
        headers: {
          'x-forwarded-for': '203.0.113.195',
          'user-agent': 'Mozilla/5.0 (test browser)',
        },
      };

      const { audit } = require('@/services/audit/logger');
      const context = audit.contextFromRequest(mockRequest);

      expect(context).toEqual({
        ipAddress: '203.0.113.195', // Should prefer x-forwarded-for
        userAgent: 'Mozilla/5.0 (test browser)',
      });
    });

    it('should handle missing headers gracefully', () => {
      const mockRequest = {
        headers: {},
      };

      const { audit } = require('@/services/audit/logger');
      const context = audit.contextFromRequest(mockRequest);

      expect(context).toEqual({
        ipAddress: undefined,
        userAgent: undefined,
      });
    });
  });
});