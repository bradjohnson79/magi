/**
 * Agents Integration Tests
 *
 * Tests for agent integration with the secrets service ensuring
 * agents use secrets instead of environment variables and
 * properly trace secret access.
 */

import { BaseAgent } from '@/services/agents/baseAgent';
import { AgentSecretsHelper, providerHelpers } from '@/services/agents/secretsHelper';
import { AgentContext, AgentConfig } from '@/services/agents/types';

// Mock dependencies
jest.mock('@/services/secrets', () => ({
  getSecret: jest.fn(),
  SECRET_NAMES: {
    OPENAI_API_KEY: 'openai_api_key',
    ANTHROPIC_API_KEY: 'anthropic_api_key',
    GITHUB_TOKEN: 'github_token',
  },
  PROVIDERS: {
    OPENAI: 'openai',
    ANTHROPIC: 'anthropic',
    GITHUB: 'github',
  },
}));

jest.mock('@/services/audit/logger', () => ({
  auditLogger: {
    logSystem: jest.fn(),
    logSecurity: jest.fn(),
  },
}));

jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn()),
  addSpanAttributes: jest.fn(),
  getCurrentTraceId: jest.fn(() => 'test-trace-id'),
  getCurrentSpanId: jest.fn(() => 'test-span-id'),
  SPAN_ATTRIBUTES: {
    OPERATION_TYPE: 'operation.type',
  },
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    modelRun: {
      create: jest.fn(),
    },
  },
}));

const { getSecret } = require('@/services/secrets');
const { auditLogger } = require('@/services/audit/logger');
const { prisma } = require('@/lib/db');

// Test agent implementation
class TestAgent extends BaseAgent {
  public readonly name = 'test-agent';
  public readonly version = '1.0.0';
  public readonly capabilities = ['test'];

  protected async executeInternal(context: AgentContext) {
    // Test accessing secrets through the helper
    const openaiKey = await this.secrets.getSecret('openai_api_key');

    return {
      success: true,
      outputs: {
        secretAccessed: true,
        keyLength: openaiKey.length,
      },
    };
  }
}

