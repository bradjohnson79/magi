/**
 * Self-Evolution Integration Tests
 *
 * End-to-end tests for the complete self-evolution loop.
 */

import { prisma } from '@/lib/db';
import { ModelMetricsAggregator } from '@/services/metrics/aggregateModelRuns';
import { ModelSelector } from '@/services/models/selector';
import { modelRegistry } from '@/services/models/registry';
import { privacyGovernanceService } from '@/services/privacy/scrub';
import { SchemaVerificationService } from '@/services/verification/verifySchema';

// Mock external dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    model: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    modelRun: {
      findMany: jest.fn(),
      aggregate: jest.fn(),
      count: jest.fn(),
    },
    modelMetrics: {
      upsert: jest.fn(),
      findFirst: jest.fn(),
    },
    feedback: {
      create: jest.fn(),
      aggregate: jest.fn(),
    },
    user: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('Self-Evolution Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Set up environment variables for testing
    process.env.CANARY_ENABLED = 'true';
    process.env.CANARY_PERCENT = '10';
    process.env.CANARY_CRITICAL_ONLY = 'false';
    process.env.CANARY_EXCLUDE_ROLES = '';
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.CANARY_ENABLED;
    delete process.env.CANARY_PERCENT;
    delete process.env.CANARY_CRITICAL_ONLY;
    delete process.env.CANARY_EXCLUDE_ROLES;
  });

  describe('Complete Evolution Cycle', () => {
    it('should complete full self-evolution cycle', async () => {
      // 1. Setup: Mock models in registry
      const stableModel = {
        id: 'stable-model-1',
        name: 'GPT-4 Stable',
        provider: 'openai',
        role: 'chat',
        status: 'stable',
        capabilities: ['text'],
        isActive: true,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const canaryModel = {
        id: 'canary-model-1',
        name: 'GPT-4 Canary',
        provider: 'openai',
        role: 'chat',
        status: 'canary',
        capabilities: ['text'],
        isActive: true,
        config: {},
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.model.findMany.mockResolvedValue([stableModel, canaryModel] as any);

      // 2. Model Selection: Should select based on canary rules
      const selector = new ModelSelector();
      const selectionResult = await selector.selectModel({
        role: 'chat',
        userId: 'test-user',
        projectId: 'test-project',
      });

      expect(selectionResult).not.toBeNull();
      expect(['stable-model-1', 'canary-model-1']).toContain(selectionResult?.model.id);

      // 3. Metrics Aggregation: Process model performance
      mockPrisma.modelRun.aggregate.mockResolvedValue({
        _count: { id: 100 },
        _avg: {
          confidence: 0.85,
          costUsd: 0.01,
          runtimeMs: 1500,
        },
      } as any);

      mockPrisma.modelRun.count.mockResolvedValue(90);
      mockPrisma.modelRun.findMany.mockResolvedValue([
        {
          feedback: [
            { correction: { field: 'value' } },
            { correction: null },
          ],
        },
      ] as any);

      mockPrisma.modelMetrics.upsert.mockResolvedValue({} as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const aggregator = new ModelMetricsAggregator();
      const aggregationResult = await aggregator.runAggregation();

      expect(aggregationResult.processedModels).toBe(2);
      expect(aggregationResult.totalMetrics).toBe(4); // 2 models × 2 windows
      expect(aggregationResult.errors).toHaveLength(0);

      // 4. Model Promotion: Canary to stable based on metrics
      mockPrisma.modelMetrics.findFirst.mockResolvedValue({
        modelId: 'canary-model-1',
        window: '7d',
        successRate: 0.95,
        correctionRate: 0.03,
        avgConfidence: 0.92,
        meanTimeToFixMs: 1200,
        costPerRun: 0.008,
        totalRuns: 150,
      } as any);

      // Mock transaction for promotion
      mockPrisma.$transaction.mockImplementation(async (callback) => {
        return await callback(mockPrisma);
      });

      const promotionResult = await modelRegistry.promoteCanaryToStable('canary-model-1');
      expect(promotionResult.success).toBe(true);

      // 5. Privacy Governance: Scrub non-consenting user data
      const nonConsentingUser = {
        id: 'user-1',
        clerkId: 'clerk-1',
        allowTraining: false,
        createdAt: new Date(),
      };

      mockPrisma.user.findMany.mockResolvedValue([nonConsentingUser] as any);
      mockPrisma.modelRun.findMany.mockResolvedValue([]);
      mockPrisma.feedback.count.mockResolvedValue(0);
      mockPrisma.telemetryEvent.count.mockResolvedValue(2);
      mockPrisma.telemetryEvent.deleteMany = jest.fn().mockResolvedValue({ count: 2 });

      const scrubResult = await privacyGovernanceService.scrubUserData();
      expect(scrubResult.scrubbed).toBeGreaterThan(0);
      expect(scrubResult.errors).toHaveLength(0);

      // 6. Schema Verification: Verify critical operations
      const verificationService = new SchemaVerificationService();

      // Mock model selector for verification
      const mockModelSelection = {
        model: {
          id: 'verifier-model',
          name: 'Schema Verifier',
          provider: 'openai',
          role: 'schema_verifier',
          capabilities: ['schema_verification'],
          status: 'stable' as const,
          isActive: true,
          config: {},
          version: '1.0',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        reason: 'stable' as const,
        confidence: 0.9,
        metadata: {
          candidateCount: 1,
          canaryEnabled: false,
          performanceConsidered: true,
          fallbackUsed: false,
        },
      };

      // Mock the selector to return verification model
      jest.spyOn(verificationService as any, 'selectModel').mockResolvedValue(mockModelSelection);

      // Mock model verification responses
      const mockModelCall = jest.fn()
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.95,
          reasoning: 'Safe table creation',
          suggestions: [],
        })
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.90,
          reasoning: 'Well-formed schema',
          suggestions: [],
        })
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.88,
          reasoning: 'Standard operation',
          suggestions: [],
        });

      (verificationService as any).callModel = mockModelCall;

      const schemaOperation = {
        type: 'CREATE_TABLE' as const,
        schema: {
          tableName: 'new_feature_table',
          columns: [
            { name: 'id', type: 'UUID', constraints: ['PRIMARY KEY'] },
            { name: 'feature_data', type: 'JSONB', constraints: [] },
          ],
        },
        metadata: {
          requester: 'system',
          reason: 'Model evolution requires new table',
          environment: 'staging',
        },
      };

      const verificationResult = await verificationService.verifySchemaOperation(schemaOperation);
      expect(verificationResult.approved).toBe(true);
      expect(verificationResult.confidence).toBeGreaterThan(0.9);

      // 7. Verify telemetry logging throughout the cycle
      expect(mockPrisma.telemetryEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: expect.stringMatching(/model_metrics_aggregation|schema_verification_completed/),
          }),
        })
      );
    });

    it('should handle partial failures gracefully', async () => {
      // Simulate scenario where some components fail but system continues

      // 1. Model selection succeeds
      mockPrisma.model.findMany.mockResolvedValue([
        {
          id: 'model-1',
          name: 'Test Model',
          status: 'stable',
          isActive: true,
          provider: 'openai',
          role: 'chat',
          capabilities: ['text'],
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);

      const selector = new ModelSelector();
      const selectionResult = await selector.selectModel({ role: 'chat' });
      expect(selectionResult).not.toBeNull();

      // 2. Metrics aggregation partially fails
      mockPrisma.modelRun.aggregate
        .mockResolvedValueOnce({
          _count: { id: 50 },
          _avg: { confidence: 0.8, costUsd: 0.01, runtimeMs: 1000 },
        } as any)
        .mockRejectedValueOnce(new Error('Database timeout'));

      const aggregator = new ModelMetricsAggregator();
      const aggregationResult = await aggregator.runAggregation();

      // Should continue despite partial failures
      expect(aggregationResult.processedModels).toBeGreaterThan(0);
      expect(aggregationResult.errors.length).toBeGreaterThan(0);

      // 3. Privacy governance continues to work
      mockPrisma.user.findMany.mockResolvedValue([]);
      const scrubResult = await privacyGovernanceService.scrubUserData();
      expect(scrubResult.errors).toHaveLength(0);
    });

    it('should maintain data consistency across operations', async () => {
      // Test that concurrent operations don't interfere with each other

      const promises = [
        // Concurrent model selections
        (async () => {
          mockPrisma.model.findMany.mockResolvedValue([
            {
              id: 'concurrent-model',
              name: 'Concurrent Test',
              status: 'stable',
              isActive: true,
              provider: 'openai',
              role: 'chat',
              capabilities: ['text'],
              config: {},
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ] as any);

          const selector = new ModelSelector();
          return await selector.selectModel({ role: 'chat', userId: 'user1' });
        })(),

        // Concurrent metrics aggregation
        (async () => {
          mockPrisma.modelRun.aggregate.mockResolvedValue({
            _count: { id: 25 },
            _avg: { confidence: 0.85, costUsd: 0.01, runtimeMs: 800 },
          } as any);
          mockPrisma.modelRun.count.mockResolvedValue(20);
          mockPrisma.modelRun.findMany.mockResolvedValue([]);
          mockPrisma.modelMetrics.upsert.mockResolvedValue({} as any);
          mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

          const aggregator = new ModelMetricsAggregator({ dryRun: true });
          return await aggregator.runAggregation();
        })(),

        // Concurrent privacy operation
        (async () => {
          mockPrisma.user.findMany.mockResolvedValue([]);
          return await privacyGovernanceService.scrubUserData({ dryRun: true });
        })(),
      ];

      const results = await Promise.all(promises);

      // All operations should complete successfully
      expect(results[0]).not.toBeNull(); // Model selection
      expect(results[1].errors).toHaveLength(0); // Metrics aggregation
      expect(results[2].errors).toHaveLength(0); // Privacy governance
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle large-scale metrics aggregation efficiently', async () => {
      // Simulate processing many models
      const manyModels = Array.from({ length: 50 }, (_, i) => ({
        id: `model-${i}`,
        name: `Model ${i}`,
      }));

      mockPrisma.model.findMany.mockResolvedValue(manyModels as any);
      mockPrisma.modelRun.aggregate.mockResolvedValue({
        _count: { id: 10 },
        _avg: { confidence: 0.8, costUsd: 0.01, runtimeMs: 1000 },
      } as any);
      mockPrisma.modelRun.count.mockResolvedValue(8);
      mockPrisma.modelRun.findMany.mockResolvedValue([]);
      mockPrisma.modelMetrics.upsert.mockResolvedValue({} as any);
      mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);

      const startTime = Date.now();
      const aggregator = new ModelMetricsAggregator({ batchSize: 10 });
      const result = await aggregator.runAggregation();
      const duration = Date.now() - startTime;

      expect(result.processedModels).toBe(50);
      expect(result.totalMetrics).toBe(100); // 50 models × 2 windows
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle concurrent model selections without conflicts', async () => {
      mockPrisma.model.findMany.mockResolvedValue([
        {
          id: 'shared-model',
          name: 'Shared Model',
          status: 'stable',
          isActive: true,
          provider: 'openai',
          role: 'chat',
          capabilities: ['text'],
          config: {},
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ] as any);

      const selector = new ModelSelector();

      // Simulate many concurrent selections
      const concurrentSelections = Array.from({ length: 20 }, (_, i) =>
        selector.selectModel({
          role: 'chat',
          userId: `user-${i}`,
          projectId: `project-${i}`,
        })
      );

      const results = await Promise.all(concurrentSelections);

      // All selections should succeed
      results.forEach(result => {
        expect(result).not.toBeNull();
        expect(result?.model.id).toBe('shared-model');
      });

      // Deterministic canary selection should be consistent for same user/project
      const consistentSelections = await Promise.all([
        selector.selectModel({ role: 'chat', userId: 'consistent-user', projectId: 'consistent-project' }),
        selector.selectModel({ role: 'chat', userId: 'consistent-user', projectId: 'consistent-project' }),
        selector.selectModel({ role: 'chat', userId: 'consistent-user', projectId: 'consistent-project' }),
      ]);

      expect(consistentSelections[0]?.model.id).toBe(consistentSelections[1]?.model.id);
      expect(consistentSelections[1]?.model.id).toBe(consistentSelections[2]?.model.id);
    });
  });

  describe('Error Recovery and Resilience', () => {
    it('should recover from database connection issues', async () => {
      // Simulate temporary database failure
      mockPrisma.model.findMany
        .mockRejectedValueOnce(new Error('Connection timeout'))
        .mockResolvedValueOnce([
          {
            id: 'recovery-model',
            name: 'Recovery Model',
            status: 'stable',
            isActive: true,
            provider: 'openai',
            role: 'chat',
            capabilities: ['text'],
            config: {},
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ] as any);

      const selector = new ModelSelector();

      // First call should handle the error gracefully
      const firstResult = await selector.selectModel({ role: 'chat' });
      expect(firstResult).toBeNull();

      // Second call should succeed after recovery
      const secondResult = await selector.selectModel({ role: 'chat' });
      expect(secondResult).not.toBeNull();
    });

    it('should handle resource exhaustion gracefully', async () => {
      // Simulate high load scenario
      mockPrisma.model.findMany.mockImplementation(async () => {
        // Simulate slow database response
        await new Promise(resolve => setTimeout(resolve, 100));
        throw new Error('Resource exhausted');
      });

      const selector = new ModelSelector();
      const aggregator = new ModelMetricsAggregator();

      // Operations should fail gracefully without crashing
      const selectionResult = await selector.selectModel({ role: 'chat' });
      expect(selectionResult).toBeNull();

      const aggregationResult = await aggregator.runAggregation();
      expect(aggregationResult.errors.length).toBeGreaterThan(0);
      expect(aggregationResult.processedModels).toBe(0);
    });
  });
});