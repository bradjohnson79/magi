import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CanaryModelService } from '@/services/evolution/canary-service';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

describe('CanaryModelService', () => {
  let canaryService: CanaryModelService;

  beforeEach(() => {
    canaryService = new CanaryModelService(mockPrisma);
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('Canary Deployment', () => {
    it('should deploy canary model successfully', async () => {
      const canaryModel = {
        name: 'GPT-4.5-Canary',
        version: '1.0.0',
        modelType: 'language' as const,
        configuration: {
          provider: 'openai',
          modelId: 'gpt-4.5-turbo',
          parameters: { temperature: 0.7, max_tokens: 2048 },
          endpoints: {
            inference: 'https://api.openai.com/v1/chat/completions',
            health: 'https://api.openai.com/v1/health',
            metrics: 'https://api.openai.com/v1/metrics',
          },
        },
        status: 'pending' as const,
        trafficPercentage: 10,
        metrics: {
          responseTime: { p50: 100, p95: 200, p99: 300, average: 120 },
          accuracy: 0.92,
          errorRate: 0.02,
          throughput: 150,
          latency: 80,
          tokenUsage: { input: 100000, output: 50000, cost: 25.50 },
          userSatisfaction: { rating: 4.5, feedback: 20, complaints: 1 },
          qualityMetrics: { coherence: 0.88, relevance: 0.91, factuality: 0.89, safety: 0.95 },
          resourceUsage: { cpu: 35, memory: 60, gpu: 45 },
        },
        comparisonBaseline: 'baseline-model-1',
        promotionCriteria: {
          minTestDuration: 24,
          minRequestCount: 1000,
          maxErrorRate: 0.05,
          minAccuracy: 0.85,
          maxLatencyIncrease: 20,
          minUserSatisfaction: 4.0,
          requiredImprovements: {
            responseTime: 10,
            accuracy: 2,
            errorRate: 20,
          },
          autoPromote: true,
          requiresManualApproval: false,
        },
        metadata: { creator: 'ai-team', environment: 'production' },
      };

      const mockCreatedCanary = {
        id: 'canary-123',
        ...canaryModel,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.canaryModel.create.mockResolvedValue(mockCreatedCanary as any);
      mockPrisma.canaryDeployment.create.mockResolvedValue({
        id: 'deployment-123',
        canaryId: 'canary-123',
        deploymentStrategy: 'canary',
        trafficSplit: { canary: 10, baseline: 90 },
        status: 'active',
        startedAt: new Date(),
        rollbackPlan: {},
        monitoring: {},
      });
      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'canary-123',
        status: 'testing',
        testingStartedAt: new Date(),
      });

      const result = await canaryService.deployCanaryModel(canaryModel);

      expect(result.id).toBe('canary-123');
      expect(result.name).toBe('GPT-4.5-Canary');
      expect(result.trafficPercentage).toBe(10);
      expect(mockPrisma.canaryModel.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: 'GPT-4.5-Canary',
          version: '1.0.0',
          modelType: 'language',
          status: 'pending',
          trafficPercentage: 10,
        }),
      });
    });

    it('should create deployment record with correct configuration', async () => {
      const canaryModel = {
        name: 'Test-Canary',
        version: '1.0.0',
        modelType: 'embedding' as const,
        configuration: {
          provider: 'anthropic',
          modelId: 'claude-3.5-sonnet',
          parameters: {},
          endpoints: {
            inference: 'https://api.anthropic.com/v1/messages',
            health: 'https://api.anthropic.com/v1/health',
            metrics: 'https://api.anthropic.com/v1/metrics',
          },
        },
        status: 'pending' as const,
        trafficPercentage: 5,
        metrics: {} as any,
        comparisonBaseline: 'baseline-model-2',
        promotionCriteria: {
          minTestDuration: 12,
          minRequestCount: 500,
          maxErrorRate: 0.03,
          minAccuracy: 0.9,
          maxLatencyIncrease: 15,
          minUserSatisfaction: 4.2,
          requiredImprovements: {},
          autoPromote: false,
          requiresManualApproval: true,
        },
        metadata: {},
      };

      mockPrisma.canaryModel.create.mockResolvedValue({
        id: 'canary-456',
        ...canaryModel,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any);

      mockPrisma.canaryDeployment.create.mockResolvedValue({
        id: 'deployment-456',
        canaryId: 'canary-456',
        deploymentStrategy: 'canary',
        trafficSplit: { canary: 5, baseline: 95 },
        status: 'deploying',
        startedAt: new Date(),
        rollbackPlan: {
          triggers: ['error_rate > 5%', 'latency > 2x baseline', 'user_complaints > 10'],
          automated: true,
          steps: ['Stop canary traffic', 'Rollback deployment', 'Notify team'],
        },
        monitoring: {
          alertThresholds: {
            errorRate: 0.05,
            latencyP99: 2000,
            accuracy: 0.8,
          },
          dashboardUrl: 'https://monitoring.magi.com/canary/canary-456',
          logStreams: ['canary-canary-456', 'model-embedding'],
        },
      });

      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'canary-456',
        status: 'testing',
      });

      await canaryService.deployCanaryModel(canaryModel);

      expect(mockPrisma.canaryDeployment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          canaryId: 'canary-456',
          deploymentStrategy: 'canary',
          trafficSplit: { canary: 5, baseline: 95 },
          rollbackPlan: expect.objectContaining({
            automated: true,
            triggers: expect.arrayContaining(['error_rate > 5%']),
          }),
        }),
      });
    });
  });

  describe('Canary Monitoring', () => {
    it('should monitor active canaries and update metrics', async () => {
      const activeCanaries = [
        {
          id: 'canary-active-1',
          name: 'Active Canary 1',
          status: 'testing',
          metrics: {},
        },
        {
          id: 'canary-active-2',
          name: 'Active Canary 2',
          status: 'testing',
          metrics: {},
        },
      ];

      mockPrisma.canaryModel.findMany.mockResolvedValue(activeCanaries as any);
      mockPrisma.canaryModel.update.mockResolvedValue({} as any);

      await (canaryService as any).loadActiveCanaries();
      await (canaryService as any).monitorCanaries();

      expect(mockPrisma.canaryModel.findMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['testing', 'active'] },
        },
      });

      expect(mockPrisma.canaryModel.update).toHaveBeenCalledTimes(2);
    });

    it('should collect and update metrics for canary models', async () => {
      const canary = {
        id: 'canary-metrics',
        name: 'Metrics Test Canary',
        status: 'testing' as const,
        metrics: {} as any,
      };

      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'canary-metrics',
        metrics: expect.any(Object),
        updatedAt: new Date(),
      });

      await (canaryService as any).collectMetrics(canary);
      await (canaryService as any).updateCanaryMetrics('canary-metrics', canary.metrics);

      expect(canary.metrics).toHaveProperty('responseTime');
      expect(canary.metrics).toHaveProperty('accuracy');
      expect(canary.metrics).toHaveProperty('errorRate');
      expect(canary.metrics.accuracy).toBeGreaterThan(0.8);
      expect(canary.metrics.errorRate).toBeLessThan(0.05);
    });
  });

  describe('Promotion Evaluation', () => {
    it('should promote canary when criteria are met', async () => {
      const canary = {
        id: 'canary-promote',
        name: 'Ready for Promotion',
        status: 'testing' as const,
        testingStartedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        promotionCriteria: {
          minTestDuration: 24,
          minRequestCount: 1000,
          maxErrorRate: 0.05,
          minAccuracy: 0.85,
          maxLatencyIncrease: 20,
          minUserSatisfaction: 4.0,
          requiredImprovements: {
            responseTime: 10,
            accuracy: 2,
            errorRate: 20,
          },
          autoPromote: true,
          requiresManualApproval: false,
        },
        metrics: {
          responseTime: { average: 90 },
          accuracy: 0.94,
          errorRate: 0.01,
          userSatisfaction: { rating: 4.3 },
        },
        comparisonBaseline: 'baseline-model',
      };

      const baseline = {
        id: 'baseline-model',
        metrics: {
          responseTime: { average: 100 },
          accuracy: 0.90,
          errorRate: 0.02,
          userSatisfaction: { rating: 4.1 },
        },
      };

      mockPrisma.canaryModel.findUnique.mockResolvedValue(baseline as any);
      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'canary-promote',
        status: 'promoted',
        promotedAt: new Date(),
      });
      mockPrisma.modelComparison.create.mockResolvedValue({
        id: 'comparison-1',
        canaryId: 'canary-promote',
        baselineId: 'baseline-model',
        recommendation: 'promote',
        confidence: 0.9,
      });

      const shouldPromote = await (canaryService as any).shouldPromoteCanary(canary);
      expect(shouldPromote.promote).toBe(true);
      expect(shouldPromote.reason).toBe('All promotion criteria met');

      if (shouldPromote.promote) {
        await canaryService.promoteCanary('canary-promote', shouldPromote.comparison!);

        expect(mockPrisma.canaryModel.update).toHaveBeenCalledWith({
          where: { id: 'canary-promote' },
          data: {
            status: 'promoted',
            promotedAt: expect.any(Date),
            updatedAt: expect.any(Date),
          },
        });
      }
    });

    it('should not promote canary with insufficient test duration', async () => {
      const canary = {
        id: 'canary-too-early',
        testingStartedAt: new Date(Date.now() - 12 * 60 * 60 * 1000), // 12 hours ago
        promotionCriteria: {
          minTestDuration: 24,
          maxErrorRate: 0.05,
          minAccuracy: 0.85,
          minUserSatisfaction: 4.0,
        },
        metrics: {
          accuracy: 0.95,
          errorRate: 0.01,
          userSatisfaction: { rating: 4.5 },
        },
      };

      const shouldPromote = await (canaryService as any).shouldPromoteCanary(canary);

      expect(shouldPromote.promote).toBe(false);
      expect(shouldPromote.reason).toContain('Test duration');
      expect(shouldPromote.reason).toContain('< required 24h');
    });

    it('should rollback canary with high error rate', async () => {
      const canary = {
        id: 'canary-high-errors',
        testingStartedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        promotionCriteria: {
          minTestDuration: 24,
          maxErrorRate: 0.05,
          minAccuracy: 0.85,
          minUserSatisfaction: 4.0,
        },
        metrics: {
          accuracy: 0.90,
          errorRate: 0.08, // Above threshold
          userSatisfaction: { rating: 4.2 },
        },
      };

      const shouldPromote = await (canaryService as any).shouldPromoteCanary(canary);

      expect(shouldPromote.promote).toBe(false);
      expect(shouldPromote.rollback).toBe(true);
      expect(shouldPromote.reason).toContain('Error rate');
      expect(shouldPromote.reason).toContain('8.00% > threshold 5.00%');
    });

    it('should rollback canary with low accuracy', async () => {
      const canary = {
        id: 'canary-low-accuracy',
        testingStartedAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        promotionCriteria: {
          minTestDuration: 24,
          maxErrorRate: 0.05,
          minAccuracy: 0.85,
          minUserSatisfaction: 4.0,
        },
        metrics: {
          accuracy: 0.80, // Below threshold
          errorRate: 0.02,
          userSatisfaction: { rating: 4.2 },
        },
      };

      const shouldPromote = await (canaryService as any).shouldPromoteCanary(canary);

      expect(shouldPromote.promote).toBe(false);
      expect(shouldPromote.rollback).toBe(true);
      expect(shouldPromote.reason).toContain('Accuracy');
      expect(shouldPromote.reason).toContain('80.00% < threshold 85.00%');
    });
  });

  describe('Model Comparison', () => {
    it('should compare canary with baseline model correctly', async () => {
      const canary = {
        id: 'canary-compare',
        testingStartedAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        comparisonBaseline: 'baseline-compare',
        metrics: {
          responseTime: { average: 80 },
          accuracy: 0.95,
          errorRate: 0.01,
          throughput: 160,
          qualityMetrics: {
            coherence: 0.92,
            relevance: 0.94,
            factuality: 0.91,
            safety: 0.96,
          },
          tokenUsage: { cost: 20 },
          userSatisfaction: { rating: 4.6 },
        },
      };

      const baseline = {
        id: 'baseline-compare',
        metrics: {
          responseTime: { average: 100 },
          accuracy: 0.90,
          errorRate: 0.02,
          throughput: 150,
          qualityMetrics: {
            coherence: 0.88,
            relevance: 0.90,
            factuality: 0.89,
            safety: 0.94,
          },
          tokenUsage: { cost: 25 },
          userSatisfaction: { rating: 4.2 },
        },
      };

      mockPrisma.canaryModel.findUnique.mockResolvedValue(baseline as any);

      const comparison = await (canaryService as any).compareWithBaseline(canary);

      expect(comparison.canaryId).toBe('canary-compare');
      expect(comparison.baselineId).toBe('baseline-compare');

      // Performance improvements
      expect(comparison.results.performanceDelta.responseTime).toBe(20); // 20% improvement
      expect(comparison.results.performanceDelta.accuracy).toBeCloseTo(5.56, 1); // ~5.56% improvement
      expect(comparison.results.performanceDelta.errorRate).toBe(-50); // 50% error reduction
      expect(comparison.results.performanceDelta.throughput).toBeCloseTo(6.67, 1); // ~6.67% improvement

      // Quality improvements
      expect(comparison.results.qualityDelta.coherence).toBeCloseTo(4.55, 1);
      expect(comparison.results.qualityDelta.relevance).toBeCloseTo(4.44, 1);
      expect(comparison.results.qualityDelta.factuality).toBeCloseTo(2.25, 1);
      expect(comparison.results.qualityDelta.safety).toBeCloseTo(2.13, 1);

      // Cost and user experience
      expect(comparison.results.costDelta.perRequest).toBe(-20); // 20% cost reduction
      expect(comparison.results.userExperienceDelta.satisfaction).toBeCloseTo(9.52, 1);

      expect(comparison.confidence).toBeGreaterThan(0.5);
    });

    it('should recommend promotion for significant improvements', async () => {
      const canary = {
        id: 'canary-excellent',
        comparisonBaseline: 'baseline-excellent',
        metrics: {
          responseTime: { average: 70 },
          accuracy: 0.96,
          errorRate: 0.005,
          throughput: 180,
          qualityMetrics: { coherence: 0.95, relevance: 0.96, factuality: 0.94, safety: 0.97 },
          tokenUsage: { cost: 18 },
          userSatisfaction: { rating: 4.8 },
        },
      };

      const baseline = {
        id: 'baseline-excellent',
        metrics: {
          responseTime: { average: 100 },
          accuracy: 0.88,
          errorRate: 0.03,
          throughput: 140,
          qualityMetrics: { coherence: 0.85, relevance: 0.87, factuality: 0.86, safety: 0.92 },
          tokenUsage: { cost: 25 },
          userSatisfaction: { rating: 4.1 },
        },
      };

      mockPrisma.canaryModel.findUnique.mockResolvedValue(baseline as any);

      const comparison = await (canaryService as any).compareWithBaseline(canary);

      expect(comparison.recommendation).toBe('promote');
      expect(comparison.reasoning).toContain('Significant accuracy improvement');
      expect(comparison.confidence).toBeGreaterThan(0.8);
    });

    it('should recommend rollback for poor performance', async () => {
      const canary = {
        id: 'canary-poor',
        comparisonBaseline: 'baseline-poor',
        metrics: {
          responseTime: { average: 200 },
          accuracy: 0.82,
          errorRate: 0.08,
          throughput: 80,
          qualityMetrics: { coherence: 0.80, relevance: 0.82, factuality: 0.81, safety: 0.90 },
          tokenUsage: { cost: 35 },
          userSatisfaction: { rating: 3.5 },
        },
      };

      const baseline = {
        id: 'baseline-poor',
        metrics: {
          responseTime: { average: 100 },
          accuracy: 0.90,
          errorRate: 0.02,
          throughput: 150,
          qualityMetrics: { coherence: 0.88, relevance: 0.90, factuality: 0.89, safety: 0.94 },
          tokenUsage: { cost: 25 },
          userSatisfaction: { rating: 4.2 },
        },
      };

      mockPrisma.canaryModel.findUnique.mockResolvedValue(baseline as any);

      const comparison = await (canaryService as any).compareWithBaseline(canary);

      expect(comparison.recommendation).toBe('rollback');
      expect(comparison.reasoning).toContain('performance degradation');
      expect(comparison.confidence).toBeLessThan(0.3);
    });
  });

  describe('Rollback Operations', () => {
    it('should rollback canary and update status', async () => {
      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'canary-rollback',
        status: 'rolled_back',
        updatedAt: new Date(),
        metadata: {
          rollbackReason: 'High error rate detected',
          rollbackAt: new Date(),
        },
      });

      await (canaryService as any).rollbackCanary('canary-rollback', 'High error rate detected');

      expect(mockPrisma.canaryModel.update).toHaveBeenCalledWith({
        where: { id: 'canary-rollback' },
        data: {
          status: 'rolled_back',
          updatedAt: expect.any(Date),
          metadata: {
            rollbackReason: 'High error rate detected',
            rollbackAt: expect.any(Date),
          },
        },
      });
    });

    it('should flag canary for manual review when required', async () => {
      const comparison = {
        canaryId: 'canary-manual-review',
        recommendation: 'manual_review' as const,
        confidence: 0.6,
      };

      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'canary-manual-review',
        status: 'active',
        metadata: {
          requiresManualReview: true,
          comparisonResults: comparison,
          flaggedAt: new Date(),
        },
      });

      await (canaryService as any).flagForManualReview('canary-manual-review', comparison);

      expect(mockPrisma.canaryModel.update).toHaveBeenCalledWith({
        where: { id: 'canary-manual-review' },
        data: {
          status: 'active',
          metadata: {
            requiresManualReview: true,
            comparisonResults: comparison,
            flaggedAt: expect.any(Date),
          },
        },
      });
    });
  });

  describe('Data Retrieval', () => {
    it('should get active canaries', async () => {
      const activeCanaries = [
        { id: 'canary-1', status: 'testing', name: 'Test Canary 1' },
        { id: 'canary-2', status: 'active', name: 'Test Canary 2' },
      ];

      mockPrisma.canaryModel.findMany.mockResolvedValue(activeCanaries as any);

      const result = await canaryService.getActiveCanaries();

      expect(result).toEqual(activeCanaries);
      expect(mockPrisma.canaryModel.findMany).toHaveBeenCalledWith({
        where: {
          status: { in: ['testing', 'active'] },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should get canary history', async () => {
      const allCanaries = [
        { id: 'canary-1', status: 'promoted', name: 'Promoted Canary' },
        { id: 'canary-2', status: 'rolled_back', name: 'Failed Canary' },
        { id: 'canary-3', status: 'testing', name: 'Current Canary' },
      ];

      mockPrisma.canaryModel.findMany.mockResolvedValue(allCanaries as any);

      const result = await canaryService.getCanaryHistory();

      expect(result).toEqual(allCanaries);
      expect(mockPrisma.canaryModel.findMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should get model comparisons', async () => {
      const comparisons = [
        {
          id: 'comparison-1',
          canaryId: 'canary-1',
          baselineId: 'baseline-1',
          recommendation: 'promote',
          confidence: 0.9,
        },
        {
          id: 'comparison-2',
          canaryId: 'canary-2',
          baselineId: 'baseline-1',
          recommendation: 'rollback',
          confidence: 0.2,
        },
      ];

      mockPrisma.modelComparison.findMany.mockResolvedValue(comparisons as any);

      const result = await canaryService.getModelComparisons();

      expect(result).toEqual(comparisons);
      expect(mockPrisma.modelComparison.findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should get model comparisons for specific canary', async () => {
      const canaryComparisons = [
        {
          id: 'comparison-specific',
          canaryId: 'specific-canary',
          baselineId: 'baseline-1',
          recommendation: 'promote',
          confidence: 0.85,
        },
      ];

      mockPrisma.modelComparison.findMany.mockResolvedValue(canaryComparisons as any);

      const result = await canaryService.getModelComparisons('specific-canary');

      expect(result).toEqual(canaryComparisons);
      expect(mockPrisma.modelComparison.findMany).toHaveBeenCalledWith({
        where: { canaryId: 'specific-canary' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });

  describe('Service Lifecycle', () => {
    it('should start canary testing with monitoring', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');
      mockPrisma.canaryModel.findMany.mockResolvedValue([]);

      await canaryService.startCanaryTesting();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        60000 // 1 minute
      );

      setIntervalSpy.mockRestore();
    });

    it('should stop canary testing and clean up', async () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      await canaryService.stopCanaryTesting();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });
});