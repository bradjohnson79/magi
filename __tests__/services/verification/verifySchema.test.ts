/**
 * Schema Verification Tests
 *
 * Tests for ensemble verification of critical schema operations.
 */

import { SchemaVerificationService, EnsembleVerificationConfig } from '@/services/verification/verifySchema';
import { modelSelector } from '@/services/models/selector';
import { prisma } from '@/lib/db';

// Mock dependencies
jest.mock('@/services/models/selector');
jest.mock('@/lib/db', () => ({
  prisma: {
    telemetryEvent: {
      create: jest.fn(),
    },
  },
}));

const mockModelSelector = modelSelector as jest.Mocked<typeof modelSelector>;
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

describe('SchemaVerificationService', () => {
  let service: SchemaVerificationService;

  const mockModelSelection = {
    model: {
      id: 'model-1',
      name: 'Test Model',
      provider: 'openai',
      role: 'schema_verifier',
      version: '1.0',
      config: {},
      capabilities: ['schema_verification'],
      status: 'stable' as const,
      isActive: true,
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

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SchemaVerificationService();
    mockPrisma.telemetryEvent.create.mockResolvedValue({} as any);
  });

  describe('verifySchemaOperation', () => {
    const mockOperation = {
      type: 'CREATE_TABLE' as const,
      schema: {
        tableName: 'test_table',
        columns: [
          { name: 'id', type: 'UUID', constraints: ['PRIMARY KEY'] },
          { name: 'name', type: 'VARCHAR(255)', constraints: ['NOT NULL'] },
        ],
      },
      metadata: {
        requester: 'user-1',
        reason: 'Adding new feature',
        environment: 'staging',
      },
    };

    it('should verify safe schema operation successfully', async () => {
      mockModelSelector.selectModel.mockResolvedValue(mockModelSelection);

      // Mock model responses that agree
      const mockModelCall = jest.fn()
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.95,
          reasoning: 'Simple table creation with proper constraints',
          suggestions: [],
        })
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.92,
          reasoning: 'Standard table schema with UUID primary key',
          suggestions: ['Consider adding created_at timestamp'],
        })
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.88,
          reasoning: 'Well-formed table definition',
          suggestions: [],
        });

      // Mock the model calling mechanism
      (service as any).callModel = mockModelCall;

      const result = await service.verifySchemaOperation(mockOperation);

      expect(result.approved).toBe(true);
      expect(result.confidence).toBeCloseTo(0.917, 2); // Average of confidence scores
      expect(result.consensus.agree).toBe(3);
      expect(result.consensus.disagree).toBe(0);
      expect(result.consensus.abstain).toBe(0);
      expect(result.models).toHaveLength(3);
      expect(result.safetyChecks.isDestructive).toBe(false);
      expect(result.safetyChecks.hasBackupPlan).toBe(true);
    });

    it('should reject destructive operations without consensus', async () => {
      const destructiveOperation = {
        type: 'DROP_TABLE' as const,
        schema: {
          tableName: 'important_data',
        },
        metadata: {
          requester: 'user-1',
          reason: 'Cleanup',
          environment: 'production',
        },
      };

      mockModelSelector.selectModel.mockResolvedValue(mockModelSelection);

      const mockModelCall = jest.fn()
        .mockResolvedValueOnce({
          safe: false,
          confidence: 0.95,
          reasoning: 'Dropping table in production is dangerous',
          suggestions: ['Create backup first', 'Use staging environment'],
        })
        .mockResolvedValueOnce({
          safe: false,
          confidence: 0.88,
          reasoning: 'No backup plan specified',
          suggestions: ['Implement rollback strategy'],
        })
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.70,
          reasoning: 'Could be safe if properly planned',
          suggestions: [],
        });

      (service as any).callModel = mockModelCall;

      const result = await service.verifySchemaOperation(destructiveOperation);

      expect(result.approved).toBe(false);
      expect(result.consensus.agree).toBe(1);
      expect(result.consensus.disagree).toBe(2);
      expect(result.safetyChecks.isDestructive).toBe(true);
      expect(result.rejectionReasons).toContain('Destructive operation in production environment');
    });

    it('should handle model selection failures', async () => {
      mockModelSelector.selectModel.mockResolvedValue(null);

      const result = await service.verifySchemaOperation(mockOperation);

      expect(result.approved).toBe(false);
      expect(result.rejectionReasons).toContain('No models available for verification');
    });

    it('should handle model call failures gracefully', async () => {
      mockModelSelector.selectModel.mockResolvedValue(mockModelSelection);

      const mockModelCall = jest.fn()
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.90,
          reasoning: 'Looks good',
          suggestions: [],
        })
        .mockRejectedValueOnce(new Error('Model service unavailable'))
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.85,
          reasoning: 'Safe operation',
          suggestions: [],
        });

      (service as any).callModel = mockModelCall;

      const result = await service.verifySchemaOperation(mockOperation);

      expect(result.approved).toBe(true); // Should still pass with 2/3 successful responses
      expect(result.models).toHaveLength(2); // Only successful calls
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Model service unavailable');
    });

    it('should require higher consensus for production operations', async () => {
      const prodOperation = {
        ...mockOperation,
        metadata: {
          ...mockOperation.metadata,
          environment: 'production',
        },
      };

      mockModelSelector.selectModel.mockResolvedValue(mockModelSelection);

      // 2 agree, 1 disagree - normally would pass, but production requires higher consensus
      const mockModelCall = jest.fn()
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.85,
          reasoning: 'Should be safe',
          suggestions: [],
        })
        .mockResolvedValueOnce({
          safe: true,
          confidence: 0.80,
          reasoning: 'Acceptable risk',
          suggestions: [],
        })
        .mockResolvedValueOnce({
          safe: false,
          confidence: 0.90,
          reasoning: 'Potential for data loss',
          suggestions: ['Test in staging first'],
        });

      (service as any).callModel = mockModelCall;

      const result = await service.verifySchemaOperation(prodOperation);

      expect(result.approved).toBe(false);
      expect(result.rejectionReasons).toContain('Insufficient consensus for production environment');
    });

    it('should apply custom verification config', async () => {
      const customConfig: EnsembleVerificationConfig = {
        modelCount: 5,
        consensusThreshold: 0.8,
        confidenceThreshold: 0.95,
        requireUnanimousForDestructive: true,
        enableSafetyChecks: true,
      };

      const customService = new SchemaVerificationService(customConfig);
      mockModelSelector.selectModel.mockResolvedValue(mockModelSelection);

      const mockModelCall = jest.fn()
        .mockResolvedValue({
          safe: true,
          confidence: 0.96,
          reasoning: 'High confidence approval',
          suggestions: [],
        });

      (customService as any).callModel = mockModelCall;

      const result = await customService.verifySchemaOperation(mockOperation);

      expect(mockModelCall).toHaveBeenCalledTimes(5); // Custom model count
      expect(result.approved).toBe(true);
    });

    it('should enforce unanimous agreement for destructive operations when configured', async () => {
      const config: EnsembleVerificationConfig = {
        requireUnanimousForDestructive: true,
      };

      const serviceWithUnanimous = new SchemaVerificationService(config);
      const destructiveOp = {
        type: 'DROP_TABLE' as const,
        schema: { tableName: 'data' },
        metadata: { requester: 'user-1', reason: 'cleanup', environment: 'staging' },
      };

      mockModelSelector.selectModel.mockResolvedValue(mockModelSelection);

      const mockModelCall = jest.fn()
        .mockResolvedValueOnce({ safe: true, confidence: 0.90, reasoning: 'Safe', suggestions: [] })
        .mockResolvedValueOnce({ safe: true, confidence: 0.85, reasoning: 'Safe', suggestions: [] })
        .mockResolvedValueOnce({ safe: false, confidence: 0.95, reasoning: 'Risky', suggestions: [] });

      (serviceWithUnanimous as any).callModel = mockModelCall;

      const result = await serviceWithUnanimous.verifySchemaOperation(destructiveOp);

      expect(result.approved).toBe(false);
      expect(result.rejectionReasons).toContain('Destructive operation requires unanimous approval');
    });
  });

  describe('safety checks', () => {
    it('should identify destructive operations correctly', async () => {
      const destructiveOps = [
        { type: 'DROP_TABLE' as const, schema: { tableName: 'test' } },
        { type: 'DROP_COLUMN' as const, schema: { tableName: 'test', columnName: 'col' } },
        { type: 'TRUNCATE_TABLE' as const, schema: { tableName: 'test' } },
      ];

      for (const op of destructiveOps) {
        const fullOp = {
          ...op,
          metadata: { requester: 'user-1', reason: 'test', environment: 'staging' },
        };

        const safetyCheck = (service as any).performSafetyChecks(fullOp);
        expect(safetyCheck.isDestructive).toBe(true);
      }
    });

    it('should identify non-destructive operations correctly', async () => {
      const safeOps = [
        { type: 'CREATE_TABLE' as const, schema: { tableName: 'test' } },
        { type: 'ADD_COLUMN' as const, schema: { tableName: 'test', columnName: 'col' } },
        { type: 'CREATE_INDEX' as const, schema: { tableName: 'test', indexName: 'idx' } },
      ];

      for (const op of safeOps) {
        const fullOp = {
          ...op,
          metadata: { requester: 'user-1', reason: 'test', environment: 'staging' },
        };

        const safetyCheck = (service as any).performSafetyChecks(fullOp);
        expect(safetyCheck.isDestructive).toBe(false);
      }
    });

    it('should validate rollback capability', async () => {
      const operationsWithRollback = [
        { type: 'CREATE_TABLE' as const }, // Can drop table
        { type: 'ADD_COLUMN' as const }, // Can drop column
        { type: 'CREATE_INDEX' as const }, // Can drop index
      ];

      for (const op of operationsWithRollback) {
        const fullOp = {
          ...op,
          schema: { tableName: 'test' },
          metadata: { requester: 'user-1', reason: 'test', environment: 'staging' },
        };

        const safetyCheck = (service as any).performSafetyChecks(fullOp);
        expect(safetyCheck.hasBackupPlan).toBe(true);
      }
    });
  });

  describe('telemetry and logging', () => {
    it('should log verification attempts', async () => {
      const operation = {
        type: 'CREATE_TABLE' as const,
        schema: { tableName: 'test' },
        metadata: { requester: 'user-1', reason: 'test', environment: 'staging' },
      };

      mockModelSelector.selectModel.mockResolvedValue(mockModelSelection);

      const mockModelCall = jest.fn().mockResolvedValue({
        safe: true,
        confidence: 0.90,
        reasoning: 'Safe',
        suggestions: [],
      });

      (service as any).callModel = mockModelCall;

      await service.verifySchemaOperation(operation);

      expect(mockPrisma.telemetryEvent.create).toHaveBeenCalledWith({
        data: {
          eventType: 'schema_verification_completed',
          payload: expect.objectContaining({
            operation: expect.objectContaining({
              type: 'CREATE_TABLE',
              tableName: 'test',
            }),
            result: expect.objectContaining({
              approved: true,
              modelCount: 3,
            }),
            requester: 'user-1',
            environment: 'staging',
          }),
        },
      });
    });

    it('should log model selection failures', async () => {
      mockModelSelector.selectModel.mockResolvedValue(null);

      const operation = {
        type: 'CREATE_TABLE' as const,
        schema: { tableName: 'test' },
        metadata: { requester: 'user-1', reason: 'test', environment: 'staging' },
      };

      await service.verifySchemaOperation(operation);

      expect(mockPrisma.telemetryEvent.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            eventType: 'schema_verification_completed',
            payload: expect.objectContaining({
              result: expect.objectContaining({
                approved: false,
                rejectionReasons: expect.arrayContaining([
                  'No models available for verification',
                ]),
              }),
            }),
          }),
        })
      );
    });
  });

  describe('configuration validation', () => {
    it('should validate consensus threshold bounds', () => {
      expect(() => new SchemaVerificationService({ consensusThreshold: 1.5 }))
        .toThrow('Consensus threshold must be between 0 and 1');

      expect(() => new SchemaVerificationService({ consensusThreshold: -0.1 }))
        .toThrow('Consensus threshold must be between 0 and 1');
    });

    it('should validate confidence threshold bounds', () => {
      expect(() => new SchemaVerificationService({ confidenceThreshold: 1.1 }))
        .toThrow('Confidence threshold must be between 0 and 1');
    });

    it('should validate model count bounds', () => {
      expect(() => new SchemaVerificationService({ modelCount: 0 }))
        .toThrow('Model count must be at least 1');

      expect(() => new SchemaVerificationService({ modelCount: 11 }))
        .toThrow('Model count cannot exceed 10');
    });
  });
});