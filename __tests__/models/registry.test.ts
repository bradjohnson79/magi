/**
 * Model Registry Tests
 *
 * Tests model registry functionality including role-based selection,
 * version management, and admin operations for 2025 AI models.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ModelRegistry, ModelRole, ModelProvider, ModelConfig } from '@/services/models/registry';
import { prisma } from '@/lib/db';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    model: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

// Mock tracing
vi.mock('@/services/tracing/setup', () => ({
  withSpan: vi.fn((name, fn) => fn()),
  addSpanAttributes: vi.fn(),
  SPAN_ATTRIBUTES: {
    OPERATION_TYPE: 'operation.type',
    USER_ID: 'user.id',
    PROJECT_ID: 'project.id',
  },
}));

describe('Model Registry', () => {
  let registry: ModelRegistry;

  const mockModel: ModelConfig = {
    id: 'model-1',
    name: 'Claude',
    provider: ModelProvider.ANTHROPIC,
    role: ModelRole.CODE_ARCHITECT,
    version: '4.0',
    versionTag: 'claude-4.xx',
    config: {
      maxTokens: 8192,
      temperature: 0.1,
      apiKey: 'test-key',
    },
    capabilities: ['code_generation', 'security_analysis'],
    status: 'stable',
    isActive: true,
    createdAt: new Date('2025-01-01'),
    updatedAt: new Date('2025-01-01'),
  };

  const mockCanaryModel: ModelConfig = {
    id: 'model-2',
    name: 'GPT (OpenAI)',
    provider: ModelProvider.OPENAI,
    role: ModelRole.CONVERSATIONAL_UX,
    version: '5.0',
    versionTag: 'gpt-5.0',
    config: {
      maxTokens: 4096,
      temperature: 0.7,
    },
    capabilities: ['conversational_ui', 'natural_language'],
    status: 'canary',
    isActive: true,
    createdAt: new Date('2025-01-02'),
    updatedAt: new Date('2025-01-02'),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    registry = new ModelRegistry();

    // Clear cache for clean tests
    registry.clearCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Model Listing and Filtering', () => {
    beforeEach(() => {
      (prisma.model.findMany as any).mockResolvedValue([
        {
          id: mockModel.id,
          name: mockModel.name,
          provider: mockModel.provider,
          role: mockModel.role,
          version: mockModel.version,
          versionTag: mockModel.versionTag,
          config: mockModel.config,
          capabilities: mockModel.capabilities,
          status: mockModel.status,
          isActive: mockModel.isActive,
          createdAt: mockModel.createdAt,
          updatedAt: mockModel.updatedAt,
        },
        {
          id: mockCanaryModel.id,
          name: mockCanaryModel.name,
          provider: mockCanaryModel.provider,
          role: mockCanaryModel.role,
          version: mockCanaryModel.version,
          versionTag: mockCanaryModel.versionTag,
          config: mockCanaryModel.config,
          capabilities: mockCanaryModel.capabilities,
          status: mockCanaryModel.status,
          isActive: mockCanaryModel.isActive,
          createdAt: mockCanaryModel.createdAt,
          updatedAt: mockCanaryModel.updatedAt,
        },
      ]);
    });

    it('should list all active models', async () => {
      const models = await registry.getModels();

      expect(models).toHaveLength(2);
      expect(models[0]).toMatchObject({
        name: 'Claude',
        provider: ModelProvider.ANTHROPIC,
        versionTag: 'claude-4.xx',
      });
      expect(models[1]).toMatchObject({
        name: 'GPT (OpenAI)',
        provider: ModelProvider.OPENAI,
        versionTag: 'gpt-5.0',
      });
    });

    it('should filter models by provider', async () => {
      const models = await registry.getModels({
        provider: ModelProvider.ANTHROPIC,
      });

      expect(models).toHaveLength(1);
      expect(models[0].provider).toBe(ModelProvider.ANTHROPIC);
    });

    it('should filter models by role', async () => {
      const models = await registry.getModels({
        role: ModelRole.CODE_ARCHITECT,
      });

      expect(models).toHaveLength(1);
      expect(models[0].role).toBe(ModelRole.CODE_ARCHITECT);
    });

    it('should filter models by status', async () => {
      const stableModels = await registry.getModels({
        status: 'stable',
      });

      expect(stableModels).toHaveLength(1);
      expect(stableModels[0].status).toBe('stable');

      const canaryModels = await registry.getModels({
        status: 'canary',
      });

      expect(canaryModels).toHaveLength(1);
      expect(canaryModels[0].status).toBe('canary');
    });

    it('should filter models by version tag', async () => {
      const models = await registry.getModels({
        versionTag: 'claude-4.xx',
      });

      expect(models).toHaveLength(1);
      expect(models[0].versionTag).toBe('claude-4.xx');
    });

    it('should filter models by capabilities', async () => {
      const models = await registry.getModels({
        capabilities: ['code_generation'],
      });

      expect(models).toHaveLength(1);
      expect(models[0].capabilities).toContain('code_generation');
    });
  });

  describe('Role-Based Model Selection', () => {
    beforeEach(() => {
      (prisma.model.findMany as any).mockResolvedValue([
        {
          id: mockModel.id,
          name: mockModel.name,
          provider: mockModel.provider,
          role: mockModel.role,
          version: mockModel.version,
          versionTag: mockModel.versionTag,
          config: mockModel.config,
          capabilities: mockModel.capabilities,
          status: mockModel.status,
          isActive: mockModel.isActive,
          createdAt: mockModel.createdAt,
          updatedAt: mockModel.updatedAt,
        },
      ]);
    });

    it('should get model by role', async () => {
      const model = await registry.getModelByRole(ModelRole.CODE_ARCHITECT);

      expect(model).toBeDefined();
      expect(model?.role).toBe(ModelRole.CODE_ARCHITECT);
      expect(model?.name).toBe('Claude');
    });

    it('should prefer stable models over canary', async () => {
      (prisma.model.findMany as any)
        .mockResolvedValueOnce([]) // First call for stable models
        .mockResolvedValueOnce([   // Second call for canary models
          {
            id: mockCanaryModel.id,
            name: mockCanaryModel.name,
            provider: mockCanaryModel.provider,
            role: mockCanaryModel.role,
            version: mockCanaryModel.version,
            versionTag: mockCanaryModel.versionTag,
            config: mockCanaryModel.config,
            capabilities: mockCanaryModel.capabilities,
            status: mockCanaryModel.status,
            isActive: mockCanaryModel.isActive,
            createdAt: mockCanaryModel.createdAt,
            updatedAt: mockCanaryModel.updatedAt,
          },
        ]);

      const model = await registry.getModelByRole(ModelRole.CONVERSATIONAL_UX);

      expect(model).toBeDefined();
      expect(model?.status).toBe('canary');
      expect(model?.name).toBe('GPT (OpenAI)');
    });

    it('should return null if no models found for role', async () => {
      (prisma.model.findMany as any)
        .mockResolvedValueOnce([]) // No stable models
        .mockResolvedValueOnce([]); // No canary models

      const model = await registry.getModelByRole('NonExistentRole');

      expect(model).toBeNull();
    });

    it('should prefer specific version tag when requested', async () => {
      const multiVersionModels = [
        {
          ...mockModel,
          id: 'claude-v4',
          versionTag: 'claude-4.xx',
        },
        {
          ...mockModel,
          id: 'claude-v3',
          versionTag: 'claude-3.xx',
        },
      ];

      (prisma.model.findMany as any).mockResolvedValue(multiVersionModels);

      const model = await registry.getModelByRole(ModelRole.CODE_ARCHITECT, {
        preferredVersionTag: 'claude-3.xx',
      });

      expect(model).toBeDefined();
      expect(model?.versionTag).toBe('claude-3.xx');
    });
  });

  describe('Intelligent Model Selection', () => {
    beforeEach(() => {
      (prisma.model.findMany as any).mockResolvedValue([
        {
          id: mockModel.id,
          name: mockModel.name,
          provider: mockModel.provider,
          role: mockModel.role,
          version: mockModel.version,
          versionTag: mockModel.versionTag,
          config: mockModel.config,
          capabilities: mockModel.capabilities,
          status: mockModel.status,
          isActive: mockModel.isActive,
          createdAt: mockModel.createdAt,
          updatedAt: mockModel.updatedAt,
        },
        {
          id: mockCanaryModel.id,
          name: mockCanaryModel.name,
          provider: mockCanaryModel.provider,
          role: mockCanaryModel.role,
          version: mockCanaryModel.version,
          versionTag: mockCanaryModel.versionTag,
          config: mockCanaryModel.config,
          capabilities: mockCanaryModel.capabilities,
          status: mockCanaryModel.status,
          isActive: mockCanaryModel.isActive,
          createdAt: mockCanaryModel.createdAt,
          updatedAt: mockCanaryModel.updatedAt,
        },
      ]);
    });

    it('should select model by role when specified', async () => {
      const model = await registry.selectModel({
        role: ModelRole.CODE_ARCHITECT,
      });

      expect(model).toBeDefined();
      expect(model?.role).toBe(ModelRole.CODE_ARCHITECT);
    });

    it('should score models by capability match', async () => {
      const model = await registry.selectModel({
        capabilities: ['code_generation', 'security_analysis'],
      });

      expect(model).toBeDefined();
      expect(model?.capabilities).toContain('code_generation');
      expect(model?.capabilities).toContain('security_analysis');
    });

    it('should return first available model when no specific criteria', async () => {
      const model = await registry.selectModel({});

      expect(model).toBeDefined();
      expect(model?.isActive).toBe(true);
    });

    it('should handle provider-specific selection', async () => {
      const model = await registry.selectModel({
        provider: ModelProvider.OPENAI,
      });

      expect(model).toBeDefined();
      expect(model?.provider).toBe(ModelProvider.OPENAI);
    });
  });

  describe('Model Management', () => {
    it('should add new model to registry', async () => {
      const newModelData = {
        name: 'Gemini',
        provider: ModelProvider.GOOGLE,
        role: ModelRole.MULTIMODAL_DESIGNER,
        version: '2.5',
        versionTag: 'gemini-2.5-pro',
        config: { temperature: 0.4 },
        capabilities: ['multimodal_processing', 'image_generation'],
        status: 'canary' as const,
      };

      (prisma.model.create as any).mockResolvedValue({
        id: 'new-model-id',
        ...newModelData,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const model = await registry.addModel(newModelData);

      expect(model).toBeDefined();
      expect(model?.name).toBe('Gemini');
      expect(model?.versionTag).toBe('gemini-2.5-pro');
      expect(prisma.model.create).toHaveBeenCalledWith({
        data: {
          ...newModelData,
          isActive: true,
        },
      });
    });

    it('should update model configuration', async () => {
      const modelId = 'model-1';
      const updates = {
        config: { temperature: 0.2, maxTokens: 4096 },
        status: 'stable' as const,
        versionTag: 'claude-4.2',
      };

      (prisma.model.update as any).mockResolvedValue({
        id: modelId,
        ...mockModel,
        ...updates,
        updatedAt: new Date(),
      });

      const updatedModel = await registry.updateModel(modelId, updates);

      expect(updatedModel.config.temperature).toBe(0.2);
      expect(updatedModel.status).toBe('stable');
      expect(updatedModel.versionTag).toBe('claude-4.2');
      expect(prisma.model.update).toHaveBeenCalledWith({
        where: { id: modelId },
        data: updates,
      });
    });

    it('should get specific model by ID', async () => {
      (prisma.model.findUnique as any).mockResolvedValue({
        id: mockModel.id,
        name: mockModel.name,
        provider: mockModel.provider,
        role: mockModel.role,
        version: mockModel.version,
        versionTag: mockModel.versionTag,
        config: mockModel.config,
        capabilities: mockModel.capabilities,
        status: mockModel.status,
        isActive: mockModel.isActive,
        createdAt: mockModel.createdAt,
        updatedAt: mockModel.updatedAt,
      });

      const model = await registry.getModel('model-1');

      expect(model).toBeDefined();
      expect(model?.id).toBe('model-1');
      expect(model?.name).toBe('Claude');
    });

    it('should set model active/inactive status', async () => {
      const modelId = 'model-1';

      (prisma.model.update as any).mockResolvedValue({
        id: modelId,
        isActive: false,
      });

      await registry.setModelActive(modelId, false);

      expect(prisma.model.update).toHaveBeenCalledWith({
        where: { id: modelId },
        data: { isActive: false },
      });
    });
  });

  describe('Model Promotion and Status Management', () => {
    it('should promote canary model to stable', async () => {
      // Mock current canary model
      (prisma.model.findMany as any).mockResolvedValue([mockCanaryModel]);

      // Mock the registry methods for finding models
      registry.getModel = vi.fn().mockResolvedValue(mockCanaryModel);
      registry.getStableModels = vi.fn().mockResolvedValue([mockModel]);

      // Mock transaction
      (prisma.$transaction as any).mockImplementation(async (callback) => {
        return await callback({
          model: {
            update: vi.fn().mockResolvedValue({}),
          },
        });
      });

      // Mock sync method
      registry.syncFromDatabase = vi.fn().mockResolvedValue(undefined);

      const result = await registry.promoteCanaryToStable('model-2');

      expect(result.success).toBe(true);
      expect(result.message).toContain('Successfully promoted');
    });

    it('should fail to promote non-canary model', async () => {
      registry.getModel = vi.fn().mockResolvedValue(mockModel); // Stable model

      const result = await registry.promoteCanaryToStable('model-1');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not in canary status');
    });

    it('should update model status', async () => {
      (prisma.model.update as any).mockResolvedValue({
        id: 'model-1',
        status: 'disabled',
        updatedAt: new Date(),
      });

      const success = await registry.updateModelStatus('model-1', 'disabled');

      expect(success).toBe(true);
      expect(prisma.model.update).toHaveBeenCalledWith({
        where: { id: 'model-1' },
        data: { status: 'disabled' },
      });
    });
  });

  describe('Model Statistics and Analytics', () => {
    beforeEach(() => {
      (prisma.model.findMany as any).mockResolvedValue([
        mockModel,
        mockCanaryModel,
        {
          ...mockModel,
          id: 'model-3',
          name: 'Disabled Model',
          status: 'disabled',
        },
      ]);
    });

    it('should get model statistics', async () => {
      const stats = await registry.getModelStats();

      expect(stats.total).toBe(3);
      expect(stats.byStatus.stable).toBe(1);
      expect(stats.byStatus.canary).toBe(1);
      expect(stats.byStatus.disabled).toBe(1);
      expect(stats.byProvider[ModelProvider.ANTHROPIC]).toBe(2);
      expect(stats.byProvider[ModelProvider.OPENAI]).toBe(1);
    });

    it('should group models by role', async () => {
      const modelsByRole = await registry.getModelsByRole();

      expect(modelsByRole[ModelRole.CODE_ARCHITECT]).toHaveLength(2);
      expect(modelsByRole[ModelRole.CONVERSATIONAL_UX]).toHaveLength(1);

      // Should be sorted by status priority (stable first)
      const codeArchitectModels = modelsByRole[ModelRole.CODE_ARCHITECT];
      expect(codeArchitectModels[0].status).toBe('stable');
      expect(codeArchitectModels[1].status).toBe('disabled');
    });
  });

  describe('Cache Management', () => {
    it('should cache models and serve from cache', async () => {
      (prisma.model.findMany as any).mockResolvedValue([mockModel]);

      // First call should hit database
      const models1 = await registry.getModels();
      expect(prisma.model.findMany).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const models2 = await registry.getModels();
      expect(prisma.model.findMany).toHaveBeenCalledTimes(1); // Still 1
      expect(models1).toEqual(models2);
    });

    it('should refresh cache when expired', async () => {
      // Mock time to simulate cache expiry
      const originalDate = Date.now;
      let mockTime = 0;
      Date.now = vi.fn(() => mockTime);

      (prisma.model.findMany as any).mockResolvedValue([mockModel]);

      // First call
      await registry.getModels();
      expect(prisma.model.findMany).toHaveBeenCalledTimes(1);

      // Advance time beyond cache TTL (5 minutes)
      mockTime += 6 * 60 * 1000;

      // Second call should refresh cache
      await registry.getModels();
      expect(prisma.model.findMany).toHaveBeenCalledTimes(2);

      Date.now = originalDate;
    });

    it('should provide cache info', () => {
      const cacheInfo = registry.getCacheInfo();

      expect(cacheInfo).toHaveProperty('size');
      expect(cacheInfo).toHaveProperty('lastSync');
      expect(cacheInfo).toHaveProperty('isStale');
      expect(typeof cacheInfo.isStale).toBe('boolean');
    });

    it('should clear cache manually', () => {
      registry.clearCache();
      const cacheInfo = registry.getCacheInfo();

      expect(cacheInfo.size).toBe(0);
      expect(cacheInfo.lastSync).toBeNull();
      expect(cacheInfo.isStale).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (prisma.model.findMany as any).mockRejectedValue(new Error('Database error'));

      const models = await registry.getModels();

      expect(models).toEqual([]);
    });

    it('should handle model not found in getModel', async () => {
      (prisma.model.findUnique as any).mockResolvedValue(null);

      const model = await registry.getModel('nonexistent');

      expect(model).toBeNull();
    });

    it('should handle promotion errors', async () => {
      registry.getModel = vi.fn().mockResolvedValue(null);

      const result = await registry.promoteCanaryToStable('nonexistent');

      expect(result.success).toBe(false);
      expect(result.message).toContain('not found');
    });

    it('should handle update errors', async () => {
      (prisma.model.update as any).mockRejectedValue(new Error('Update failed'));

      await expect(registry.updateModel('model-1', { status: 'stable' }))
        .rejects.toThrow('Update failed');
    });
  });

  describe('Version Tag Management', () => {
    it('should handle models with version tags', async () => {
      const modelsWithVersions = [
        {
          ...mockModel,
          versionTag: 'claude-4.1',
        },
        {
          ...mockModel,
          id: 'model-v2',
          versionTag: 'claude-4.2',
        },
      ];

      (prisma.model.findMany as any).mockResolvedValue(modelsWithVersions);

      const models = await registry.getModels({
        versionTag: 'claude-4.2',
      });

      expect(models).toHaveLength(1);
      expect(models[0].versionTag).toBe('claude-4.2');
    });

    it('should update version tag', async () => {
      (prisma.model.update as any).mockResolvedValue({
        ...mockModel,
        versionTag: 'claude-4.3',
        updatedAt: new Date(),
      });

      const updatedModel = await registry.updateModel('model-1', {
        versionTag: 'claude-4.3',
      });

      expect(updatedModel.versionTag).toBe('claude-4.3');
    });
  });
});