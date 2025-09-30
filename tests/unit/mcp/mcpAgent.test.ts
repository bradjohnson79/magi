import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MCPAgent } from '@/services/agents/mcpAgent';

// Mock the Context7 client
const mockContext7Client = {
  discover: vi.fn(),
  callTool: vi.fn(),
  healthCheck: vi.fn(),
  getAvailableTools: vi.fn(),
};

vi.mock('@/lib/mcp/context7', () => ({
  context7Client: mockContext7Client,
}));

// Mock secret redaction
vi.mock('@/lib/utils/secretRedaction', () => ({
  redactSecretsFromObject: vi.fn((obj) => ({ ...obj, redacted: true })),
}));

describe('MCPAgent', () => {
  let agent: MCPAgent;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    process.env.MCP_ENABLED = 'true';

    agent = new MCPAgent();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  describe('run()', () => {
    it('should successfully execute a tool', async () => {
      mockContext7Client.callTool.mockResolvedValue({
        success: true,
        output: { result: 'test output' },
        endpoint: 'http://localhost:3001',
        latencyMs: 150,
      });

      const result = await agent.run('test-tool', { param1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ result: 'test output', redacted: true });
      expect(result.logs).toContain(expect.stringContaining('Starting MCP tool execution: test-tool'));
      expect(result.logs).toContain(expect.stringContaining('Tool execution successful'));
      expect(result.metadata?.tool).toBe('test-tool');
      expect(result.metadata?.endpoint).toBe('http://localhost:3001');
    });

    it('should handle tool execution failures', async () => {
      mockContext7Client.callTool.mockResolvedValue({
        success: false,
        error: 'Tool not found',
        endpoint: 'http://localhost:3001',
        latencyMs: 50,
      });

      const result = await agent.run('non-existent-tool', { param1: 'value1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool not found');
      expect(result.logs).toContain(expect.stringContaining('Tool execution failed: Tool not found'));
      expect(result.metadata?.tool).toBe('non-existent-tool');
    });

    it('should validate tool name', async () => {
      const result = await agent.run('', { param1: 'value1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Tool name must be a non-empty string');
      expect(result.metadata?.validationErrors).toContain('Tool name must be a non-empty string');
    });

    it('should validate input when validation is enabled', async () => {
      const result = await agent.run('test-tool', null as any, { validateInput: true });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Input validation failed');
      expect(result.metadata?.validationErrors).toContain('Input cannot be null or undefined');
    });

    it('should handle timeout scenarios', async () => {
      mockContext7Client.callTool.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              success: true,
              output: { result: 'too late' },
            });
          }, 2000); // 2 seconds
        });
      });

      const result = await agent.run('slow-tool', { param1: 'value1' }, { timeout: 100 });

      expect(result.success).toBe(false);
      expect(result.error).toContain('timed out');
    });

    it('should provide fallback response when MCP is disabled', async () => {
      process.env.MCP_ENABLED = 'false';
      const disabledAgent = new MCPAgent();

      const result = await disabledAgent.run('test-tool', { param1: 'value1' });

      expect(result.success).toBe(true);
      expect(result.output.fallback).toBe(true);
      expect(result.output.message).toContain('MCP is disabled');
      expect(result.logs).toContain(expect.stringContaining('MCP is disabled, falling back to mock response'));
    });

    it('should handle unexpected errors', async () => {
      mockContext7Client.callTool.mockRejectedValue(new Error('Unexpected network error'));

      const result = await agent.run('test-tool', { param1: 'value1' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Unexpected network error');
      expect(result.logs).toContain(expect.stringContaining('Unexpected error during tool execution'));
    });

    it('should skip validation when disabled', async () => {
      mockContext7Client.callTool.mockResolvedValue({
        success: true,
        output: { result: 'success' },
      });

      const result = await agent.run('test-tool', null as any, { validateInput: false });

      expect(result.success).toBe(true);
      expect(mockContext7Client.callTool).toHaveBeenCalledWith('test-tool', null);
    });

    it('should log with different levels', async () => {
      mockContext7Client.callTool.mockResolvedValue({
        success: true,
        output: { result: 'success' },
      });

      const result = await agent.run('test-tool', { param1: 'value1' }, { logLevel: 'debug' });

      expect(result.logs.some(log => log.includes('[DEBUG]'))).toBe(true);
      expect(result.logs.some(log => log.includes('[INFO]'))).toBe(true);
    });
  });

  describe('discoverTools()', () => {
    it('should discover tools from Context7 client', async () => {
      const mockTools = [
        { name: 'tool1', description: 'Test tool 1', endpoint: 'http://localhost:3001' },
        { name: 'tool2', description: 'Test tool 2', endpoint: 'http://localhost:8080' },
      ];

      mockContext7Client.discover.mockResolvedValue(mockTools);

      const tools = await agent.discoverTools();

      expect(tools).toEqual(mockTools);
      expect(mockContext7Client.discover).toHaveBeenCalled();
    });

    it('should handle discovery failures', async () => {
      mockContext7Client.discover.mockRejectedValue(new Error('Discovery failed'));

      const tools = await agent.discoverTools();

      expect(tools).toEqual([]);
    });

    it('should return empty array when MCP is disabled', async () => {
      process.env.MCP_ENABLED = 'false';
      const disabledAgent = new MCPAgent();

      const tools = await disabledAgent.discoverTools();

      expect(tools).toEqual([]);
      expect(mockContext7Client.discover).not.toHaveBeenCalled();
    });
  });

  describe('getHealthStatus()', () => {
    it('should get health status from Context7 client', async () => {
      const mockHealth = [
        { endpoint: 'http://localhost:3001', healthy: true, responseTime: 150 },
        { endpoint: 'http://localhost:8080', healthy: false, error: 'Connection refused' },
      ];

      mockContext7Client.healthCheck.mockResolvedValue(mockHealth);

      const health = await agent.getHealthStatus();

      expect(health).toEqual(mockHealth);
      expect(mockContext7Client.healthCheck).toHaveBeenCalled();
    });

    it('should handle health check failures', async () => {
      mockContext7Client.healthCheck.mockRejectedValue(new Error('Health check failed'));

      const health = await agent.getHealthStatus();

      expect(health).toEqual([]);
    });

    it('should return empty array when MCP is disabled', async () => {
      process.env.MCP_ENABLED = 'false';
      const disabledAgent = new MCPAgent();

      const health = await disabledAgent.getHealthStatus();

      expect(health).toEqual([]);
      expect(mockContext7Client.healthCheck).not.toHaveBeenCalled();
    });
  });

  describe('utility methods', () => {
    it('should return logs', async () => {
      mockContext7Client.callTool.mockResolvedValue({
        success: true,
        output: { result: 'success' },
      });

      await agent.run('test-tool', { param1: 'value1' });
      const logs = agent.getLogs();

      expect(logs.length).toBeGreaterThan(0);
      expect(logs[0]).toContain('[INFO]');
    });

    it('should clear logs', async () => {
      mockContext7Client.callTool.mockResolvedValue({
        success: true,
        output: { result: 'success' },
      });

      await agent.run('test-tool', { param1: 'value1' });
      expect(agent.getLogs().length).toBeGreaterThan(0);

      agent.clearLogs();
      expect(agent.getLogs().length).toBe(0);
    });

    it('should check if MCP is enabled', () => {
      expect(agent.isMCPEnabled()).toBe(true);

      process.env.MCP_ENABLED = 'false';
      const disabledAgent = new MCPAgent();
      expect(disabledAgent.isMCPEnabled()).toBe(false);
    });
  });

  describe('input validation', () => {
    it('should validate object inputs', async () => {
      const result = await agent.run('test-tool', { valid: 'input' }, { validateInput: true });

      // Should not fail validation for valid object
      expect(mockContext7Client.callTool).toHaveBeenCalled();
    });

    it('should reject non-object inputs', async () => {
      const result = await agent.run('test-tool', 'invalid-input' as any, { validateInput: true });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Input validation failed');
      expect(result.metadata?.validationErrors).toContain('Input must be an object');
    });

    it('should reject null inputs', async () => {
      const result = await agent.run('test-tool', null as any, { validateInput: true });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Input validation failed');
      expect(result.metadata?.validationErrors).toContain('Input cannot be null or undefined');
    });
  });

  describe('security', () => {
    it('should redact sensitive information from inputs and outputs', async () => {
      const sensitiveInput = {
        apiKey: 'sk-sensitive-key',
        data: 'normal-data'
      };

      mockContext7Client.callTool.mockResolvedValue({
        success: true,
        output: {
          result: 'success',
          token: 'sensitive-token'
        },
      });

      const result = await agent.run('test-tool', sensitiveInput);

      expect(result.success).toBe(true);
      expect(result.output.redacted).toBe(true); // Mock redaction adds this flag
    });
  });
});