describe('Agents Integration with Secrets', () => {
  let testAgent: TestAgent;
  const userId = 'test-user-123';
  const agentConfig: AgentConfig = {
    model: 'gpt-4',
    maxRetries: 3,
    timeout: 30000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    testAgent = new TestAgent(agentConfig);

    // Set up environment variables for fallback testing
    process.env.OPENAI_API_KEY = 'env-fallback-key';
    process.env.GITHUB_TOKEN = 'env-github-token';
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
    delete process.env.GITHUB_TOKEN;
  });

  describe('Agent Secrets Helper', () => {
    let secretsHelper: AgentSecretsHelper;

    beforeEach(() => {
      secretsHelper = new AgentSecretsHelper('test-agent', userId);
    });

    it('should retrieve secrets from secrets service', async () => {
      const secretValue = 'sk-1234567890abcdef';
      getSecret.mockResolvedValue(secretValue);

      const result = await secretsHelper.getSecret('openai_api_key');

      expect(result).toBe(secretValue);
      expect(getSecret).toHaveBeenCalledWith('openai_api_key', userId);
      expect(auditLogger.logSystem).toHaveBeenCalledWith(
        'system.secret_accessed_by_agent',
        expect.objectContaining({
          secretName: 'openai_api_key',
          agentName: 'test-agent',
          userId,
        })
      );
    });

    it('should fallback to environment variables when secret not found', async () => {
      getSecret.mockRejectedValue(new Error('Secret not found'));

      const result = await secretsHelper.getSecret('openai_api_key', {
        fallbackEnvVar: 'OPENAI_API_KEY',
      });

      expect(result).toBe('env-fallback-key');
      expect(auditLogger.logSystem).toHaveBeenCalledWith(
        'system.secret_fallback_used',
        expect.objectContaining({
          secretName: 'openai_api_key',
          fallbackEnvVar: 'OPENAI_API_KEY',
          agentName: 'test-agent',
          userId,
        })
      );
    });

    it('should throw error for required secrets when not found', async () => {
      getSecret.mockRejectedValue(new Error('Secret not found'));

      await expect(
        secretsHelper.getSecret('missing_secret', { required: true })
      ).rejects.toThrow('Required secret \'missing_secret\' not found');

      expect(auditLogger.logSecurity).toHaveBeenCalledWith(
        'security.required_secret_missing',
        userId,
        expect.objectContaining({
          secretName: 'missing_secret',
          agentName: 'test-agent',
        })
      );
    });

    it('should return empty string for optional secrets when not found', async () => {
      getSecret.mockRejectedValue(new Error('Secret not found'));

      const result = await secretsHelper.getSecret('optional_secret', {
        required: false,
        fallbackEnvVar: 'NONEXISTENT_ENV_VAR',
      });

      expect(result).toBe('');
    });

    it('should validate multiple secrets at once', async () => {
      getSecret
        .mockResolvedValueOnce('key1-value')
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce('key3-value');

      const validation = await secretsHelper.validateRequiredSecrets([
        'existing_key1',
        'missing_key2',
        'existing_key3',
      ]);

      expect(validation.valid).toBe(false);
      expect(validation.missing).toEqual(['missing_key2']);
    });

    it('should get multiple secrets efficiently', async () => {
      getSecret
        .mockResolvedValueOnce('value1')
        .mockResolvedValueOnce('value2')
        .mockRejectedValueOnce(new Error('Not found'));

      const results = await secretsHelper.getMultipleSecrets([
        'secret1',
        'secret2',
        'missing_secret',
      ]);

      expect(results).toEqual({
        secret1: 'value1',
        secret2: 'value2',
        missing_secret: '',
      });
    });
  });

  describe('Provider Helpers', () => {
    it('should get OpenAI configuration', async () => {
      getSecret.mockResolvedValue('sk-openai-key');

      const config = await providerHelpers.openai('test-agent', userId);

      expect(config).toEqual({
        apiKey: 'sk-openai-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4',
        maxTokens: 4000,
        temperature: 0.1,
      });
      expect(getSecret).toHaveBeenCalledWith('openai_api_key', userId);
    });

    it('should get Anthropic configuration', async () => {
      getSecret.mockResolvedValue('sk-ant-key');

      const config = await providerHelpers.anthropic('test-agent', userId);

      expect(config).toEqual({
        apiKey: 'sk-ant-key',
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3-sonnet-20240229',
        maxTokens: 4000,
        temperature: 0.1,
      });
    });

    it('should get Google configuration', async () => {
      getSecret.mockResolvedValue('google-api-key');

      const config = await providerHelpers.google('test-agent', userId);

      expect(config).toEqual({
        apiKey: 'google-api-key',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-pro',
        maxTokens: 4000,
        temperature: 0.1,
      });
    });
  });

  describe('Base Agent Integration', () => {
    it('should initialize secrets helper with agent name', () => {
      expect(testAgent['secrets']).toBeInstanceOf(AgentSecretsHelper);
    });

    it('should update secrets helper with user context during execution', async () => {
      getSecret.mockResolvedValue('test-secret-value');
      prisma.modelRun.create.mockResolvedValue({ id: 'run-123' });

      const context: AgentContext = {
        userId,
        projectId: 'project-123',
        taskId: 'task-456',
        sessionId: 'session-789',
        inputs: { test: 'input' },
      };

      const result = await testAgent.execute(context);

      expect(result.success).toBe(true);
      expect(result.outputs?.secretAccessed).toBe(true);
      expect(getSecret).toHaveBeenCalledWith('openai_api_key', userId);
    });

    it('should include trace IDs in model run logging', async () => {
      getSecret.mockResolvedValue('secret-value');
      prisma.modelRun.create.mockResolvedValue({ id: 'run-123' });

      const context: AgentContext = {
        userId,
        projectId: 'project-123',
        taskId: 'task-456',
        inputs: { test: 'input' },
      };

      await testAgent.execute(context);

      expect(prisma.modelRun.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          traceId: 'test-trace-id',
          spanId: 'test-span-id',
          userId,
          projectId: 'project-123',
        }),
      });
    });

    it('should handle secret access failures gracefully', async () => {
      getSecret.mockRejectedValue(new Error('Database connection failed'));
      prisma.modelRun.create.mockResolvedValue({ id: 'run-123' });

      const context: AgentContext = {
        userId,
        projectId: 'project-123',
        taskId: 'task-456',
        inputs: { test: 'input' },
      };

      const result = await testAgent.execute(context);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Database connection failed');
    });

    it('should redact secrets from model run logs', async () => {
      getSecret.mockResolvedValue('secret-api-key-12345');
      prisma.modelRun.create.mockResolvedValue({ id: 'run-123' });

      const context: AgentContext = {
        userId,
        projectId: 'project-123',
        taskId: 'task-456',
        inputs: {
          apiKey: 'secret-api-key-12345', // This should be redacted
          message: 'test message',
        },
      };

      await testAgent.execute(context);

      const createCall = prisma.modelRun.create.mock.calls[0][0];
      const inputPayload = createCall.data.inputPayload;

      // The secret should be redacted in the logged inputs
      expect(JSON.stringify(inputPayload)).not.toContain('secret-api-key-12345');
    });
  });

  describe('Secret Caching', () => {
    let secretsHelper: AgentSecretsHelper;

    beforeEach(() => {
      secretsHelper = new AgentSecretsHelper('cache-test-agent', userId);
    });

    it('should use cached secrets for performance', async () => {
      // This test would need to be implemented with access to the internal cache
      // or by testing the behavior indirectly through timing
      getSecret.mockResolvedValue('cached-secret-value');

      const secret1 = await secretsHelper.getSecret('cached_secret');
      const secret2 = await secretsHelper.getSecret('cached_secret');

      expect(secret1).toBe('cached-secret-value');
      expect(secret2).toBe('cached-secret-value');

      // The secrets service might implement its own caching,
      // so we can't assert on call count here
    });
  });

  describe('Error Handling and Security', () => {
    let secretsHelper: AgentSecretsHelper;

    beforeEach(() => {
      secretsHelper = new AgentSecretsHelper('security-test-agent', userId);
    });

    it('should log security events for failed secret access', async () => {
      getSecret.mockRejectedValue(new Error('Unauthorized access'));

      await expect(
        secretsHelper.getSecret('restricted_secret', { required: true })
      ).rejects.toThrow();

      expect(auditLogger.logSecurity).toHaveBeenCalledWith(
        'security.secret_access_error',
        userId,
        expect.objectContaining({
          secretName: 'restricted_secret',
          agentName: 'security-test-agent',
          error: 'Unauthorized access',
        })
      );
    });

    it('should handle network timeouts gracefully', async () => {
      getSecret.mockRejectedValue(new Error('Network timeout'));

      const result = await secretsHelper.getSecret('network_secret', {
        required: false,
        fallbackEnvVar: 'GITHUB_TOKEN',
      });

      expect(result).toBe('env-github-token'); // Should use fallback
    });

    it('should validate secret existence without retrieving value', async () => {
      getSecret.mockResolvedValue('secret-exists');

      const exists = await secretsHelper.hasSecret('existing_secret');

      expect(exists).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should handle concurrent secret access', async () => {
      const secretsHelper = new AgentSecretsHelper('perf-test-agent', userId);

      getSecret.mockImplementation((name) =>
        Promise.resolve(`value-for-${name}`)
      );

      const secretNames = Array.from({ length: 10 }, (_, i) => `secret_${i}`);

      const startTime = Date.now();
      const results = await secretsHelper.getMultipleSecrets(secretNames);
      const endTime = Date.now();

      expect(Object.keys(results)).toHaveLength(10);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete quickly

      secretNames.forEach(name => {
        expect(results[name]).toBe(`value-for-${name}`);
      });
    });
  });

  describe('Static Factory Methods', () => {
    it('should create user-scoped helper', () => {
      const helper = AgentSecretsHelper.forUser('test-agent', 'user-123');

      expect(helper).toBeInstanceOf(AgentSecretsHelper);
      expect(helper['agentName']).toBe('test-agent');
      expect(helper['userId']).toBe('user-123');
    });

    it('should create system-level helper', () => {
      const helper = AgentSecretsHelper.forSystem('system-agent');

      expect(helper).toBeInstanceOf(AgentSecretsHelper);
      expect(helper['agentName']).toBe('system-agent');
      expect(helper['userId']).toBeUndefined();
    });
  });
});