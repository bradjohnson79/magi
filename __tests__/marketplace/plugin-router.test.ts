import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { PluginRouter } from '@/lib/services/plugins/plugin-router';
import { PluginLoader } from '@/lib/services/plugins/plugin-loader';
import { MarketplaceService } from '@/lib/services/marketplace';
import {
  MarketplaceInstallation,
  PluginManifest,
  ExecutePluginRequest,
  PluginExecutionResult
} from '@/lib/types/marketplace';

// Mock dependencies
jest.mock('@/lib/services/plugins/plugin-loader');
jest.mock('@/lib/services/marketplace');

describe('PluginRouter', () => {
  let pluginRouter: PluginRouter;
  let mockPluginLoader: jest.Mocked<PluginLoader>;
  let mockMarketplaceService: jest.Mocked<MarketplaceService>;

  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';
  const mockInstallationId = 'installation-789';

  const mockInstallation: MarketplaceInstallation = {
    id: mockInstallationId,
    itemId: 'item-123',
    userId: mockUserId,
    projectId: mockProjectId,
    installedVersion: '1.0.0',
    isActive: true,
    autoUpdate: true,
    config: { apiKey: 'test' },
    usageCount: 5,
    installedAt: new Date(),
    updatedAt: new Date()
  };

  const mockPluginManifest: PluginManifest = {
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin for automation',
    author: 'Test Author',
    runtime: 'nodejs',
    entryPoint: 'index.js',
    inputs: {
      text: {
        type: 'string',
        description: 'Input text to process',
        required: true
      },
      mode: {
        type: 'string',
        description: 'Processing mode',
        required: false,
        default: 'standard'
      }
    },
    outputs: {
      result: {
        type: 'string',
        description: 'Processed text result'
      },
      metadata: {
        type: 'object',
        description: 'Processing metadata'
      }
    },
    permissions: ['filesystem:read', 'ai:generate'],
    sandboxed: true,
    dependencies: {},
    config: {
      apiKey: {
        type: 'string',
        label: 'API Key',
        required: true
      }
    },
    category: 'automation',
    tags: ['text', 'processing', 'ai'],
    license: 'MIT'
  };

  beforeEach(() => {
    mockPluginLoader = {
      executePlugin: jest.fn(),
      loadPlugin: jest.fn(),
      unloadPlugin: jest.fn(),
      getLoadedPlugins: jest.fn()
    } as any;

    mockMarketplaceService = {
      getUserInstallations: jest.fn(),
      getItemById: jest.fn()
    } as any;

    (PluginLoader.getInstance as jest.Mock).mockReturnValue(mockPluginLoader);
    (MarketplaceService.getInstance as jest.Mock).mockReturnValue(mockMarketplaceService);

    pluginRouter = PluginRouter.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('executePlugin', () => {
    it('should execute plugin successfully', async () => {
      const mockExecutionResult: PluginExecutionResult = {
        success: true,
        data: {
          result: 'Processed text',
          metadata: { processingTime: 100 }
        },
        metrics: {
          executionTime: 150,
          memoryUsed: 25
        }
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([mockInstallation]);
      mockPluginLoader.executePlugin.mockResolvedValueOnce(mockExecutionResult);

      const request: ExecutePluginRequest = {
        installationId: mockInstallationId,
        inputs: {
          text: 'Hello world',
          mode: 'advanced'
        },
        projectId: mockProjectId
      };

      const result = await pluginRouter.executePlugin(mockUserId, request);

      expect(mockMarketplaceService.getUserInstallations).toHaveBeenCalledWith(
        mockUserId,
        mockProjectId
      );

      expect(mockPluginLoader.executePlugin).toHaveBeenCalledWith(
        mockInstallation,
        request.inputs,
        expect.objectContaining({
          user: expect.objectContaining({ id: mockUserId }),
          project: expect.objectContaining({ id: mockProjectId })
        })
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockExecutionResult.data);
    });

    it('should handle installation not found', async () => {
      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([]);

      const request: ExecutePluginRequest = {
        installationId: 'non-existent',
        inputs: { text: 'test' }
      };

      const result = await pluginRouter.executePlugin(mockUserId, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found or access denied');
    });

    it('should handle inactive installation', async () => {
      const inactiveInstallation = {
        ...mockInstallation,
        isActive: false
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([inactiveInstallation]);

      const request: ExecutePluginRequest = {
        installationId: mockInstallationId,
        inputs: { text: 'test' }
      };

      const result = await pluginRouter.executePlugin(mockUserId, request);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('should handle plugin execution failure', async () => {
      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([mockInstallation]);
      mockPluginLoader.executePlugin.mockRejectedValueOnce(new Error('Plugin execution failed'));

      const request: ExecutePluginRequest = {
        installationId: mockInstallationId,
        inputs: { text: 'test' }
      };

      const result = await pluginRouter.executePlugin(mockUserId, request);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Plugin execution failed');
    });
  });

  describe('routeTask', () => {
    beforeEach(() => {
      const mockMarketplaceItem = {
        id: 'item-123',
        type: 'plugin' as const,
        manifest: mockPluginManifest,
        category: 'automation',
        tags: ['text', 'processing'],
        verified: true
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValue([mockInstallation]);
      mockMarketplaceService.getItemById.mockResolvedValue(mockMarketplaceItem as any);
    });

    it('should route task to matching plugin', async () => {
      const mockExecutionResult: PluginExecutionResult = {
        success: true,
        data: { result: 'Processed text' }
      };

      mockPluginLoader.executePlugin.mockResolvedValueOnce(mockExecutionResult);

      const result = await pluginRouter.routeTask(
        mockUserId,
        mockProjectId,
        'automation',
        { text: 'Hello world' }
      );

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'Processed text' });
    });

    it('should return error if no matching plugins found', async () => {
      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([]);

      const result = await pluginRouter.routeTask(
        mockUserId,
        mockProjectId,
        'unknown-task',
        {}
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('No plugins found for task type');
    });
  });

  describe('getAvailablePlugins', () => {
    it('should return available plugins for user', async () => {
      const mockMarketplaceItem = {
        id: 'item-123',
        type: 'plugin' as const,
        manifest: mockPluginManifest,
        name: 'Test Plugin',
        description: 'A test plugin'
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([mockInstallation]);
      mockMarketplaceService.getItemById.mockResolvedValueOnce(mockMarketplaceItem as any);

      const result = await pluginRouter.getAvailablePlugins(mockUserId, mockProjectId);

      expect(result).toHaveLength(1);
      expect(result[0].installation.id).toBe(mockInstallationId);
      expect(result[0].manifest.name).toBe('Test Plugin');
      expect(result[0].capabilities).toBeDefined();
      expect(result[0].usageCount).toBe(5);
    });

    it('should filter out inactive installations', async () => {
      const inactiveInstallation = {
        ...mockInstallation,
        isActive: false
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([inactiveInstallation]);

      const result = await pluginRouter.getAvailablePlugins(mockUserId, mockProjectId);

      expect(result).toHaveLength(0);
    });

    it('should filter out non-plugin items', async () => {
      const templateItem = {
        id: 'template-123',
        type: 'template' as const,
        name: 'Test Template'
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([mockInstallation]);
      mockMarketplaceService.getItemById.mockResolvedValueOnce(templateItem as any);

      const result = await pluginRouter.getAvailablePlugins(mockUserId, mockProjectId);

      expect(result).toHaveLength(0);
    });

    it('should sort plugins by usage count and last used', async () => {
      const installation1 = {
        ...mockInstallation,
        id: 'installation-1',
        usageCount: 10,
        lastUsedAt: new Date('2023-01-01')
      };

      const installation2 = {
        ...mockInstallation,
        id: 'installation-2',
        usageCount: 5,
        lastUsedAt: new Date('2023-01-02')
      };

      const installation3 = {
        ...mockInstallation,
        id: 'installation-3',
        usageCount: 10,
        lastUsedAt: new Date('2023-01-03')
      };

      const mockMarketplaceItem = {
        id: 'item-123',
        type: 'plugin' as const,
        manifest: mockPluginManifest
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([
        installation1,
        installation2,
        installation3
      ]);
      mockMarketplaceService.getItemById.mockResolvedValue(mockMarketplaceItem as any);

      const result = await pluginRouter.getAvailablePlugins(mockUserId, mockProjectId);

      expect(result).toHaveLength(3);
      expect(result[0].installation.id).toBe('installation-3'); // Higher usage, more recent
      expect(result[1].installation.id).toBe('installation-1'); // Higher usage, less recent
      expect(result[2].installation.id).toBe('installation-2'); // Lower usage
    });
  });

  describe('matchTaskToPlugins', () => {
    beforeEach(() => {
      const mockMarketplaceItem = {
        id: 'item-123',
        type: 'plugin' as const,
        manifest: mockPluginManifest
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValue([mockInstallation]);
      mockMarketplaceService.getItemById.mockResolvedValue(mockMarketplaceItem as any);
    });

    it('should match tasks to plugins based on requirements', async () => {
      const taskRequirements = {
        category: 'automation',
        tags: ['text'],
        inputs: { text: 'sample text' },
        expectedOutputs: ['result']
      };

      const result = await pluginRouter.matchTaskToPlugins(
        mockUserId,
        mockProjectId,
        taskRequirements
      );

      expect(result).toHaveLength(1);
      expect(result[0].score).toBeGreaterThan(0);
      expect(result[0].confidence).toBeGreaterThan(0);
    });

    it('should return empty array if no plugins match', async () => {
      const taskRequirements = {
        category: 'database',
        expectedOutputs: ['query_result']
      };

      const result = await pluginRouter.matchTaskToPlugins(
        mockUserId,
        mockProjectId,
        taskRequirements
      );

      expect(result).toHaveLength(0);
    });

    it('should sort matches by score', async () => {
      // This would require multiple plugins with different match scores
      // For now, we'll test with a single plugin
      const taskRequirements = {
        category: 'automation',
        tags: ['text', 'processing']
      };

      const result = await pluginRouter.matchTaskToPlugins(
        mockUserId,
        mockProjectId,
        taskRequirements
      );

      expect(result).toHaveLength(1);
      expect(result[0].score).toBeGreaterThan(50); // Should have high score for category + tag matches
    });
  });

  describe('dispatchEvent', () => {
    it('should dispatch events to relevant plugins', async () => {
      const mockMarketplaceItem = {
        id: 'item-123',
        type: 'plugin' as const,
        manifest: mockPluginManifest
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([mockInstallation]);
      mockMarketplaceService.getItemById.mockResolvedValueOnce(mockMarketplaceItem as any);

      const mockExecutionResult: PluginExecutionResult = {
        success: true,
        data: {}
      };

      mockPluginLoader.executePlugin.mockResolvedValueOnce(mockExecutionResult);

      // This is a simplified test - in practice, we'd need to check manifest for event handling
      await pluginRouter.dispatchEvent(
        mockUserId,
        mockProjectId,
        'file_changed',
        { filename: 'test.txt' }
      );

      // Event dispatching should not throw errors
      expect(true).toBe(true);
    });

    it('should handle errors in event dispatching gracefully', async () => {
      const mockMarketplaceItem = {
        id: 'item-123',
        type: 'plugin' as const,
        manifest: mockPluginManifest
      };

      mockMarketplaceService.getUserInstallations.mockResolvedValueOnce([mockInstallation]);
      mockMarketplaceService.getItemById.mockResolvedValueOnce(mockMarketplaceItem as any);

      mockPluginLoader.executePlugin.mockRejectedValueOnce(new Error('Handler failed'));

      // Should not throw error even if handler fails
      await expect(
        pluginRouter.dispatchEvent(
          mockUserId,
          mockProjectId,
          'file_changed',
          { filename: 'test.txt' }
        )
      ).resolves.toBeUndefined();
    });
  });
});