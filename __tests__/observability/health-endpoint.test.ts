/**
 * Health Endpoint Tests
 *
 * Tests for the comprehensive health monitoring system including
 * database, storage, MCP services, and system resource checks.
 */

import { NextRequest } from 'next/server';
import { GET, HEAD } from '@/app/api/health/route';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  healthCheck: jest.fn(),
  prisma: {
    $queryRaw: jest.fn(),
  },
}));

jest.mock('@/services/metrics/collector', () => ({
  metricsCollector: {
    recordDatabaseQuery: jest.fn(),
    recordError: jest.fn(),
    recordStorageOperation: jest.fn(),
    recordMCPHealth: jest.fn(),
    recordSystemMetrics: jest.fn(),
    recordLatency: jest.fn(),
  },
}));

jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn()),
  addSpanAttributes: jest.fn(),
  getCurrentTraceId: jest.fn(() => 'test-trace-id'),
  SPAN_ATTRIBUTES: {
    OPERATION_TYPE: 'operation.type',
    ROUTE_PATH: 'route.path',
  },
}));

jest.mock('@/services/alerts/manager', () => ({
  alerts: {
    healthCheckFailed: jest.fn(),
    mcpServiceDown: jest.fn(),
  },
}));

const { healthCheck, prisma } = require('@/lib/db');
const { metricsCollector } = require('@/services/metrics/collector');
const { alerts } = require('@/services/alerts/manager');

