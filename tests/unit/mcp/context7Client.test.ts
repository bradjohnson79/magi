import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { context7Client } from '@/lib/mcp/context7';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock AbortSignal.timeout
Object.defineProperty(AbortSignal, 'timeout', {
  value: vi.fn((timeout: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), timeout);
    return controller.signal;
  }),
  writable: true,
});

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    telemetryEvent: {
      create: vi.fn().mockResolvedValue({ id: '1' }),
    },
  },
}));

describe('Context7Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    process.env.CONTEXT7_ENDPOINTS = 'http://localhost:3001,http://localhost:8080';
    process.env.CONTEXT7_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('discover()', () => {
    it('should successfully discover tools from healthy endpoints', async () => {
      // Mock successful responses
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            tools: [
              { name: 'tool1', description: 'Test tool 1' },
              { name: 'tool2', description: 'Test tool 2' }
            ]
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(['tool3', 'tool4']),
        });

      const tools = await context7Client.discover();

      expect(tools).toHaveLength(4);
      expect(tools[0]).toEqual({
        name: 'tool1',
        description: 'Test tool 1',
        parameters: undefined,
        endpoint: 'http://localhost:3001'
      });
      expect(tools[2].name).toBe('tool3');
    });

    it('should handle endpoint failures gracefully', async () => {
      // First endpoint fails, second succeeds
      mockFetch
        .mockRejectedValueOnce(new Error('Connection refused'))
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(['tool1']),
        });

      const tools = await context7Client.discover();

      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('tool1');
    });

    it('should cache discovery results', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(['tool1']),
      });

      // First call
      const tools1 = await context7Client.discover();

      // Second call should use cache (no additional fetch)
      const tools2 = await context7Client.discover();

      expect(tools1).toEqual(tools2);
      expect(mockFetch).toHaveBeenCalledTimes(2); // Only called for initial discovery
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const tools = await context7Client.discover();

      expect(tools).toHaveLength(0);
    });
  });

  describe('callTool()', () => {
    beforeEach(() => {
      // Mock POST requests for tool calls
      mockFetch.mockImplementation((url, options) => {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ result: 'success', data: 'test output' }),
          });
        }
        // Default to tools endpoint for discovery
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(['tool1']),
        });
      });
    });

    it('should successfully call a tool', async () => {
      const result = await context7Client.callTool('test-tool', { param1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'success', data: 'test output' });
      expect(result.endpoint).toBe('http://localhost:3001');
      expect(result.latencyMs).toBeGreaterThan(0);
    });

    it('should handle tool call failures with retry', async () => {
      let callCount = 0;
      mockFetch.mockImplementation((url, options) => {
        callCount++;
        if (options?.method === 'POST') {
          if (callCount <= 2) {
            // First two calls fail
            return Promise.reject(new Error('Network error'));
          }
          // Third call succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ result: 'success after retry' }),
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(['tool1']),
        });
      });

      const result = await context7Client.callTool('test-tool', { param1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'success after retry' });
    });

    it('should return error when all endpoints fail', async () => {
      mockFetch.mockImplementation((url, options) => {
        if (options?.method === 'POST') {
          return Promise.reject(new Error('All endpoints down'));
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(['tool1']),
        });
      });

      const result = await context7Client.callTool('test-tool', { param1: 'value1' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('All endpoints down');
    });

    it('should handle timeout scenarios', async () => {
      mockFetch.mockImplementation((url, options) => {
        if (options?.method === 'POST') {
          // Simulate timeout by waiting longer than the timeout period
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({
                ok: true,
                json: () => Promise.resolve({ result: 'too late' }),
              });
            }, 10000); // 10 seconds, longer than typical timeout
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(['tool1']),
        });
      });

      const result = await context7Client.callTool('test-tool', { param1: 'value1' });

      // The test should complete quickly due to timeout handling
      expect(result.success).toBe(false);
    });

    it('should validate tool name', async () => {
      const result = await context7Client.callTool('', { param1: 'value1' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool name is required');
    });

    it('should handle HTTP error responses', async () => {
      mockFetch.mockImplementation((url, options) => {
        if (options?.method === 'POST') {
          return Promise.resolve({
            ok: false,
            status: 400,
            statusText: 'Bad Request',
          });
        }
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(['tool1']),
        });
      });

      const result = await context7Client.callTool('test-tool', { param1: 'value1' });

      expect(result.success).toBe(false);
    });
  });

  describe('healthCheck()', () => {
    it('should check health of all endpoints', async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
        });

      const health = await context7Client.healthCheck();

      expect(health).toHaveLength(2);
      expect(health[0].healthy).toBe(true);
      expect(health[0].endpoint).toBe('http://localhost:3001');
      expect(health[1].healthy).toBe(false);
      expect(health[1].endpoint).toBe('http://localhost:8080');
      expect(health[1].error).toBe('HTTP 500');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValue(new Error('ECONNREFUSED'));

      const health = await context7Client.healthCheck();

      expect(health).toHaveLength(2);
      expect(health[0].healthy).toBe(false);
      expect(health[0].error).toBe('ECONNREFUSED');
    });
  });

  describe('getAvailableTools()', () => {
    it('should return tool names from discovery', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          tools: [
            { name: 'tool1', description: 'Test tool 1' },
            { name: 'tool2', description: 'Test tool 2' }
          ]
        }),
      });

      const tools = await context7Client.getAvailableTools();

      expect(tools).toEqual(['tool1', 'tool2']);
    });
  });
});