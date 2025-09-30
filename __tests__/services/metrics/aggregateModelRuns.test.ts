/**
 * Model Metrics Aggregation Tests
 *
 * Tests for computing and storing aggregated metrics for model performance tracking.
 */

import { ModelMetricsAggregator, getModelMetrics, compareModelMetrics } from '@/services/metrics/aggregateModelRuns';
import { prisma } from '@/lib/db';

// Mock Prisma
jest.mock('@/lib/db', () => ({
  prisma: {
    model: {
      findMany: jest.fn(),
    },
    modelRun: {
      aggregate: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    modelMetrics: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
    },
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('ModelMetricsAggregator', () => {
  let aggregator: ModelMetricsAggregator;

  beforeEach(() => {
    jest.clearAllMocks();
    aggregator = new ModelMetricsAggregator();
  });

  describe('runAggregation', () => {
    it('should process all active models', async () => {
      // Mock models to process
      mockPrisma.model.findMany.mockResolvedValue([
        { id: 'model-1', name: 'Model 1' },
        { id: 'model-2', name: 'Model 2' },
      ] as any);

      // Mock run statistics
      mockPrisma.modelRun.aggregate.mockResolvedValue({
        _count: { id: 100 },
        _avg: {
          confidence: 0.85,
          costUsd: 0.01,
          runtimeMs: 1500,
        },
      } as any);

      // Mock successful runs count
      mockPrisma.modelRun.count.mockResolvedValue(90);

      // Mock feedback runs
      mockPrisma.modelRun.findMany.mockResolvedValue([
        {
          feedback: [
            { correction: { field: 'value' } },
            { correction: null },
          ],
        },
        {
          feedback: [
            { correction: null },
          ],
        },
      ] as any);

      // Mock metrics storage
      mockPrisma.modelMetrics.upsert.mockResolvedValue({} as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await aggregator.runAggregation();

      expect(result.processedModels).toBe(2);
      expect(result.totalMetrics).toBe(4); // 2 models × 2 windows (7d, 30d)
      expect(result.errors).toHaveLength(0);

      // Verify metrics were stored
      expect(mockPrisma.modelMetrics.upsert).toHaveBeenCalledTimes(4);
    });

    it('should handle models with no runs', async () => {
      mockPrisma.model.findMany.mockResolvedValue([
        { id: 'model-1', name: 'Model 1' },
      ] as any);

      // Mock no runs
      mockPrisma.modelRun.aggregate.mockResolvedValue({
        _count: { id: 0 },
        _avg: {
          confidence: null,
          costUsd: null,
          runtimeMs: null,
        },
      } as any);

      mockPrisma.modelMetrics.upsert.mockResolvedValue({} as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await aggregator.runAggregation();

      expect(result.processedModels).toBe(1);
      expect(result.totalMetrics).toBe(2); // Still creates metrics with zeros
      expect(result.errors).toHaveLength(0);

      // Verify zero metrics were stored
      expect(mockPrisma.modelMetrics.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            totalRuns: 0,
            successRate: 0,
            correctionRate: 0,
            avgConfidence: 0,
            meanTimeToFixMs: 0,
            costPerRun: 0,
          }),
        })
      );
    });

    it('should calculate metrics correctly', async () => {
      mockPrisma.model.findMany.mockResolvedValue([
        { id: 'model-1', name: 'Model 1' },
      ] as any);

      // Mock 100 total runs, 90 successful
      mockPrisma.modelRun.aggregate.mockResolvedValue({
        _count: { id: 100 },
        _avg: {
          confidence: 0.85,
          costUsd: 0.01,
          runtimeMs: 1500,
        },
      } as any);

      mockPrisma.modelRun.count.mockResolvedValue(90);

      // Mock feedback: 2 corrections out of 3 feedback items
      mockPrisma.modelRun.findMany.mockResolvedValue([
        {
          feedback: [
            { correction: { field: 'value' } },
            { correction: { another: 'correction' } },
            { correction: null },
          ],
        },
      ] as any);

      mockPrisma.modelMetrics.upsert.mockResolvedValue({} as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await aggregator.runAggregation();

      expect(result.errors).toHaveLength(0);

      // Verify calculated metrics
      const upsertCall = mockPrisma.modelMetrics.upsert.mock.calls[0][0];
      expect(upsertCall.create).toMatchObject({
        successRate: 0.9, // 90/100
        correctionRate: expect.closeTo(0.67, 1), // 2/3 corrections
        avgConfidence: 0.85,
        costPerRun: 0.01,
        meanTimeToFixMs: 1500,
        totalRuns: 100,
      });
    });

    it('should respect user consent settings', async () => {
      const aggregatorWithConsent = new ModelMetricsAggregator({
        excludeNonConsenting: true,
      });

      mockPrisma.model.findMany.mockResolvedValue([
        { id: 'model-1', name: 'Model 1' },
      ] as any);

      mockPrisma.modelRun.aggregate.mockResolvedValue({
        _count: { id: 50 },
        _avg: { confidence: 0.8, costUsd: 0.005, runtimeMs: 1000 },
      } as any);

      mockPrisma.modelRun.count.mockResolvedValue(45);
      mockPrisma.modelRun.findMany.mockResolvedValue([]);
      mockPrisma.modelMetrics.upsert.mockResolvedValue({} as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      await aggregatorWithConsent.runAggregation();

      // Verify the query includes user consent filter
      expect(mockPrisma.modelRun.aggregate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            user: { allowTraining: true },
          }),
        })
      );
    });

    it('should handle errors gracefully', async () => {
      mockPrisma.model.findMany.mockResolvedValue([
        { id: 'model-1', name: 'Model 1' },
        { id: 'model-2', name: 'Model 2' },
      ] as any);

      // First model succeeds
      mockPrisma.modelRun.aggregate
        .mockResolvedValueOnce({
          _count: { id: 50 },
          _avg: { confidence: 0.8, costUsd: 0.005, runtimeMs: 1000 },
        } as any)
        // Second model fails
        .mockRejectedValueOnce(new Error('Database error'));

      mockPrisma.modelRun.count.mockResolvedValue(45);
      mockPrisma.modelRun.findMany.mockResolvedValue([]);
      mockPrisma.modelMetrics.upsert.mockResolvedValue({} as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await aggregator.runAggregation();

      expect(result.processedModels).toBe(1); // Only first model processed
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('model-2');
    });

    it('should support dry run mode', async () => {
      const dryRunAggregator = new ModelMetricsAggregator({ dryRun: true });

      mockPrisma.model.findMany.mockResolvedValue([
        { id: 'model-1', name: 'Model 1' },
      ] as any);

      mockPrisma.modelRun.aggregate.mockResolvedValue({
        _count: { id: 10 },
        _avg: { confidence: 0.9, costUsd: 0.01, runtimeMs: 500 },
      } as any);

      mockPrisma.modelRun.count.mockResolvedValue(9);
      mockPrisma.modelRun.findMany.mockResolvedValue([]);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const result = await dryRunAggregator.runAggregation();

      expect(result.processedModels).toBe(1);
      expect(result.totalMetrics).toBe(2);

      // Verify no metrics were actually stored in dry run
      expect(mockPrisma.modelMetrics.upsert).not.toHaveBeenCalled();
    });
  });

  describe('cleanupOldMetrics', () => {
    it('should delete old metrics beyond retention period', async () => {
      mockPrisma.modelMetrics.deleteMany.mockResolvedValue({ count: 150 });

      const deletedCount = await aggregator.cleanupOldMetrics(90);

      expect(deletedCount).toBe(150);
      expect(mockPrisma.modelMetrics.deleteMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            lt: expect.any(Date),
          },
        },
      });
    });

    it('should handle cleanup errors', async () => {
      mockPrisma.modelMetrics.deleteMany.mockRejectedValue(new Error('Cleanup failed'));

      await expect(aggregator.cleanupOldMetrics(90)).rejects.toThrow('Cleanup failed');
    });
  });
});

