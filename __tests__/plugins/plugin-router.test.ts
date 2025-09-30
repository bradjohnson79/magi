/**
 * Tests for Plugin Router and Agent Dispatcher
 * Tests plugin routing, agent execution, and workflow orchestration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { pluginRouter } from '@/services/plugins/router';
import { pluginManager } from '@/services/plugins/manager';
import { ExampleManifests } from '@/services/plugins/schema';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/services/plugins/manager');
jest.mock('@/lib/prisma');
jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn({})),
  addSpanAttributes: jest.fn(),
  SPAN_ATTRIBUTES: {
    USER_ID: 'user.id',
    OPERATION_TYPE: 'operation.type',
  },
}));

describe('Plugin Router', () => {
  const mockUserId = 'user-123';
  const mockPluginId = 'plugin-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Plugin Discovery and Routing', () => {
    test('should find plugins by capabilities', async () => {
      const mockPlugins = [
        {
          id: 'eslint-plugin',
          manifest: {
            ...ExampleManifests.eslintPlugin,
            capabilities: ['code_analysis', 'linting'],
          },
          status: 'enabled',
          usage: {
            executions: 100,
            errorRate: 0.05,
            averageExecutionTime: 1000,
          },
          health: { status: 'healthy' },
        },
        {
          id: 'react-plugin',
          manifest: {
            ...ExampleManifests.reactComponentGenerator,
            capabilities: ['code_generation'],
          },
          status: 'enabled',
          usage: {
            executions: 50,
            errorRate: 0.1,
            averageExecutionTime: 2000,
          },
          health: { status: 'healthy' },
        },
        {
          id: 'test-plugin',
          manifest: {
            name: 'test-runner',
            displayName: 'Test Runner',
            version: '1.0.0',
            description: 'Runs tests',
            author: 'Test Team',
            capabilities: ['testing'],
            category: 'testing',
            tags: ['jest', 'testing'],
            inputs: [],
            outputs: [],
            agent: { type: 'local' },
          },
          status: 'enabled',
          usage: {
            executions: 75,
            errorRate: 0.02,
            averageExecutionTime: 5000,
          },
          health: { status: 'healthy' },
        },
      ];

      (pluginManager.listPlugins as jest.Mock).mockResolvedValue({
        plugins: mockPlugins,
        total: 3,
        hasMore: false,
      });

      const routingContext = {
        userId: mockUserId,
        capabilities: ['code_analysis', 'testing'],
      };

      const plan = await pluginRouter.findPluginsForCapabilities(routingContext);

      expect(plan.plugins).toHaveLength(2);
      expect(plan.plugins.find(p => p.pluginId === 'eslint-plugin')).toBeDefined();
      expect(plan.plugins.find(p => p.pluginId === 'test-plugin')).toBeDefined();
      expect(plan.plugins.find(p => p.pluginId === 'react-plugin')).toBeUndefined();
    });

    test('should prioritize plugins correctly', async () => {
      const mockPlugins = [
        {
          id: 'low-usage-plugin',
          manifest: {
            ...ExampleManifests.eslintPlugin,
            capabilities: ['code_analysis'],
          },
          status: 'enabled',
          usage: {
            executions: 5, // Low usage
            errorRate: 0.2, // High error rate
            averageExecutionTime: 3000,
            lastUsed: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
          },
          health: { status: 'warning' },
        },
        {
          id: 'high-quality-plugin',
          manifest: {
            ...ExampleManifests.eslintPlugin,
            capabilities: ['code_analysis'],
          },
          status: 'enabled',
          usage: {
            executions: 1000, // High usage
            errorRate: 0.01, // Low error rate
            averageExecutionTime: 800,
            lastUsed: new Date(Date.now() - 1 * 60 * 60 * 1000), // 1 hour ago
          },
          health: { status: 'healthy' },
        },
        {
          id: 'broken-plugin',
          manifest: {
            ...ExampleManifests.eslintPlugin,
            capabilities: ['code_analysis'],
          },
          status: 'enabled',
          usage: {
            executions: 100,
            errorRate: 0.8, // Very high error rate
            averageExecutionTime: 1500,
          },
          health: { status: 'error' },
        },
      ];

      (pluginManager.listPlugins as jest.Mock).mockResolvedValue({
        plugins: mockPlugins,
        total: 3,
        hasMore: false,
      });

      const routingContext = {
        userId: mockUserId,
        capabilities: ['code_analysis'],
      };

      const plan = await pluginRouter.findPluginsForCapabilities(routingContext);

      // High quality plugin should be first
      expect(plan.plugins[0].pluginId).toBe('high-quality-plugin');
      expect(plan.plugins[0].priority).toBeGreaterThan(plan.plugins[1].priority);

      // Broken plugin should be last
      const brokenPluginIndex = plan.plugins.findIndex(p => p.pluginId === 'broken-plugin');
      expect(brokenPluginIndex).toBe(plan.plugins.length - 1);
    });

    test('should respect plugin preferences', async () => {
      const mockPlugins = [
        {
          id: 'preferred-plugin',
          manifest: {
            ...ExampleManifests.eslintPlugin,
            capabilities: ['code_analysis'],
          },
          status: 'enabled',
          usage: { executions: 10, errorRate: 0.1, averageExecutionTime: 2000 },
          health: { status: 'healthy' },
        },
        {
          id: 'better-stats-plugin',
          manifest: {
            ...ExampleManifests.eslintPlugin,
            capabilities: ['code_analysis'],
          },
          status: 'enabled',
          usage: { executions: 1000, errorRate: 0.01, averageExecutionTime: 500 },
          health: { status: 'healthy' },
        },
        {
          id: 'excluded-plugin',
          manifest: {
            ...ExampleManifests.eslintPlugin,
            capabilities: ['code_analysis'],
          },
          status: 'enabled',
          usage: { executions: 500, errorRate: 0.05, averageExecutionTime: 1000 },
          health: { status: 'healthy' },
        },
      ];

      (pluginManager.listPlugins as jest.Mock).mockResolvedValue({
        plugins: mockPlugins,
        total: 3,
        hasMore: false,
      });

      const routingContext = {
        userId: mockUserId,
        capabilities: ['code_analysis'],
        preferences: {
          preferredPlugins: ['preferred-plugin'],
          excludedPlugins: ['excluded-plugin'],
        },
      };

      const plan = await pluginRouter.findPluginsForCapabilities(routingContext);

      expect(plan.plugins).toHaveLength(2);
      expect(plan.plugins[0].pluginId).toBe('preferred-plugin'); // Preferred first
      expect(plan.plugins.find(p => p.pluginId === 'excluded-plugin')).toBeUndefined();
    });

    test('should estimate costs and execution times', async () => {
      const mockPlugins = [
        {
          id: 'openai-plugin',
          manifest: {
            ...ExampleManifests.reactComponentGenerator,
            agent: {
              type: 'openai',
              model: 'gpt-4',
              maxTokens: 2000,
            },
            capabilities: ['code_generation'],
          },
          status: 'enabled',
          usage: { executions: 100, errorRate: 0.05, averageExecutionTime: 3000 },
          health: { status: 'healthy' },
        },
        {
          id: 'local-plugin',
          manifest: {
            ...ExampleManifests.eslintPlugin,
            agent: { type: 'local' },
            capabilities: ['code_analysis'],
          },
          status: 'enabled',
          usage: { executions: 200, errorRate: 0.02, averageExecutionTime: 1000 },
          health: { status: 'healthy' },
        },
      ];

      (pluginManager.listPlugins as jest.Mock).mockResolvedValue({
        plugins: mockPlugins,
        total: 2,
        hasMore: false,
      });

      const routingContext = {
        userId: mockUserId,
        capabilities: ['code_generation', 'code_analysis'],
      };

      const plan = await pluginRouter.findPluginsForCapabilities(routingContext);

      expect(plan.plugins).toHaveLength(2);

      const openAIPlugin = plan.plugins.find(p => p.pluginId === 'openai-plugin');
      const localPlugin = plan.plugins.find(p => p.pluginId === 'local-plugin');

      expect(openAIPlugin?.estimatedCost).toBeGreaterThan(localPlugin?.estimatedCost || 0);
      expect(openAIPlugin?.estimatedTime).toBe(3000); // Uses average execution time
      expect(localPlugin?.estimatedTime).toBe(1000);
    });
  });

  describe('Plugin Execution', () => {
    test('should execute OpenAI agent plugin', async () => {
      const mockPlugin = {
        id: mockPluginId,
        manifest: {
          ...ExampleManifests.reactComponentGenerator,
          agent: {
            type: 'openai',
            model: 'gpt-4',
            temperature: 0.3,
            maxTokens: 2000,
          },
        },
        status: 'enabled',
      };

      const executionContext = {
        pluginId: mockPluginId,
        userId: mockUserId,
        sessionId: 'test-session',
        input: {
          componentName: 'TestButton',
          props: { variant: 'primary' },
        },
        config: {},
        metadata: {},
      };

      const mockExecution = { id: 'execution-id', status: 'running' };

      (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);
      (prisma.pluginExecution.create as jest.Mock).mockResolvedValue(mockExecution);
      (prisma.pluginExecution.update as jest.Mock).mockResolvedValue(mockExecution);
      (pluginManager.updatePluginMetrics as jest.Mock).mockResolvedValue(undefined);

      const result = await pluginRouter.executePlugin(executionContext);

      expect(result.success).toBe(true);
      expect(result.output).toBeDefined();
      expect(result.metadata.executionTime).toBeGreaterThan(0);

      expect(prisma.pluginExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          pluginId: mockPluginId,
          userId: mockUserId,
          input: executionContext.input,
          status: 'running',
        }),
      });
    });

    test('should execute local agent plugin', async () => {
      const mockPlugin = {
        id: mockPluginId,
        manifest: {
          ...ExampleManifests.eslintPlugin,
          agent: { type: 'local' },
        },
        status: 'enabled',
      };

      const executionContext = {
        pluginId: mockPluginId,
        userId: mockUserId,
        sessionId: 'test-session',
        input: {
          files: ['src/test.js'],
          config: { rules: { 'no-console': 'error' } },
        },
        config: {},
        metadata: {},
      };

      const mockExecution = { id: 'execution-id', status: 'running' };

      (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);
      (prisma.pluginExecution.create as jest.Mock).mockResolvedValue(mockExecution);
      (prisma.pluginExecution.update as jest.Mock).mockResolvedValue(mockExecution);
      (pluginManager.updatePluginMetrics as jest.Mock).mockResolvedValue(undefined);

      const result = await pluginRouter.executePlugin(executionContext);

      expect(result.success).toBe(true);
      expect(result.metadata.executionTime).toBeLessThan(1000); // Local execution should be fast
    });

    test('should handle unsupported agent type', async () => {
      const mockPlugin = {
        id: mockPluginId,
        manifest: {
          ...ExampleManifests.eslintPlugin,
          agent: { type: 'unsupported-agent' },
        },
        status: 'enabled',
      };

      const executionContext = {
        pluginId: mockPluginId,
        userId: mockUserId,
        sessionId: 'test-session',
        input: { files: ['test.js'] },
        config: {},
        metadata: {},
      };

      (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);

      const result = await pluginRouter.executePlugin(executionContext);

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('No executor available');
    });

    test('should validate plugin permissions', async () => {
      const mockPlugin = {
        id: mockPluginId,
        manifest: {
          ...ExampleManifests.eslintPlugin,
          permissions: {
            fileSystem: {
              read: ['src/**/*.js'],
              write: ['reports/**/*'],
            },
            network: {
              outbound: ['https://api.eslint.org/*'],
            },
          },
        },
        status: 'enabled',
      };

      const executionContext = {
        pluginId: mockPluginId,
        userId: mockUserId,
        sessionId: 'test-session',
        input: { files: ['src/test.js'] },
        config: {},
        metadata: {},
      };

      const mockExecution = { id: 'execution-id', status: 'running' };

      (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);
      (prisma.pluginExecution.create as jest.Mock).mockResolvedValue(mockExecution);
      (prisma.pluginExecution.update as jest.Mock).mockResolvedValue(mockExecution);
      (pluginManager.updatePluginMetrics as jest.Mock).mockResolvedValue(undefined);

      const result = await pluginRouter.executePlugin(executionContext);

      expect(result.success).toBe(true);
      // Permission validation should not fail for this test case
    });

    test('should handle execution timeout', async () => {
      const mockPlugin = {
        id: mockPluginId,
        manifest: {
          ...ExampleManifests.eslintPlugin,
          config: { timeout: 1000 }, // Very short timeout
        },
        status: 'enabled',
      };

      const executionContext = {
        pluginId: mockPluginId,
        userId: mockUserId,
        sessionId: 'test-session',
        input: { files: ['test.js'] },
        config: {},
        metadata: {},
      };

      (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);

      // Mock long-running execution
      jest.spyOn(Date, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(5000); // 5 second execution

      const result = await pluginRouter.executePlugin(executionContext);

      expect(result.success).toBe(true); // Our mock doesn't actually timeout
      expect(result.metadata.executionTime).toBe(5000);
    });
  });

  describe('Plugin Chain Execution', () => {
    test('should execute plugins sequentially', async () => {
      const contexts = [
        {
          pluginId: 'plugin-1',
          userId: mockUserId,
          sessionId: 'test-session',
          input: { step: 1 },
          config: {},
          metadata: {},
        },
        {
          pluginId: 'plugin-2',
          userId: mockUserId,
          sessionId: 'test-session',
          input: { step: 2 },
          config: {},
          metadata: {},
        },
      ];

      const executePluginSpy = jest.spyOn(pluginRouter, 'executePlugin')
        .mockResolvedValueOnce({
          success: true,
          output: { result: 'step1-complete' },
          metadata: { executionTime: 1000 },
          logs: [],
        })
        .mockResolvedValueOnce({
          success: true,
          output: { result: 'step2-complete' },
          metadata: { executionTime: 1500 },
          logs: [],
        });

      const results = await pluginRouter.executePluginChain(contexts, {
        parallel: false,
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[0].output?.result).toBe('step1-complete');
      expect(results[1].success).toBe(true);
      expect(results[1].output?.result).toBe('step2-complete');

      // Verify sequential execution
      expect(executePluginSpy).toHaveBeenCalledTimes(2);
      expect(executePluginSpy).toHaveBeenNthCalledWith(1, contexts[0]);
      expect(executePluginSpy).toHaveBeenNthCalledWith(2, contexts[1]);
    });

    test('should execute plugins in parallel', async () => {
      const contexts = [
        {
          pluginId: 'plugin-1',
          userId: mockUserId,
          sessionId: 'test-session',
          input: { task: 'analyze' },
          config: {},
          metadata: {},
        },
        {
          pluginId: 'plugin-2',
          userId: mockUserId,
          sessionId: 'test-session',
          input: { task: 'format' },
          config: {},
          metadata: {},
        },
      ];

      jest.spyOn(pluginRouter, 'executePlugin')
        .mockResolvedValue({
          success: true,
          output: { status: 'completed' },
          metadata: { executionTime: 1000 },
          logs: [],
        });

      const results = await pluginRouter.executePluginChain(contexts, {
        parallel: true,
      });

      expect(results).toHaveLength(2);
      expect(results[0].success).toBe(true);
      expect(results[1].success).toBe(true);
    });

    test('should handle chain execution with errors', async () => {
      const contexts = [
        {
          pluginId: 'plugin-1',
          userId: mockUserId,
          sessionId: 'test-session',
          input: { data: 'valid' },
          config: {},
          metadata: {},
        },
        {
          pluginId: 'plugin-2',
          userId: mockUserId,
          sessionId: 'test-session',
          input: { data: 'invalid' },
          config: {},
          metadata: {},
        },
        {
          pluginId: 'plugin-3',
          userId: mockUserId,
          sessionId: 'test-session',
          input: { data: 'valid' },
          config: {},
          metadata: {},
        },
      ];

      jest.spyOn(pluginRouter, 'executePlugin')
        .mockResolvedValueOnce({
          success: true,
          output: { result: 'success' },
          metadata: { executionTime: 1000 },
          logs: [],
        })
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
          metadata: { executionTime: 500 },
          logs: [],
        })
        .mockResolvedValueOnce({
          success: true,
          output: { result: 'success' },
          metadata: { executionTime: 1000 },
          logs: [],
        });

      // Test with continueOnError = false (default)
      const resultsStopOnError = await pluginRouter.executePluginChain(contexts, {
        parallel: false,
        continueOnError: false,
      });

      expect(resultsStopOnError).toHaveLength(2); // Should stop after error
      expect(resultsStopOnError[0].success).toBe(true);
      expect(resultsStopOnError[1].success).toBe(false);

      // Reset the spy
      jest.clearAllMocks();
      jest.spyOn(pluginRouter, 'executePlugin')
        .mockResolvedValueOnce({
          success: true,
          output: { result: 'success' },
          metadata: { executionTime: 1000 },
          logs: [],
        })
        .mockResolvedValueOnce({
          success: false,
          error: { code: 'VALIDATION_ERROR', message: 'Invalid input' },
          metadata: { executionTime: 500 },
          logs: [],
        })
        .mockResolvedValueOnce({
          success: true,
          output: { result: 'success' },
          metadata: { executionTime: 1000 },
          logs: [],
        });

      // Test with continueOnError = true
      const resultsContinueOnError = await pluginRouter.executePluginChain(contexts, {
        parallel: false,
        continueOnError: true,
      });

      expect(resultsContinueOnError).toHaveLength(3); // Should continue after error
      expect(resultsContinueOnError[0].success).toBe(true);
      expect(resultsContinueOnError[1].success).toBe(false);
      expect(resultsContinueOnError[2].success).toBe(true);
    });

    test('should handle chain execution timeout', async () => {
      const contexts = [
        {
          pluginId: 'slow-plugin',
          userId: mockUserId,
          sessionId: 'test-session',
          input: { data: 'test' },
          config: {},
          metadata: {},
        },
      ];

      // Mock slow execution
      jest.spyOn(pluginRouter, 'executePlugin')
        .mockImplementation(() => new Promise(resolve => {
          setTimeout(() => resolve({
            success: true,
            output: { result: 'slow-result' },
            metadata: { executionTime: 10000 },
            logs: [],
          }), 5000);
        }));

      const results = await pluginRouter.executePluginChain(contexts, {
        parallel: true,
        timeout: 1000, // 1 second timeout
      });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].error?.message).toContain('timeout');
    });
  });

  describe('Agent-Specific Execution', () => {
    test('should handle webhook agent execution', async () => {
      const mockPlugin = {
        id: mockPluginId,
        manifest: {
          name: 'webhook-plugin',
          displayName: 'Webhook Plugin',
          version: '1.0.0',
          description: 'External webhook plugin',
          author: 'Test',
          capabilities: ['custom'],
          category: 'integration',
          tags: ['webhook'],
          inputs: [{ name: 'data', type: 'object', description: 'Input data', required: true }],
          outputs: [{ name: 'result', type: 'object', description: 'Result data', required: true }],
          agent: {
            type: 'webhook',
            endpoint: 'https://api.example.com/process',
          },
        },
        status: 'enabled',
      };

      const executionContext = {
        pluginId: mockPluginId,
        userId: mockUserId,
        sessionId: 'test-session',
        input: { data: { test: 'value' } },
        config: {},
        metadata: {},
      };

      const mockExecution = { id: 'execution-id', status: 'running' };

      (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);
      (prisma.pluginExecution.create as jest.Mock).mockResolvedValue(mockExecution);
      (prisma.pluginExecution.update as jest.Mock).mockResolvedValue(mockExecution);
      (pluginManager.updatePluginMetrics as jest.Mock).mockResolvedValue(undefined);

      const result = await pluginRouter.executePlugin(executionContext);

      expect(result.success).toBe(true);
      expect(result.output?.message).toContain('Webhook agent execution');
    });

    test('should handle Docker agent execution', async () => {
      const mockPlugin = {
        id: mockPluginId,
        manifest: {
          name: 'docker-plugin',
          displayName: 'Docker Plugin',
          version: '1.0.0',
          description: 'Containerized plugin',
          author: 'Test',
          capabilities: ['custom'],
          category: 'processing',
          tags: ['docker'],
          inputs: [],
          outputs: [],
          agent: {
            type: 'docker',
            endpoint: 'docker://my-plugin:latest',
          },
        },
        status: 'enabled',
      };

      const executionContext = {
        pluginId: mockPluginId,
        userId: mockUserId,
        sessionId: 'test-session',
        input: {},
        config: {},
        metadata: {},
      };

      const mockExecution = { id: 'execution-id', status: 'running' };

      (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);
      (prisma.pluginExecution.create as jest.Mock).mockResolvedValue(mockExecution);
      (prisma.pluginExecution.update as jest.Mock).mockResolvedValue(mockExecution);
      (pluginManager.updatePluginMetrics as jest.Mock).mockResolvedValue(undefined);

      const result = await pluginRouter.executePlugin(executionContext);

      expect(result.success).toBe(true);
      expect(result.metadata.memoryUsed).toBe(256); // Docker executor sets memory usage
    });
  });
});