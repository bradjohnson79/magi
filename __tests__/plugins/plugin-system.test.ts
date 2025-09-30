/**
 * Comprehensive tests for Plugin System
 * Tests plugin installation, configuration, execution, and lifecycle management
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { pluginManager } from '@/services/plugins/manager';
import { pluginRouter } from '@/services/plugins/router';
import { PluginValidator, ExampleManifests } from '@/services/plugins/schema';
import { prisma } from '@/lib/prisma';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    plugin: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
    pluginExecution: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}));

// Mock auth
jest.mock('@clerk/nextjs/server', () => ({
  getAuth: jest.fn(() => ({ userId: 'test-user-id' })),
}));

// Mock tracing
jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn({})),
  addSpanAttributes: jest.fn(),
  SPAN_ATTRIBUTES: {
    USER_ID: 'user.id',
    PROJECT_ID: 'project.id',
    OPERATION_TYPE: 'operation.type',
  },
}));

describe('Plugin System', () => {
  const mockUserId = 'test-user-id';
  const mockPluginId = 'test-plugin-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('Plugin Manifest Validation', () => {
    test('should validate valid plugin manifest', () => {
      const manifest = ExampleManifests.eslintPlugin;

      expect(() => PluginValidator.validateManifest(manifest)).not.toThrow();

      const validated = PluginValidator.validateManifest(manifest);
      expect(validated.name).toBe('eslint-analyzer');
      expect(validated.capabilities).toContain('code_analysis');
      expect(validated.inputs).toHaveLength(2);
    });

    test('should reject invalid plugin manifest', () => {
      const invalidManifest = {
        name: 'invalid-plugin',
        // Missing required fields
      };

      expect(() => PluginValidator.validateManifest(invalidManifest))
        .toThrow();
    });

    test('should validate plugin name format', () => {
      const invalidNames = [
        'Invalid Name', // Spaces not allowed
        'invalid_name', // Underscores not allowed
        'Invalid-NAME', // Uppercase not allowed
        '', // Empty not allowed
      ];

      invalidNames.forEach(name => {
        const manifest = {
          ...ExampleManifests.eslintPlugin,
          name,
        };

        expect(() => PluginValidator.validateManifest(manifest))
          .toThrow();
      });
    });

    test('should validate plugin inputs and outputs', () => {
      const manifest = {
        ...ExampleManifests.reactComponentGenerator,
        inputs: [
          {
            name: 'invalidInput',
            type: 'invalidType', // Invalid type
            description: 'Test input',
            required: true,
          },
        ],
      };

      expect(() => PluginValidator.validateManifest(manifest))
        .toThrow();
    });

    test('should validate plugin permissions', () => {
      const validManifest = {
        ...ExampleManifests.eslintPlugin,
        permissions: {
          fileSystem: {
            read: ['**/*.js', '**/*.ts'],
            write: ['reports/**/*'],
          },
          network: {
            outbound: ['https://api.example.com/*'],
          },
          apis: ['github', 'npm'],
        },
      };

      expect(() => PluginValidator.validateManifest(validManifest))
        .not.toThrow();
    });
  });

  describe('Plugin Manager', () => {
    describe('installPlugin', () => {
      test('should install a valid plugin', async () => {
        const manifest = ExampleManifests.eslintPlugin;
        const mockPlugin = {
          id: mockPluginId,
          name: manifest.name,
          displayName: manifest.displayName,
          version: manifest.version,
          enabled: false,
          manifest,
          executions: 0,
          avgExecutionTime: 0,
          errorRate: 0,
          healthStatus: 'unknown',
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(null); // Plugin doesn't exist
        (prisma.plugin.create as jest.Mock).mockResolvedValue(mockPlugin);

        const result = await pluginManager.installPlugin(manifest, mockUserId, {
          source: 'local',
          autoEnable: true,
        });

        expect(prisma.plugin.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            name: manifest.name,
            displayName: manifest.displayName,
            version: manifest.version,
            enabled: true,
            installedBy: mockUserId,
            source: 'local',
          }),
        });

        expect(result.manifest.name).toBe(manifest.name);
        expect(result.status).toBe('disabled'); // Mock doesn't have enabled flag in formatted result
      });

      test('should reject installation of existing plugin', async () => {
        const manifest = ExampleManifests.eslintPlugin;
        const existingPlugin = {
          id: 'existing-plugin-id',
          name: manifest.name,
        };

        (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(existingPlugin);

        await expect(pluginManager.installPlugin(manifest, mockUserId))
          .rejects.toThrow('already installed');
      });

      test('should validate manifest during installation', async () => {
        const invalidManifest = {
          name: 'invalid',
          // Missing required fields
        };

        await expect(pluginManager.installPlugin(invalidManifest as any, mockUserId))
          .rejects.toThrow();
      });
    });

    describe('enablePlugin', () => {
      test('should enable a disabled plugin', async () => {
        const mockPlugin = {
          id: mockPluginId,
          name: 'test-plugin',
          enabled: false,
          manifest: ExampleManifests.eslintPlugin,
        };

        const updatedPlugin = {
          ...mockPlugin,
          enabled: true,
        };

        (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(mockPlugin);
        (prisma.plugin.update as jest.Mock).mockResolvedValue(updatedPlugin);

        const result = await pluginManager.enablePlugin(mockPluginId, mockUserId);

        expect(prisma.plugin.update).toHaveBeenCalledWith({
          where: { id: mockPluginId },
          data: expect.objectContaining({
            enabled: true,
          }),
        });

        expect(result.status).toBe('enabled');
      });

      test('should reject enabling already enabled plugin', async () => {
        const mockPlugin = {
          id: mockPluginId,
          enabled: true,
          manifest: ExampleManifests.eslintPlugin,
        };

        (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(mockPlugin);

        await expect(pluginManager.enablePlugin(mockPluginId, mockUserId))
          .rejects.toThrow('already enabled');
      });
    });

    describe('listPlugins', () => {
      test('should list plugins with filtering', async () => {
        const mockPlugins = [
          {
            id: 'plugin-1',
            name: 'eslint-plugin',
            category: 'code-quality',
            enabled: true,
            manifest: ExampleManifests.eslintPlugin,
            executions: 100,
            avgExecutionTime: 1000,
            errorRate: 0.05,
          },
          {
            id: 'plugin-2',
            name: 'react-plugin',
            category: 'generation',
            enabled: false,
            manifest: ExampleManifests.reactComponentGenerator,
            executions: 50,
            avgExecutionTime: 2000,
            errorRate: 0.1,
          },
        ];

        (prisma.plugin.findMany as jest.Mock).mockResolvedValue(mockPlugins);
        (prisma.plugin.count as jest.Mock).mockResolvedValue(2);

        const result = await pluginManager.listPlugins({
          enabled: true,
          category: 'code-quality',
          limit: 10,
        });

        expect(result.plugins).toHaveLength(2);
        expect(result.total).toBe(2);
        expect(result.hasMore).toBe(false);

        expect(prisma.plugin.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({
            enabled: true,
            category: 'code-quality',
          }),
          orderBy: expect.any(Array),
          take: 10,
          skip: 0,
        });
      });

      test('should handle search filtering', async () => {
        (prisma.plugin.findMany as jest.Mock).mockResolvedValue([]);
        (prisma.plugin.count as jest.Mock).mockResolvedValue(0);

        await pluginManager.listPlugins({
          search: 'eslint',
        });

        expect(prisma.plugin.findMany).toHaveBeenCalledWith({
          where: expect.objectContaining({
            OR: expect.arrayContaining([
              { name: { contains: 'eslint', mode: 'insensitive' } },
              { displayName: { contains: 'eslint', mode: 'insensitive' } },
            ]),
          }),
          orderBy: expect.any(Array),
          take: 20,
          skip: 0,
        });
      });
    });

    describe('checkPluginHealth', () => {
      test('should perform comprehensive health check', async () => {
        const mockPlugin = {
          id: mockPluginId,
          manifest: ExampleManifests.eslintPlugin,
          enabled: true,
          errorRate: 0.05,
          lastUsed: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days ago
        };

        (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(mockPlugin);
        (prisma.plugin.update as jest.Mock).mockResolvedValue(mockPlugin);

        const healthCheck = await pluginManager.checkPluginHealth(mockPluginId);

        expect(healthCheck.status).toBe('healthy');
        expect(healthCheck.issues).toHaveLength(0);
        expect(healthCheck.lastChecked).toBeInstanceOf(Date);
      });

      test('should detect health issues', async () => {
        const mockPlugin = {
          id: mockPluginId,
          manifest: {
            ...ExampleManifests.eslintPlugin,
            agent: {
              type: 'webhook',
              // Missing endpoint for webhook agent
            },
          },
          enabled: true,
          errorRate: 0.6, // High error rate
          lastUsed: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000), // 45 days ago
        };

        (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(mockPlugin);
        (prisma.plugin.update as jest.Mock).mockResolvedValue(mockPlugin);

        const healthCheck = await pluginManager.checkPluginHealth(mockPluginId);

        expect(healthCheck.status).toBe('error');
        expect(healthCheck.issues.length).toBeGreaterThan(0);
        expect(healthCheck.issues).toEqual(
          expect.arrayContaining([
            expect.stringMatching(/webhook.*endpoint/i),
            expect.stringMatching(/error rate/i),
            expect.stringMatching(/not been used/i),
          ])
        );
      });
    });
  });

  describe('Plugin Router', () => {
    describe('executePlugin', () => {
      test('should execute plugin successfully', async () => {
        const mockPlugin = {
          id: mockPluginId,
          manifest: ExampleManifests.eslintPlugin,
          status: 'enabled',
        };

        const executionContext = {
          pluginId: mockPluginId,
          userId: mockUserId,
          sessionId: 'test-session',
          input: {
            files: ['test.js'],
            config: { rules: {} },
          },
          config: {},
          metadata: {},
        };

        const mockExecution = {
          id: 'execution-id',
          status: 'running',
        };

        (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);
        (prisma.pluginExecution.create as jest.Mock).mockResolvedValue(mockExecution);
        (prisma.pluginExecution.update as jest.Mock).mockResolvedValue(mockExecution);
        (pluginManager.updatePluginMetrics as jest.Mock).mockResolvedValue(undefined);

        const result = await pluginRouter.executePlugin(executionContext);

        expect(result.success).toBe(true);
        expect(result.metadata.executionTime).toBeGreaterThan(0);

        expect(prisma.pluginExecution.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            pluginId: mockPluginId,
            userId: mockUserId,
            status: 'running',
          }),
        });

        expect(pluginManager.updatePluginMetrics).toHaveBeenCalledWith(
          mockPluginId,
          expect.any(Number),
          true,
          expect.any(Number)
        );
      });

      test('should handle plugin execution failure', async () => {
        const mockPlugin = {
          id: mockPluginId,
          manifest: {
            ...ExampleManifests.eslintPlugin,
            agent: {
              type: 'invalid-agent-type',
            },
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
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('No executor available');
      });

      test('should validate plugin inputs', async () => {
        const mockPlugin = {
          id: mockPluginId,
          manifest: ExampleManifests.eslintPlugin,
          status: 'enabled',
        };

        const executionContext = {
          pluginId: mockPluginId,
          userId: mockUserId,
          sessionId: 'test-session',
          input: {
            // Missing required 'files' input
            config: { rules: {} },
          },
          config: {},
          metadata: {},
        };

        (pluginManager.getPlugin as jest.Mock).mockResolvedValue(mockPlugin);

        const result = await pluginRouter.executePlugin(executionContext);

        expect(result.success).toBe(false);
        expect(result.error?.message).toContain('Required input');
      });

      test('should handle disabled plugin', async () => {
        const mockPlugin = {
          id: mockPluginId,
          manifest: ExampleManifests.eslintPlugin,
          status: 'disabled',
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
        expect(result.error?.message).toContain('not enabled');
      });
    });

    describe('findPluginsForCapabilities', () => {
      test('should find plugins by capabilities', async () => {
        const mockPlugins = [
          {
            id: 'plugin-1',
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
            id: 'plugin-2',
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
        ];

        (pluginManager.listPlugins as jest.Mock).mockResolvedValue({
          plugins: mockPlugins,
          total: 2,
          hasMore: false,
        });

        const routingContext = {
          userId: mockUserId,
          capabilities: ['code_analysis'],
        };

        const plan = await pluginRouter.findPluginsForCapabilities(routingContext);

        expect(plan.plugins).toHaveLength(1);
        expect(plan.plugins[0].pluginId).toBe('plugin-1');
        expect(plan.totalEstimatedCost).toBeGreaterThan(0);
        expect(plan.totalEstimatedTime).toBeGreaterThan(0);
      });

      test('should handle plugin preferences', async () => {
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
            id: 'better-plugin',
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
        expect(plan.plugins[0].pluginId).toBe('preferred-plugin'); // Preferred plugin first
        expect(plan.plugins.find(p => p.pluginId === 'excluded-plugin')).toBeUndefined();
      });
    });

    describe('executePluginChain', () => {
      test('should execute plugins in sequence', async () => {
        const contexts = [
          {
            pluginId: 'plugin-1',
            userId: mockUserId,
            sessionId: 'test-session',
            input: { data: 'test1' },
            config: {},
            metadata: {},
          },
          {
            pluginId: 'plugin-2',
            userId: mockUserId,
            sessionId: 'test-session',
            input: { data: 'test2' },
            config: {},
            metadata: {},
          },
        ];

        // Mock successful executions
        jest.spyOn(pluginRouter, 'executePlugin')
          .mockResolvedValueOnce({
            success: true,
            output: { result: 'success1' },
            metadata: { executionTime: 1000 },
            logs: [],
          })
          .mockResolvedValueOnce({
            success: true,
            output: { result: 'success2' },
            metadata: { executionTime: 1500 },
            logs: [],
          });

        const results = await pluginRouter.executePluginChain(contexts, {
          parallel: false,
        });

        expect(results).toHaveLength(2);
        expect(results[0].success).toBe(true);
        expect(results[1].success).toBe(true);
        expect(pluginRouter.executePlugin).toHaveBeenCalledTimes(2);
      });

      test('should execute plugins in parallel', async () => {
        const contexts = [
          {
            pluginId: 'plugin-1',
            userId: mockUserId,
            sessionId: 'test-session',
            input: { data: 'test1' },
            config: {},
            metadata: {},
          },
          {
            pluginId: 'plugin-2',
            userId: mockUserId,
            sessionId: 'test-session',
            input: { data: 'test2' },
            config: {},
            metadata: {},
          },
        ];

        jest.spyOn(pluginRouter, 'executePlugin')
          .mockResolvedValue({
            success: true,
            output: { result: 'success' },
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

      test('should handle chain execution errors', async () => {
        const contexts = [
          {
            pluginId: 'plugin-1',
            userId: mockUserId,
            sessionId: 'test-session',
            input: { data: 'test1' },
            config: {},
            metadata: {},
          },
          {
            pluginId: 'plugin-2',
            userId: mockUserId,
            sessionId: 'test-session',
            input: { data: 'test2' },
            config: {},
            metadata: {},
          },
        ];

        jest.spyOn(pluginRouter, 'executePlugin')
          .mockResolvedValueOnce({
            success: false,
            error: { code: 'ERROR', message: 'Plugin failed' },
            metadata: { executionTime: 1000 },
            logs: [],
          })
          .mockResolvedValueOnce({
            success: true,
            output: { result: 'success' },
            metadata: { executionTime: 1000 },
            logs: [],
          });

        const results = await pluginRouter.executePluginChain(contexts, {
          parallel: false,
          continueOnError: false,
        });

        expect(results).toHaveLength(1); // Should stop on first error
        expect(results[0].success).toBe(false);
      });
    });
  });

  describe('End-to-End Plugin Workflow', () => {
    test('should complete full plugin lifecycle', async () => {
      const manifest = ExampleManifests.eslintPlugin;

      // 1. Install plugin
      const mockInstalledPlugin = {
        id: mockPluginId,
        name: manifest.name,
        enabled: false,
        manifest,
        executions: 0,
        avgExecutionTime: 0,
        errorRate: 0,
      };

      (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.plugin.create as jest.Mock).mockResolvedValue(mockInstalledPlugin);

      const installedPlugin = await pluginManager.installPlugin(manifest, mockUserId);
      expect(installedPlugin.manifest.name).toBe(manifest.name);

      // 2. Enable plugin
      const mockEnabledPlugin = { ...mockInstalledPlugin, enabled: true };
      (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(mockInstalledPlugin);
      (prisma.plugin.update as jest.Mock).mockResolvedValue(mockEnabledPlugin);

      const enabledPlugin = await pluginManager.enablePlugin(mockPluginId, mockUserId);
      expect(enabledPlugin.status).toBe('enabled');

      // 3. Execute plugin
      const executionContext = {
        pluginId: mockPluginId,
        userId: mockUserId,
        sessionId: 'test-session',
        input: { files: ['test.js'] },
        config: {},
        metadata: {},
      };

      const mockExecution = { id: 'execution-id', status: 'running' };

      (pluginManager.getPlugin as jest.Mock).mockResolvedValue({
        id: mockPluginId,
        manifest,
        status: 'enabled',
      });
      (prisma.pluginExecution.create as jest.Mock).mockResolvedValue(mockExecution);
      (prisma.pluginExecution.update as jest.Mock).mockResolvedValue(mockExecution);
      (pluginManager.updatePluginMetrics as jest.Mock).mockResolvedValue(undefined);

      const result = await pluginRouter.executePlugin(executionContext);
      expect(result.success).toBe(true);

      // 4. Check health
      (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(mockEnabledPlugin);
      (prisma.plugin.update as jest.Mock).mockResolvedValue(mockEnabledPlugin);

      const healthCheck = await pluginManager.checkPluginHealth(mockPluginId);
      expect(healthCheck.status).toBe('healthy');

      // 5. Disable and uninstall
      (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(mockEnabledPlugin);
      (prisma.plugin.update as jest.Mock).mockResolvedValue(mockInstalledPlugin);

      await pluginManager.disablePlugin(mockPluginId, mockUserId);

      (prisma.plugin.findUnique as jest.Mock).mockResolvedValue(mockInstalledPlugin);
      (prisma.plugin.delete as jest.Mock).mockResolvedValue(mockInstalledPlugin);

      await pluginManager.uninstallPlugin(mockPluginId, mockUserId);

      // Verify all operations were called
      expect(prisma.plugin.create).toHaveBeenCalled();
      expect(prisma.plugin.update).toHaveBeenCalled();
      expect(prisma.plugin.delete).toHaveBeenCalled();
      expect(prisma.pluginExecution.create).toHaveBeenCalled();
    });
  });
});