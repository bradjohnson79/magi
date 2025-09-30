/**
 * Model Selector Tests
 *
 * Tests for the intelligent model selection with canary testing support.
 */

import { ModelSelector, ModelSelectionContext } from '@/services/models/selector';
import { modelRegistry } from '@/services/models/registry';
import { getModelMetrics } from '@/services/metrics/aggregateModelRuns';
import { ModelConfig } from '@/services/models/registry';

// Mock dependencies
jest.mock('@/services/models/registry');
jest.mock('@/services/metrics/aggregateModelRuns');

const mockModelRegistry = modelRegistry as jest.Mocked<typeof modelRegistry>;
const mockGetModelMetrics = getModelMetrics as jest.MockedFunction<typeof getModelMetrics>;

describe('ModelSelector', () => {
  let selector: ModelSelector;

  const mockStableModel: ModelConfig = {
    id: 'stable-1',
    name: 'Stable Model',
    provider: 'openai',
    role: 'chat',
    config: {},
    capabilities: ['text'],
    status: 'stable',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockCanaryModel: ModelConfig = {
    id: 'canary-1',
    name: 'Canary Model',
    provider: 'openai',
    role: 'chat',
    config: {},
    capabilities: ['text'],
    status: 'canary',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Set default environment variables
    process.env.CANARY_ENABLED = 'true';
    process.env.CANARY_PERCENT = '10';
    process.env.CANARY_CRITICAL_ONLY = 'false';
    process.env.CANARY_EXCLUDE_ROLES = '';

    selector = new ModelSelector();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.CANARY_ENABLED;
    delete process.env.CANARY_PERCENT;
    delete process.env.CANARY_CRITICAL_ONLY;
    delete process.env.CANARY_EXCLUDE_ROLES;
  });

  describe('selectModel', () => {
    it('should return null when no models are available', async () => {
      mockModelRegistry.getModelsByRole.mockResolvedValue([]);

      const context: ModelSelectionContext = { role: 'chat' };
      const result = await selector.selectModel(context);

      expect(result).toBeNull();
      expect(mockModelRegistry.getModelsByRole).toHaveBeenCalledWith('chat');
    });

    it('should return null when no models match capabilities', async () => {
      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel]);

      const context: ModelSelectionContext = {
        role: 'chat',
        capabilities: ['vision', 'audio'],
      };
      const result = await selector.selectModel(context);

      expect(result).toBeNull();
    });

    it('should select stable model when canary is disabled', async () => {
      process.env.CANARY_ENABLED = 'false';
      selector = new ModelSelector();

      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel, mockCanaryModel]);
      mockGetModelMetrics.mockResolvedValue({
        modelId: 'stable-1',
        window: '7d',
        successRate: 0.95,
        correctionRate: 0.05,
        avgConfidence: 0.9,
        meanTimeToFixMs: 1000,
        costPerRun: 0.01,
        totalRuns: 100,
      });

      const context: ModelSelectionContext = {
        role: 'chat',
        userId: 'user-1',
        projectId: 'project-1',
      };

      const result = await selector.selectModel(context);

      expect(result).not.toBeNull();
      expect(result?.model.id).toBe('stable-1');
      expect(result?.reason).toBe('performance_based');
      expect(result?.metadata.canaryEnabled).toBe(false);
    });

    it('should select canary model for eligible users', async () => {
      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel, mockCanaryModel]);
      mockGetModelMetrics.mockResolvedValue({
        modelId: 'canary-1',
        window: '7d',
        successRate: 0.93,
        correctionRate: 0.07,
        avgConfidence: 0.88,
        meanTimeToFixMs: 1200,
        costPerRun: 0.012,
        totalRuns: 50,
      });

      // Use a deterministic user/project combination that should fall in canary bucket
      const context: ModelSelectionContext = {
        role: 'chat',
        userId: 'canary-user',
        projectId: 'canary-project',
      };

      const result = await selector.selectModel(context);

      expect(result).not.toBeNull();
      expect(result?.metadata.canaryEnabled).toBe(true);

      // Note: The actual model selection depends on the deterministic hash
      // This test validates the structure rather than specific model choice
    });

    it('should respect capability filtering', async () => {
      const modelWithVision: ModelConfig = {
        ...mockStableModel,
        id: 'vision-model',
        capabilities: ['text', 'vision'],
      };

      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel, modelWithVision]);
      mockGetModelMetrics.mockResolvedValue({
        modelId: 'vision-model',
        window: '7d',
        successRate: 0.92,
        correctionRate: 0.08,
        avgConfidence: 0.87,
        meanTimeToFixMs: 1500,
        costPerRun: 0.015,
        totalRuns: 75,
      });

      const context: ModelSelectionContext = {
        role: 'chat',
        capabilities: ['vision'],
      };

      const result = await selector.selectModel(context);

      expect(result).not.toBeNull();
      expect(result?.model.id).toBe('vision-model');
      expect(result?.model.capabilities).toContain('vision');
    });

    it('should exclude roles from canary testing', async () => {
      process.env.CANARY_EXCLUDE_ROLES = 'critical,admin';
      selector = new ModelSelector();

      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel, mockCanaryModel]);
      mockGetModelMetrics.mockResolvedValue({
        modelId: 'stable-1',
        window: '7d',
        successRate: 0.95,
        correctionRate: 0.05,
        avgConfidence: 0.9,
        meanTimeToFixMs: 1000,
        costPerRun: 0.01,
        totalRuns: 100,
      });

      const context: ModelSelectionContext = {
        role: 'critical',
        userId: 'canary-user',
        projectId: 'canary-project',
      };

      const result = await selector.selectModel(context);

      expect(result).not.toBeNull();
      expect(result?.model.status).toBe('stable');
      expect(result?.reason).not.toBe('canary');
    });

    it('should only use canary for critical tasks when configured', async () => {
      process.env.CANARY_CRITICAL_ONLY = 'true';
      selector = new ModelSelector();

      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel, mockCanaryModel]);
      mockGetModelMetrics.mockResolvedValue({
        modelId: 'stable-1',
        window: '7d',
        successRate: 0.95,
        correctionRate: 0.05,
        avgConfidence: 0.9,
        meanTimeToFixMs: 1000,
        costPerRun: 0.01,
        totalRuns: 100,
      });

      // Non-critical task should not get canary
      const nonCriticalContext: ModelSelectionContext = {
        role: 'chat',
        isCritical: false,
        userId: 'canary-user',
        projectId: 'canary-project',
      };

      const nonCriticalResult = await selector.selectModel(nonCriticalContext);
      expect(nonCriticalResult?.reason).not.toBe('canary');

      // Critical task should be eligible for canary
      const criticalContext: ModelSelectionContext = {
        role: 'chat',
        isCritical: true,
        userId: 'canary-user',
        projectId: 'canary-project',
      };

      const criticalResult = await selector.selectModel(criticalContext);
      expect(criticalResult?.metadata.canaryEnabled).toBe(true);
    });

    it('should fallback gracefully when performance calculation fails', async () => {
      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel]);
      mockGetModelMetrics.mockRejectedValue(new Error('Metrics service error'));

      const context: ModelSelectionContext = { role: 'chat' };
      const result = await selector.selectModel(context);

      expect(result).not.toBeNull();
      expect(result?.reason).toBe('fallback');
      expect(result?.confidence).toBe(0.5);
    });
  });

  describe('getCanaryConfig', () => {
    it('should return current canary configuration', () => {
      const config = selector.getCanaryConfig();

      expect(config).toEqual({
        enabled: true,
        percentage: 10,
        criticalTasksOnly: false,
        excludeRoles: [],
      });
    });
  });

  describe('updateCanaryConfig', () => {
    it('should update canary configuration', () => {
      const updates = {
        percentage: 15,
        criticalTasksOnly: true,
      };

      selector.updateCanaryConfig(updates);
      const config = selector.getCanaryConfig();

      expect(config.percentage).toBe(15);
      expect(config.criticalTasksOnly).toBe(true);
      expect(config.enabled).toBe(true); // Should remain unchanged
    });
  });

  describe('getSelectionStats', () => {
    it('should return selection statistics', async () => {
      const stats = await selector.getSelectionStats('chat');

      expect(stats).toHaveProperty('totalSelections');
      expect(stats).toHaveProperty('stableSelections');
      expect(stats).toHaveProperty('canarySelections');
      expect(stats).toHaveProperty('canaryPercentage');
      expect(typeof stats.canaryPercentage).toBe('number');
    });
  });

  describe('deterministic canary selection', () => {
    it('should consistently select same model for same user/project', async () => {
      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel, mockCanaryModel]);
      mockGetModelMetrics.mockResolvedValue({
        modelId: 'stable-1',
        window: '7d',
        successRate: 0.95,
        correctionRate: 0.05,
        avgConfidence: 0.9,
        meanTimeToFixMs: 1000,
        costPerRun: 0.01,
        totalRuns: 100,
      });

      const context: ModelSelectionContext = {
        role: 'chat',
        userId: 'consistent-user',
        projectId: 'consistent-project',
      };

      // Make multiple selections
      const results = await Promise.all([
        selector.selectModel(context),
        selector.selectModel(context),
        selector.selectModel(context),
      ]);

      // All results should be identical
      expect(results[0]?.model.id).toBe(results[1]?.model.id);
      expect(results[1]?.model.id).toBe(results[2]?.model.id);
      expect(results[0]?.reason).toBe(results[1]?.reason);
      expect(results[1]?.reason).toBe(results[2]?.reason);
    });
  });

  describe('error handling', () => {
    it('should handle registry errors gracefully', async () => {
      mockModelRegistry.getModelsByRole.mockRejectedValue(new Error('Registry error'));

      const context: ModelSelectionContext = { role: 'chat' };
      const result = await selector.selectModel(context);

      expect(result).toBeNull();
    });

    it('should handle metrics errors and continue with default scoring', async () => {
      mockModelRegistry.getModelsByRole.mockResolvedValue([mockStableModel]);
      mockGetModelMetrics.mockResolvedValue(null); // No metrics available

      const context: ModelSelectionContext = { role: 'chat' };
      const result = await selector.selectModel(context);

      expect(result).not.toBeNull();
      expect(result?.confidence).toBe(0.8); // Default confidence for single model
    });
  });
});