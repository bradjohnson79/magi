/**
 * Metrics Collector Tests
 *
 * Tests for the comprehensive metrics collection system including
 * database queries, errors, latency, and system metrics.
 */

import { MetricsCollector } from '@/services/metrics/collector';
import { getCurrentTraceId, getCurrentSpanId } from '@/services/tracing/setup';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    telemetryEvent: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
  },
}));

jest.mock('@/services/tracing/setup', () => ({
  getCurrentTraceId: jest.fn(() => 'test-trace-id'),
  getCurrentSpanId: jest.fn(() => 'test-span-id'),
}));

const { prisma } = require('@/lib/db');

describe('MetricsCollector', () => {
  let collector: MetricsCollector;

  beforeEach(() => {
    jest.clearAllMocks();
    collector = new MetricsCollector();
  });

  describe('Database Metrics', () => {
    it('should record database query metrics', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordDatabaseQuery({
        operation: 'SELECT',
        table: 'users',
        duration: 45,
        rowCount: 5,
      });

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'database_query',
          data: {
            operation: 'SELECT',
            table: 'users',
            duration: 45,
            rowCount: 5,
          },
          metadata: expect.objectContaining({
            timestamp: expect.any(String),
            environment: process.env.NODE_ENV,
          }),
          traceId: 'test-trace-id',
          spanId: 'test-span-id',
        },
      });
    });

    it('should handle database query recording failures', async () => {
      prisma.telemetryEvent.create.mockRejectedValue(new Error('DB error'));

      // Should not throw
      await expect(collector.recordDatabaseQuery({
        operation: 'INSERT',
        table: 'logs',
        duration: 100,
      })).resolves.not.toThrow();
    });
  });

  describe('Error Metrics', () => {
    it('should record error with stack trace', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});
      const error = new Error('Test error');

      await collector.recordError('api_error', error);

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: {
          type: 'error',
          data: {
            category: 'api_error',
            message: 'Test error',
            stack: expect.any(String),
          },
          metadata: expect.objectContaining({
            timestamp: expect.any(String),
          }),
          traceId: 'test-trace-id',
          spanId: 'test-span-id',
        },
      });
    });

    it('should record error with custom context', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordError('validation_error', 'Invalid input', {
        userId: 'user-123',
        field: 'email',
      });

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: {
            category: 'validation_error',
            message: 'Invalid input',
            context: {
              userId: 'user-123',
              field: 'email',
            },
          },
        }),
      });
    });
  });

  describe('Latency Metrics', () => {
    it('should record latency with endpoint details', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordLatency('/api/users', 'GET', 150, 200);

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'latency',
          data: {
            endpoint: '/api/users',
            method: 'GET',
            duration: 150,
            statusCode: 200,
          },
        }),
      });
    });

    it('should record latency for failed requests', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordLatency('/api/auth', 'POST', 5000, 500);

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: {
            endpoint: '/api/auth',
            method: 'POST',
            duration: 5000,
            statusCode: 500,
          },
        }),
      });
    });
  });

  describe('Storage Operations', () => {
    it('should record storage operations', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordStorageOperation({
        operation: 'write',
        size: 1024,
        path: '/tmp/test.txt',
        duration: 25,
      });

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'storage_operation',
          data: {
            operation: 'write',
            size: 1024,
            path: '/tmp/test.txt',
            duration: 25,
          },
        }),
      });
    });
  });

  describe('MCP Health Metrics', () => {
    it('should record MCP service health', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordMCPHealth({
        service: 'github',
        healthy: true,
        responseTime: 100,
        version: '1.0.0',
      });

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'mcp_health',
          data: {
            service: 'github',
            healthy: true,
            responseTime: 100,
            version: '1.0.0',
          },
        }),
      });
    });

    it('should record MCP service failures', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordMCPHealth({
        service: 'filesystem',
        healthy: false,
        error: 'Connection timeout',
        responseTime: 5000,
      });

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: {
            service: 'filesystem',
            healthy: false,
            error: 'Connection timeout',
            responseTime: 5000,
          },
        }),
      });
    });
  });

  describe('System Metrics', () => {
    it('should record system resource metrics', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordSystemMetrics({
        cpu: 45.2,
        memory: 512,
        disk: 1024,
        uptime: 3600,
      });

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'system_metrics',
          data: {
            cpu: 45.2,
            memory: 512,
            disk: 1024,
            uptime: 3600,
          },
        }),
      });
    });
  });

  describe('Utility Functions', () => {
    it('should time function execution', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      const testFunction = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return 'test result';
      };

      const result = await collector.time('test_operation', testFunction);

      expect(result).toBe('test result');
      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'timing',
          data: expect.objectContaining({
            operation: 'test_operation',
            duration: expect.any(Number),
          }),
        }),
      });
    });

    it('should time function with custom context', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      const testFunction = () => Promise.resolve(42);

      const result = await collector.time(
        'calculation',
        testFunction,
        { complexity: 'simple' }
      );

      expect(result).toBe(42);
      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: expect.objectContaining({
            operation: 'calculation',
            context: { complexity: 'simple' },
          }),
        }),
      });
    });

    it('should handle timing failures gracefully', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      const failingFunction = () => {
        throw new Error('Function failed');
      };

      await expect(collector.time('failing_op', failingFunction))
        .rejects.toThrow('Function failed');

      // Should still record the timing with error
      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          data: expect.objectContaining({
            operation: 'failing_op',
            error: 'Function failed',
          }),
        }),
      });
    });
  });

  describe('Batch Operations', () => {
    it('should handle batch metric recording', async () => {
      prisma.telemetryEvent.createMany.mockResolvedValue({ count: 3 });

      const events = [
        { type: 'test1', data: { value: 1 } },
        { type: 'test2', data: { value: 2 } },
        { type: 'test3', data: { value: 3 } },
      ];

      await collector.recordBatch(events);

      expect(prisma.telemetryEvent.createMany).toHaveBeenCalledWith({
        data: events.map(event => ({
          type: event.type,
          data: event.data,
          metadata: expect.objectContaining({
            timestamp: expect.any(String),
          }),
          traceId: 'test-trace-id',
          spanId: 'test-span-id',
        })),
      });
    });
  });

  describe('Context Propagation', () => {
    it('should include trace context in all metrics', async () => {
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordDatabaseQuery({
        operation: 'SELECT',
        table: 'test',
        duration: 10,
      });

      expect(getCurrentTraceId).toHaveBeenCalled();
      expect(getCurrentSpanId).toHaveBeenCalled();
      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          traceId: 'test-trace-id',
          spanId: 'test-span-id',
        }),
      });
    });

    it('should handle missing trace context gracefully', async () => {
      (getCurrentTraceId as jest.Mock).mockReturnValue(undefined);
      (getCurrentSpanId as jest.Mock).mockReturnValue(undefined);
      prisma.telemetryEvent.create.mockResolvedValue({});

      await collector.recordError('test_error', 'Test message');

      expect(prisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          traceId: undefined,
          spanId: undefined,
        }),
      });
    });
  });
});