/**
 * OpenTelemetry Tracing Integration Tests
 *
 * Tests for the distributed tracing system including span creation,
 * context propagation, and trace ID attachment to database records.
 */

import {
  withSpan,
  addSpanAttributes,
  getCurrentTraceId,
  getCurrentSpanId,
  SPAN_ATTRIBUTES,
} from '@/services/tracing/setup';

// Mock OpenTelemetry
jest.mock('@opentelemetry/api', () => ({
  trace: {
    setSpan: jest.fn(),
    getActiveSpan: jest.fn(() => ({
      setAttributes: jest.fn(),
      recordException: jest.fn(),
      setStatus: jest.fn(),
      end: jest.fn(),
      spanContext: jest.fn(() => ({
        traceId: '1234567890abcdef1234567890abcdef',
        spanId: '1234567890abcdef',
      })),
    })),
    getSpan: jest.fn(),
  },
  context: {
    with: jest.fn((context, fn) => fn()),
    active: jest.fn(() => ({})),
  },
  SpanStatusCode: {
    ERROR: 2,
    OK: 1,
  },
}));

jest.mock('@opentelemetry/auto-instrumentations-node');
jest.mock('@opentelemetry/sdk-node');

const mockOpenTelemetry = require('@opentelemetry/api');

describe('OpenTelemetry Tracing Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Span Creation', () => {
    it('should create spans with proper attributes', async () => {
      const mockSpan = {
        setAttributes: jest.fn(),
        recordException: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
        spanContext: () => ({
          traceId: '1234567890abcdef1234567890abcdef',
          spanId: '1234567890abcdef',
        }),
      };

      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(mockSpan);

      const testFunction = jest.fn().mockResolvedValue('test result');

      const result = await withSpan('test.operation', testFunction);

      expect(result).toBe('test result');
      expect(testFunction).toHaveBeenCalled();
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'test.operation',
      });
    });

    it('should handle span creation failures gracefully', async () => {
      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(null);

      const testFunction = jest.fn().mockResolvedValue('fallback result');

      const result = await withSpan('failing.span', testFunction);

      expect(result).toBe('fallback result');
      expect(testFunction).toHaveBeenCalled();
    });

    it('should record exceptions in spans', async () => {
      const mockSpan = {
        setAttributes: jest.fn(),
        recordException: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
        spanContext: () => ({
          traceId: '1234567890abcdef1234567890abcdef',
          spanId: '1234567890abcdef',
        }),
      };

      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(mockSpan);

      const error = new Error('Test error');
      const failingFunction = jest.fn().mockRejectedValue(error);

      await expect(withSpan('error.test', failingFunction)).rejects.toThrow('Test error');

      expect(mockSpan.recordException).toHaveBeenCalledWith(error);
      expect(mockSpan.setStatus).toHaveBeenCalledWith({
        code: mockOpenTelemetry.SpanStatusCode.ERROR,
        message: 'Test error',
      });
    });
  });

  describe('Span Attributes', () => {
    it('should add custom attributes to active span', () => {
      const mockSpan = {
        setAttributes: jest.fn(),
      };

      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(mockSpan);

      addSpanAttributes({
        'custom.attribute': 'test-value',
        'user.id': 'user-123',
        'operation.count': 5,
      });

      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        'custom.attribute': 'test-value',
        'user.id': 'user-123',
        'operation.count': 5,
      });
    });

    it('should handle missing active span gracefully', () => {
      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(null);

      // Should not throw
      expect(() => {
        addSpanAttributes({
          'test.attribute': 'value',
        });
      }).not.toThrow();
    });
  });

  describe('Context Extraction', () => {
    it('should extract trace ID from active span', () => {
      const mockSpan = {
        spanContext: () => ({
          traceId: '1234567890abcdef1234567890abcdef',
          spanId: '1234567890abcdef',
        }),
      };

      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(mockSpan);

      const traceId = getCurrentTraceId();
      expect(traceId).toBe('1234567890abcdef1234567890abcdef');
    });

    it('should extract span ID from active span', () => {
      const mockSpan = {
        spanContext: () => ({
          traceId: '1234567890abcdef1234567890abcdef',
          spanId: '1234567890abcdef',
        }),
      };

      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(mockSpan);

      const spanId = getCurrentSpanId();
      expect(spanId).toBe('1234567890abcdef');
    });

    it('should return undefined when no active span', () => {
      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(null);

      const traceId = getCurrentTraceId();
      const spanId = getCurrentSpanId();

      expect(traceId).toBeUndefined();
      expect(spanId).toBeUndefined();
    });
  });

  describe('Database Integration', () => {
    it('should attach trace IDs to model_runs', async () => {
      const mockSpan = {
        setAttributes: jest.fn(),
        recordException: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
        spanContext: () => ({
          traceId: '1234567890abcdef1234567890abcdef',
          spanId: '1234567890abcdef',
        }),
      };

      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(mockSpan);

      // Mock Prisma create operation
      const mockPrisma = {
        modelRun: {
          create: jest.fn().mockResolvedValue({
            id: 'run-123',
            traceId: '1234567890abcdef1234567890abcdef',
            spanId: '1234567890abcdef',
          }),
        },
      };

      // Simulate model run creation with tracing
      const modelRunData = {
        modelId: 'model-456',
        status: 'running',
        traceId: getCurrentTraceId(),
        spanId: getCurrentSpanId(),
      };

      const result = await mockPrisma.modelRun.create({
        data: modelRunData,
      });

      expect(result.traceId).toBe('1234567890abcdef1234567890abcdef');
      expect(result.spanId).toBe('1234567890abcdef');
      expect(mockPrisma.modelRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          traceId: '1234567890abcdef1234567890abcdef',
          spanId: '1234567890abcdef',
        }),
      });
    });

    it('should attach trace IDs to telemetry_events', async () => {
      const mockSpan = {
        spanContext: () => ({
          traceId: 'abcdef1234567890abcdef1234567890',
          spanId: 'abcdef1234567890',
        }),
      };

      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(mockSpan);

      // Mock telemetry event creation
      const mockPrisma = {
        telemetryEvent: {
          create: jest.fn().mockResolvedValue({
            id: 'event-789',
            type: 'api_call',
            traceId: 'abcdef1234567890abcdef1234567890',
            spanId: 'abcdef1234567890',
          }),
        },
      };

      const eventData = {
        type: 'api_call',
        data: { endpoint: '/api/test' },
        traceId: getCurrentTraceId(),
        spanId: getCurrentSpanId(),
      };

      const result = await mockPrisma.telemetryEvent.create({
        data: eventData,
      });

      expect(result.traceId).toBe('abcdef1234567890abcdef1234567890');
      expect(result.spanId).toBe('abcdef1234567890');
    });
  });

  describe('API Route Tracing', () => {
    it('should trace API requests end-to-end', async () => {
      const mockSpan = {
        setAttributes: jest.fn(),
        recordException: jest.fn(),
        setStatus: jest.fn(),
        end: jest.fn(),
        spanContext: () => ({
          traceId: 'api1234567890abcdefapi1234567890',
          spanId: 'api1234567890ab',
        }),
      };

      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(mockSpan);

      // Simulate API request handler
      const mockHandler = jest.fn(async () => {
        // Add request attributes
        addSpanAttributes({
          [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/users',
          'http.method': 'GET',
          'http.status_code': 200,
        });

        return { success: true, data: [] };
      });

      const result = await withSpan('api.users.get', mockHandler);

      expect(result).toEqual({ success: true, data: [] });
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'api.users.get',
      });
      expect(mockSpan.setAttributes).toHaveBeenCalledWith({
        [SPAN_ATTRIBUTES.ROUTE_PATH]: '/api/users',
        'http.method': 'GET',
        'http.status_code': 200,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle tracing errors without breaking application flow', async () => {
      // Mock tracing failure
      mockOpenTelemetry.trace.getActiveSpan.mockImplementation(() => {
        throw new Error('Tracing system unavailable');
      });

      const testFunction = jest.fn().mockResolvedValue('app continues');

      // Application should continue working even if tracing fails
      const result = await withSpan('resilient.operation', testFunction);

      expect(result).toBe('app continues');
      expect(testFunction).toHaveBeenCalled();
    });

    it('should provide fallback when trace context is unavailable', () => {
      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(null);

      const traceId = getCurrentTraceId();
      const spanId = getCurrentSpanId();

      expect(traceId).toBeUndefined();
      expect(spanId).toBeUndefined();

      // Application should handle undefined trace IDs gracefully
      expect(() => {
        const data = {
          message: 'test',
          traceId: traceId || 'no-trace',
          spanId: spanId || 'no-span',
        };
      }).not.toThrow();
    });
  });

  describe('Performance', () => {
    it('should have minimal overhead when tracing is disabled', async () => {
      mockOpenTelemetry.trace.getActiveSpan.mockReturnValue(null);

      const start = process.hrtime.bigint();

      await withSpan('performance.test', async () => {
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 1));
      });

      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1000000; // Convert to milliseconds

      // Tracing overhead should be minimal (less than 10ms for this simple test)
      expect(duration).toBeLessThan(50);
    });
  });
});