describe('getModelMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return metrics for a model', async () => {
    const mockMetrics = {
      modelId: 'model-1',
      window: '7d',
      successRate: 0.95,
      correctionRate: 0.05,
      avgConfidence: 0.9,
      meanTimeToFixMs: 1000,
      costPerRun: 0.01,
      totalRuns: 100,
    };

    mockPrisma.modelMetrics.findFirst.mockResolvedValue(mockMetrics as any);

    const result = await getModelMetrics('model-1', '7d');

    expect(result).toEqual(mockMetrics);
    expect(mockPrisma.modelMetrics.findFirst).toHaveBeenCalledWith({
      where: { modelId: 'model-1', window: '7d' },
      orderBy: { createdAt: 'desc' },
    });
  });

  it('should return null when no metrics found', async () => {
    mockPrisma.modelMetrics.findFirst.mockResolvedValue(null);

    const result = await getModelMetrics('nonexistent-model');

    expect(result).toBeNull();
  });

  it('should handle database errors', async () => {
    mockPrisma.modelMetrics.findFirst.mockRejectedValue(new Error('DB error'));

    const result = await getModelMetrics('model-1');

    expect(result).toBeNull();
  });
});

describe('compareModelMetrics', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should compare metrics for multiple models', async () => {
    const mockMetrics = [
      {
        modelId: 'model-1',
        window: '7d',
        successRate: 0.95,
        correctionRate: 0.05,
        avgConfidence: 0.9,
        meanTimeToFixMs: 1000,
        costPerRun: 0.01,
        totalRuns: 100,
      },
      {
        modelId: 'model-2',
        window: '7d',
        successRate: 0.92,
        correctionRate: 0.08,
        avgConfidence: 0.85,
        meanTimeToFixMs: 1200,
        costPerRun: 0.012,
        totalRuns: 80,
      },
    ];

    mockPrisma.modelMetrics.findMany.mockResolvedValue(mockMetrics as any);

    const result = await compareModelMetrics(['model-1', 'model-2'], '7d');

    expect(result).toHaveLength(2);
    expect(result[0].modelId).toBe('model-1');
    expect(result[1].modelId).toBe('model-2');
    expect(result[0].successRate).toBe(0.95);
    expect(result[1].successRate).toBe(0.92);
  });

  it('should handle empty results', async () => {
    mockPrisma.modelMetrics.findMany.mockResolvedValue([]);

    const result = await compareModelMetrics(['nonexistent-1', 'nonexistent-2']);

    expect(result).toEqual([]);
  });

  it('should handle comparison errors', async () => {
    mockPrisma.modelMetrics.findMany.mockRejectedValue(new Error('Comparison error'));

    const result = await compareModelMetrics(['model-1', 'model-2']);

    expect(result).toEqual([]);
  });
});