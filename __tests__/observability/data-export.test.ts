/**
 * Data Export Tests
 *
 * Tests for GDPR-compliant data export functionality including
 * complete user data retrieval, format conversion, and compliance measures.
 */

import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v1/account/data-export/route';

// Mock dependencies
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
    },
    project: {
      findMany: jest.fn(),
    },
    prompt: {
      findMany: jest.fn(),
    },
    modelRun: {
      findMany: jest.fn(),
    },
    feedback: {
      findMany: jest.fn(),
    },
    log: {
      findMany: jest.fn(),
    },
    snapshot: {
      findMany: jest.fn(),
    },
    telemetryEvent: {
      findMany: jest.fn(),
    },
    usageCounter: {
      findMany: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock('@/services/audit/logger', () => ({
  auditLogger: {
    logData: jest.fn(),
  },
}));

jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn()),
  addSpanAttributes: jest.fn(),
  SPAN_ATTRIBUTES: {
    OPERATION_TYPE: 'operation.type',
    USER_ID: 'user.id',
  },
}));

const { auth } = require('@clerk/nextjs/server');
const { prisma } = require('@/lib/db');
const { auditLogger } = require('@/services/audit/logger');

describe('Data Export API', () => {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'user',
    plan: 'solo',
    clerkId: 'clerk-123',
    allowTraining: false,
    metadata: {},
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-15'),
    billing: null,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication', async () => {
      auth.mockResolvedValue({ userId: null });

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });

    it('should require user to exist in database', async () => {
      auth.mockResolvedValue({ userId: 'clerk-123' });
      prisma.user.findFirst.mockResolvedValue(null);

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('User not found');
    });
  });

  describe('Data Collection', () => {
    beforeEach(() => {
      auth.mockResolvedValue({ userId: 'clerk-123' });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);
    });

    it('should collect complete user data', async () => {
      // Mock all data collections
      const mockProjects = [
        { id: 'proj-1', name: 'Test Project', ownerId: 'user-123', team: null },
      ];
      const mockPrompts = [
        { id: 'prompt-1', content: 'Test prompt', userId: 'user-123' },
      ];
      const mockModelRuns = [
        { id: 'run-1', userId: 'user-123', model: { name: 'gpt-4' } },
      ];

      prisma.project.findMany.mockResolvedValue(mockProjects);
      prisma.prompt.findMany.mockResolvedValue(mockPrompts);
      prisma.modelRun.findMany.mockResolvedValue(mockModelRuns);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue([]);
      prisma.snapshot.findMany.mockResolvedValue([]);
      prisma.telemetryEvent.findMany.mockResolvedValue([]);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();

      expect(data.success).toBe(true);
      expect(data.data).toHaveProperty('user');
      expect(data.data).toHaveProperty('projects');
      expect(data.data).toHaveProperty('prompts');
      expect(data.data).toHaveProperty('modelRuns');
      expect(data.data).toHaveProperty('metadata');

      // Verify user data (with clerkId removed for privacy)
      expect(data.data.user.id).toBe('user-123');
      expect(data.data.user.email).toBe('test@example.com');
      expect(data.data.user.clerkId).toBeUndefined();

      expect(data.data.projects).toEqual(mockProjects);
      expect(data.data.prompts).toEqual(mockPrompts);
    });

    it('should include export metadata', async () => {
      prisma.project.findMany.mockResolvedValue([]);
      prisma.prompt.findMany.mockResolvedValue([]);
      prisma.modelRun.findMany.mockResolvedValue([]);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue([]);
      prisma.snapshot.findMany.mockResolvedValue([]);
      prisma.telemetryEvent.findMany.mockResolvedValue([]);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.metadata).toMatchObject({
        exportedAt: expect.any(String),
        exportId: expect.any(String),
        format: 'json',
        userId: 'user-123',
        userEmail: 'test@example.com',
        exportType: 'complete',
        gdprCompliant: true,
        dataRetentionInfo: expect.any(Object),
      });

      expect(data.data.metadata.dataRetentionInfo).toMatchObject({
        telemetryEvents: expect.any(String),
        auditLogs: expect.any(String),
        snapshots: expect.any(String),
        prompts: expect.any(String),
        modelRuns: expect.any(String),
      });
    });

    it('should filter out sensitive data from logs', async () => {
      const mockLogs = [
        {
          id: 'log-1',
          action: 'test',
          metadata: {
            password: 'secret123',
            secretKey: 'hidden',
            normalData: 'visible',
          },
        },
      ];

      prisma.project.findMany.mockResolvedValue([]);
      prisma.prompt.findMany.mockResolvedValue([]);
      prisma.modelRun.findMany.mockResolvedValue([]);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue(mockLogs);
      prisma.snapshot.findMany.mockResolvedValue([]);
      prisma.telemetryEvent.findMany.mockResolvedValue([]);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);
      const data = await response.json();

      const exportedLog = data.data.logs[0];
      expect(exportedLog.metadata).not.toHaveProperty('password');
      expect(exportedLog.metadata).not.toHaveProperty('secretKey');
      expect(exportedLog.metadata).toHaveProperty('normalData', 'visible');
    });

    it('should sanitize snapshot storage references', async () => {
      const mockSnapshots = [
        {
          id: 'snap-1',
          snapshotName: 'Test Snapshot',
          storageRef: 's3://bucket/actual/file/path.zip',
          sizeBytes: BigInt(1024),
        },
      ];

      prisma.project.findMany.mockResolvedValue([]);
      prisma.prompt.findMany.mockResolvedValue([]);
      prisma.modelRun.findMany.mockResolvedValue([]);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue([]);
      prisma.snapshot.findMany.mockResolvedValue(mockSnapshots);
      prisma.telemetryEvent.findMany.mockResolvedValue([]);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);
      const data = await response.json();

      const exportedSnapshot = data.data.snapshots[0];
      expect(exportedSnapshot.storageRef).toBe('[Reference: s3://bucket/actual/file/path.zip]');
      expect(exportedSnapshot.snapshotName).toBe('Test Snapshot');
    });

    it('should respect telemetry retention period (90 days)', async () => {
      prisma.project.findMany.mockResolvedValue([]);
      prisma.prompt.findMany.mockResolvedValue([]);
      prisma.modelRun.findMany.mockResolvedValue([]);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue([]);
      prisma.snapshot.findMany.mockResolvedValue([]);
      prisma.telemetryEvent.findMany.mockResolvedValue([]);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      await GET(request);

      expect(prisma.telemetryEvent.findMany).toHaveBeenCalledWith({
        where: {
          OR: expect.any(Array),
          createdAt: {
            gte: expect.any(Date),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10000,
      });

      // Verify the date is approximately 90 days ago
      const call = prisma.telemetryEvent.findMany.mock.calls[0][0];
      const cutoffDate = call.where.createdAt.gte;
      const now = new Date();
      const daysDiff = (now.getTime() - cutoffDate.getTime()) / (1000 * 60 * 60 * 24);
      expect(daysDiff).toBeCloseTo(90, 1);
    });

    it('should handle audit logs table not existing', async () => {
      prisma.project.findMany.mockResolvedValue([]);
      prisma.prompt.findMany.mockResolvedValue([]);
      prisma.modelRun.findMany.mockResolvedValue([]);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue([]);
      prisma.snapshot.findMany.mockResolvedValue([]);
      prisma.telemetryEvent.findMany.mockResolvedValue([]);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockRejectedValue(new Error('Table does not exist'));

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.data.auditLogs).toEqual([]);
    });
  });

  describe('Format Support', () => {
    beforeEach(() => {
      auth.mockResolvedValue({ userId: 'clerk-123' });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      // Mock minimal data for format tests
      prisma.project.findMany.mockResolvedValue([]);
      prisma.prompt.findMany.mockResolvedValue([]);
      prisma.modelRun.findMany.mockResolvedValue([]);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue([]);
      prisma.snapshot.findMany.mockResolvedValue([]);
      prisma.telemetryEvent.findMany.mockResolvedValue([]);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);
    });

    it('should return JSON format by default', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.metadata.format).toBe('json');
    });

    it('should return CSV format when requested', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export?format=csv');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('text/csv');
      expect(response.headers.get('content-disposition')).toContain('attachment');
      expect(response.headers.get('content-disposition')).toContain('.csv');

      const csvData = await response.text();
      expect(csvData).toContain('USER INFORMATION');
      expect(csvData).toContain('ID,Email,Name,Role,Plan,Created At');
      expect(csvData).toContain(mockUser.email);
    });

    it('should return XML format when requested', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export?format=xml');
      const response = await GET(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toBe('application/xml');
      expect(response.headers.get('content-disposition')).toContain('attachment');
      expect(response.headers.get('content-disposition')).toContain('.xml');

      const xmlData = await response.text();
      expect(xmlData).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xmlData).toContain('<magiDataExport>');
      expect(xmlData).toContain('<user>');
      expect(xmlData).toContain(`<email>${mockUser.email}</email>`);
    });

    it('should include proper filename in content-disposition', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);

      const contentDisposition = response.headers.get('content-disposition');
      expect(contentDisposition).toContain('attachment');
      expect(contentDisposition).toContain('magi-data-export-');
      expect(contentDisposition).toContain('.json');
    });
  });

  describe('Audit Logging', () => {
    beforeEach(() => {
      auth.mockResolvedValue({ userId: 'clerk-123' });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      // Mock minimal data
      prisma.project.findMany.mockResolvedValue([{ id: 'proj-1' }]);
      prisma.prompt.findMany.mockResolvedValue([{ id: 'prompt-1' }]);
      prisma.modelRun.findMany.mockResolvedValue([]);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue([]);
      prisma.snapshot.findMany.mockResolvedValue([]);
      prisma.telemetryEvent.findMany.mockResolvedValue([{ id: 'event-1' }]);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);
    });

    it('should log data export request', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export?format=json');
      await GET(request);

      expect(auditLogger.logData).toHaveBeenCalledWith(
        'data.export',
        'user-123',
        expect.objectContaining({
          exportId: expect.any(String),
          format: 'json',
          includeDeleted: false,
          recordCounts: expect.objectContaining({
            projects: 1,
            prompts: 1,
            telemetryEvents: 1,
          }),
        })
      );
    });

    it('should include record counts in audit log', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      await GET(request);

      const auditCall = auditLogger.logData.mock.calls[0];
      const details = auditCall[2];

      expect(details.recordCounts).toMatchObject({
        projects: expect.any(Number),
        prompts: expect.any(Number),
        modelRuns: expect.any(Number),
        feedback: expect.any(Number),
        logs: expect.any(Number),
        snapshots: expect.any(Number),
        telemetryEvents: expect.any(Number),
        usageCounters: expect.any(Number),
        auditLogs: expect.any(Number),
      });
    });
  });

  describe('Query Parameters', () => {
    beforeEach(() => {
      auth.mockResolvedValue({ userId: 'clerk-123' });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      // Mock minimal data
      Array.from(['project', 'prompt', 'modelRun', 'feedback', 'log', 'snapshot', 'telemetryEvent', 'usageCounter', 'auditLog']).forEach(model => {
        prisma[model].findMany.mockResolvedValue([]);
      });
    });

    it('should handle includeDeleted parameter', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export?includeDeleted=true');
      await GET(request);

      expect(auditLogger.logData).toHaveBeenCalledWith(
        'data.export',
        'user-123',
        expect.objectContaining({
          includeDeleted: true,
        })
      );
    });

    it('should handle format parameter', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export?format=csv');
      await GET(request);

      expect(auditLogger.logData).toHaveBeenCalledWith(
        'data.export',
        'user-123',
        expect.objectContaining({
          format: 'csv',
        })
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      auth.mockResolvedValue({ userId: 'clerk-123' });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);
      prisma.project.findMany.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
      expect(data.error).toBe('Export failed');
      expect(data.message).toBe('Database connection failed');
    });

    it('should handle user data collection errors', async () => {
      auth.mockResolvedValue({ userId: 'clerk-123' });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockRejectedValue(new Error('User query failed'));

      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.success).toBe(false);
    });
  });

  describe('Data Privacy and Security', () => {
    beforeEach(() => {
      auth.mockResolvedValue({ userId: 'clerk-123' });
      prisma.user.findFirst.mockResolvedValue(mockUser);
      prisma.user.findUnique.mockResolvedValue(mockUser);

      // Mock data with sensitive information
      const sensitiveData = [
        {
          id: 'event-1',
          payload: {
            password: 'secret123',
            secretKey: 'hidden',
            apiKey: 'sensitive',
            normalData: 'visible',
          },
        },
      ];

      prisma.project.findMany.mockResolvedValue([]);
      prisma.prompt.findMany.mockResolvedValue([]);
      prisma.modelRun.findMany.mockResolvedValue([]);
      prisma.feedback.findMany.mockResolvedValue([]);
      prisma.log.findMany.mockResolvedValue([]);
      prisma.snapshot.findMany.mockResolvedValue([]);
      prisma.telemetryEvent.findMany.mockResolvedValue(sensitiveData);
      prisma.usageCounter.findMany.mockResolvedValue([]);
      prisma.auditLog.findMany.mockResolvedValue([]);
    });

    it('should remove sensitive fields from telemetry events', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);
      const data = await response.json();

      const telemetryEvent = data.data.telemetryEvents[0];
      expect(telemetryEvent.payload).not.toHaveProperty('password');
      expect(telemetryEvent.payload).not.toHaveProperty('secretKey');
      expect(telemetryEvent.payload).toHaveProperty('normalData', 'visible');
    });

    it('should exclude Clerk ID from user data', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.user.clerkId).toBeUndefined();
      expect(data.data.user.id).toBe('user-123');
      expect(data.data.user.email).toBe('test@example.com');
    });

    it('should include GDPR compliance information', async () => {
      const request = new NextRequest('http://localhost/api/v1/account/data-export');
      const response = await GET(request);
      const data = await response.json();

      expect(data.data.metadata.gdprCompliant).toBe(true);
      expect(data.data.metadata.dataRetentionInfo).toBeDefined();
      expect(data.data.metadata.exportType).toBe('complete');
    });
  });
});