describe('Health Endpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock file system operations
    const fs = require('fs');
    jest.spyOn(fs.promises, 'mkdir').mockImplementation();
    jest.spyOn(fs.promises, 'writeFile').mockImplementation();
    jest.spyOn(fs.promises, 'readFile').mockImplementation();
    jest.spyOn(fs.promises, 'unlink').mockImplementation();
  });

  describe('GET /api/health', () => {
    it('should return healthy status when all checks pass', async () => {
      // Mock successful health checks
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.status).toBe('ok');
      expect(data.checks).toHaveProperty('database');
      expect(data.checks).toHaveProperty('storage');
      expect(data.checks).toHaveProperty('mcp');
      expect(data.checks).toHaveProperty('system');
      expect(data.checks).toHaveProperty('api');

      // Verify metrics were recorded
      expect(metricsCollector.recordDatabaseQuery).toHaveBeenCalled();
      expect(metricsCollector.recordSystemMetrics).toHaveBeenCalled();
      expect(metricsCollector.recordLatency).toHaveBeenCalled();

      // Verify trace ID is included
      expect(response.headers.get('X-Trace-Id')).toBe('test-trace-id');
    });

    it('should return unhealthy status when database check fails', async () => {
      // Mock database failure
      healthCheck.mockRejectedValue(new Error('Database connection failed'));

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('unhealthy');
      expect(data.checks.database.status).toBe('error');
      expect(data.checks.database.error).toBe('Database connection failed');

      // Verify error was recorded and alert triggered
      expect(metricsCollector.recordError).toHaveBeenCalledWith(
        'database_health_check',
        expect.any(Error)
      );
      expect(alerts.healthCheckFailed).toHaveBeenCalledWith(
        'database',
        'Database connection failed'
      );
    });

    it('should handle MCP service failures gracefully', async () => {
      // Mock successful basic health checks
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      // Mock MCP service failure by mocking spawn
      const { spawn } = require('child_process');
      jest.spyOn(require('child_process'), 'spawn').mockImplementation(() => {
        const mockProcess = {
          on: jest.fn((event, callback) => {
            if (event === 'error') {
              callback(new Error('Service not found'));
            }
          }),
          stdout: { on: jest.fn() },
          kill: jest.fn(),
        };
        return mockProcess;
      });

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.checks.mcp.status).toBe('unhealthy');
      expect(alerts.mcpServiceDown).toHaveBeenCalled();
    });

    it('should include system resource information', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.system).toHaveProperty('memory');
      expect(data.checks.system).toHaveProperty('platform');
      expect(data.checks.system).toHaveProperty('nodeVersion');
      expect(data.checks.system).toHaveProperty('uptime');
      expect(data.checks.system).toHaveProperty('cpu');

      expect(data.checks.system.memory).toHaveProperty('used');
      expect(data.checks.system.memory).toHaveProperty('total');
    });

    it('should measure and report latency for each check', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.database).toHaveProperty('latency');
      expect(data.checks.storage).toHaveProperty('latency');
      expect(data.checks.mcp).toHaveProperty('latency');

      expect(typeof data.checks.database.latency).toBe('number');
      expect(data.checks.database.latency).toBeGreaterThanOrEqual(0);
    });

    it('should handle complete system failure gracefully', async () => {
      // Mock catastrophic failure
      healthCheck.mockRejectedValue(new Error('System failure'));

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(503);
      expect(data.status).toBe('error');
      expect(data.error).toBe('Health check failed');

      // Verify error metrics and alerts
      expect(metricsCollector.recordError).toHaveBeenCalled();
      expect(metricsCollector.recordLatency).toHaveBeenCalled();
    });
  });

  describe('HEAD /api/health', () => {
    it('should return 200 for healthy system without body', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const request = new NextRequest('http://localhost/api/health');
      const response = await HEAD(request);

      expect(response.status).toBe(200);
      expect(response.body).toBeNull();
      expect(response.headers.get('X-Response-Time')).toBeTruthy();
      expect(response.headers.get('X-Trace-Id')).toBe('test-trace-id');
    });

    it('should return 503 for unhealthy system', async () => {
      healthCheck.mockRejectedValue(new Error('Database down'));

      const request = new NextRequest('http://localhost/api/health');
      const response = await HEAD(request);

      expect(response.status).toBe(503);
      expect(response.body).toBeNull();
    });
  });

  describe('Database Connection Check', () => {
    it('should test database connection with query', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const request = new NextRequest('http://localhost/api/health');
      await GET(request);

      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('SELECT 1')])
      );
    });

    it('should handle database query failures', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockRejectedValue(new Error('Query failed'));

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.database.connections.status).toBe('error');
      expect(data.checks.database.connections.error).toBe('Query failed');
    });
  });

  describe('Storage Health Check', () => {
    it('should test file system operations', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const fs = require('fs');
      fs.promises.readFile.mockResolvedValue('health-check-test-data');

      const request = new NextRequest('http://localhost/api/health');
      await GET(request);

      expect(fs.promises.mkdir).toHaveBeenCalled();
      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(fs.promises.readFile).toHaveBeenCalled();
      expect(fs.promises.unlink).toHaveBeenCalled();
    });

    it('should handle storage failures and trigger alerts', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const fs = require('fs');
      fs.promises.writeFile.mockRejectedValue(new Error('Disk full'));

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.storage.status).toBe('error');
      expect(alerts.healthCheckFailed).toHaveBeenCalledWith('storage', 'Disk full');
    });
  });

  describe('MCP Service Health Check', () => {
    it('should check GitHub MCP service availability', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      // Mock successful MCP service
      const { spawn } = require('child_process');
      jest.spyOn(require('child_process'), 'spawn').mockImplementation(() => {
        const mockProcess = {
          on: jest.fn(),
          stdout: {
            on: jest.fn((event, callback) => {
              if (event === 'data') {
                callback(Buffer.from('GitHub MCP Server'));
              }
            }),
          },
          kill: jest.fn(),
        };
        return mockProcess;
      });

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.mcp.services.github.healthy).toBe(true);
    });

    it('should detect MCP service failures', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      // Mock failed MCP service
      const { spawn } = require('child_process');
      jest.spyOn(require('child_process'), 'spawn').mockImplementation(() => {
        const mockProcess = {
          on: jest.fn((event, callback) => {
            if (event === 'exit') {
              callback(1); // Exit with error
            }
          }),
          stdout: { on: jest.fn() },
          kill: jest.fn(),
        };
        return mockProcess;
      });

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data.checks.mcp.services.github.healthy).toBe(false);
      expect(alerts.mcpServiceDown).toHaveBeenCalledWith(
        'github',
        'GitHub MCP server not responding'
      );
    });
  });

  describe('Performance and Monitoring', () => {
    it('should include response time in headers', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);

      const responseTime = response.headers.get('X-Response-Time');
      expect(responseTime).toBeTruthy();
      expect(parseInt(responseTime!)).toBeGreaterThan(0);
    });

    it('should record comprehensive metrics', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const request = new NextRequest('http://localhost/api/health');
      await GET(request);

      // Verify all metric types were recorded
      expect(metricsCollector.recordDatabaseQuery).toHaveBeenCalled();
      expect(metricsCollector.recordStorageOperation).toHaveBeenCalled();
      expect(metricsCollector.recordMCPHealth).toHaveBeenCalled();
      expect(metricsCollector.recordSystemMetrics).toHaveBeenCalled();
      expect(metricsCollector.recordLatency).toHaveBeenCalled();
    });

    it('should include build and environment information', async () => {
      healthCheck.mockResolvedValue(true);
      prisma.$queryRaw.mockResolvedValue([{ health_check: 1 }]);

      const request = new NextRequest('http://localhost/api/health');
      const response = await GET(request);
      const data = await response.json();

      expect(data).toHaveProperty('commit');
      expect(data).toHaveProperty('version');
      expect(data).toHaveProperty('environment');
      expect(data).toHaveProperty('uptime');
      expect(data).toHaveProperty('time');
    });
  });
});