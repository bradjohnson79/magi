import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CodeAnalysisService } from '@/services/evolution/analysis-service';
import { RefactorService } from '@/services/evolution/refactor-service';
import { CanaryModelService } from '@/services/evolution/canary-service';
import { EvolutionControlService } from '@/services/evolution/evolution-control';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('fs/promises');
vi.mock('glob', () => ({
  glob: vi.fn().mockResolvedValue(['test.ts', 'example.ts']),
}));

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

describe('Evolution System Integration Tests', () => {
  let analysisService: CodeAnalysisService;
  let refactorService: RefactorService;
  let canaryService: CanaryModelService;
  let evolutionControl: EvolutionControlService;

  beforeEach(() => {
    analysisService = new CodeAnalysisService(mockPrisma);
    refactorService = new RefactorService(mockPrisma, analysisService);
    canaryService = new CanaryModelService(mockPrisma);
    evolutionControl = new EvolutionControlService(
      mockPrisma,
      analysisService,
      refactorService,
      canaryService
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('End-to-End Evolution Workflow', () => {
    it('should complete full evolution cycle: analysis → refactor → deploy canary → promote', async () => {
      const organizationId = 'org-e2e-test';
      const userId = 'user-e2e-test';

      // Step 1: Enable evolution
      const mockSettings = {
        id: 'settings-e2e',
        organizationId,
        enabled: true,
        features: {
          codeAnalysis: { enabled: true, autoFix: { enabled: true, confidenceThreshold: 0.9 } },
          autoRefactor: { enabled: true, autoApprove: true, confidenceThreshold: 0.85 },
          canaryTesting: { enabled: true, autoPromote: true },
        },
        safeguards: {
          maxDailyChanges: 10,
          emergencyStop: false,
          testCoverageThreshold: 80,
        },
      };

      mockPrisma.evolutionSettings.update.mockResolvedValue(mockSettings as any);
      mockPrisma.evolutionEvent.create.mockResolvedValue({
        id: 'event-e2e',
        type: 'analysis_started',
        createdAt: new Date(),
      });

      // Step 2: Run code analysis
      const mockAnalysisResult = {
        id: 'analysis-e2e',
        analysisType: 'performance',
        findings: [
          {
            id: 'finding-1',
            type: 'performance_issue',
            description: 'Inefficient database query',
            fixable: true,
            impact: 'medium',
          },
        ],
        suggestions: [
          {
            id: 'suggestion-1',
            type: 'optimize_query',
            priority: 'medium',
            confidence: 0.9,
            automationLevel: 'automatic',
            implementation: {
              changes: [
                {
                  file: 'database.ts',
                  operation: 'update',
                  oldContent: 'await prisma.user.findMany()',
                  newContent: 'await prisma.user.findMany({ select: { id: true, email: true } })',
                },
              ],
              tests: ['database.test.ts'],
              rollbackPlan: 'Revert query optimization',
            },
          },
        ],
        metrics: { testCoverage: 85 },
      };

      mockPrisma.codeAnalysisResult.create.mockResolvedValue(mockAnalysisResult as any);
      mockPrisma.refactorSuggestion.create.mockResolvedValue({
        id: 'stored-suggestion-1',
        type: 'optimize_query',
        status: 'pending',
        confidence: 0.9,
        automationLevel: 'automatic',
      });

      // Step 3: Auto-apply refactor
      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue({
        id: 'stored-suggestion-1',
        automationLevel: 'automatic',
        implementation: mockAnalysisResult.suggestions[0].implementation,
      } as any);

      mockPrisma.refactorExecution.create.mockResolvedValue({
        id: 'execution-e2e',
        suggestionId: 'stored-suggestion-1',
        status: 'pending',
        executedBy: 'system',
        changes: mockAnalysisResult.suggestions[0].implementation.changes,
        testResults: {
          passed: 95,
          failed: 0,
          skipped: 2,
          coverage: 87,
          errors: [],
        },
      });

      mockPrisma.refactorExecution.update.mockResolvedValue({
        id: 'execution-e2e',
        status: 'completed',
        completedAt: new Date(),
      });

      mockPrisma.refactorFeedback.create.mockResolvedValue({
        id: 'feedback-e2e',
        action: 'approved',
        rating: 5,
        comments: 'Automatically applied successfully',
      });

      // Step 4: Deploy canary model
      const canaryModel = {
        name: 'Optimized-Model-v2',
        version: '2.0.0',
        modelType: 'language' as const,
        configuration: {
          provider: 'openai',
          modelId: 'gpt-4-optimized',
          parameters: { temperature: 0.7 },
          endpoints: {
            inference: 'https://api.openai.com/v1/chat/completions',
            health: 'https://api.openai.com/v1/health',
            metrics: 'https://api.openai.com/v1/metrics',
          },
        },
        status: 'pending' as const,
        trafficPercentage: 10,
        metrics: {
          responseTime: { p50: 85, p95: 180, p99: 250, average: 95 },
          accuracy: 0.95,
          errorRate: 0.01,
          throughput: 160,
          latency: 70,
          tokenUsage: { input: 120000, output: 60000, cost: 22.50 },
          userSatisfaction: { rating: 4.7, feedback: 25, complaints: 0 },
          qualityMetrics: { coherence: 0.92, relevance: 0.94, factuality: 0.91, safety: 0.96 },
          resourceUsage: { cpu: 30, memory: 55, gpu: 40 },
        },
        comparisonBaseline: 'baseline-model-e2e',
        promotionCriteria: {
          minTestDuration: 2, // 2 hours for test
          minRequestCount: 100,
          maxErrorRate: 0.05,
          minAccuracy: 0.85,
          maxLatencyIncrease: 20,
          minUserSatisfaction: 4.0,
          requiredImprovements: {
            responseTime: 5,
            accuracy: 2,
            errorRate: 10,
          },
          autoPromote: true,
          requiresManualApproval: false,
        },
        metadata: {},
      };

      const deployedCanary = {
        id: 'canary-e2e',
        ...canaryModel,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.canaryModel.create.mockResolvedValue(deployedCanary as any);
      mockPrisma.canaryDeployment.create.mockResolvedValue({
        id: 'deployment-e2e',
        canaryId: 'canary-e2e',
        status: 'active',
      });
      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'canary-e2e',
        status: 'testing',
        testingStartedAt: new Date(Date.now() - 3 * 60 * 60 * 1000), // 3 hours ago
      });

      // Step 5: Auto-promote canary
      const baselineModel = {
        id: 'baseline-model-e2e',
        metrics: {
          responseTime: { average: 100 },
          accuracy: 0.90,
          errorRate: 0.02,
          userSatisfaction: { rating: 4.2 },
          qualityMetrics: { coherence: 0.88, relevance: 0.90, factuality: 0.89, safety: 0.94 },
          tokenUsage: { cost: 25 },
          throughput: 150,
        },
      };

      mockPrisma.canaryModel.findUnique.mockResolvedValue(baselineModel as any);
      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'canary-e2e',
        status: 'promoted',
        promotedAt: new Date(),
      });
      mockPrisma.modelComparison.create.mockResolvedValue({
        id: 'comparison-e2e',
        recommendation: 'promote',
        confidence: 0.92,
      });

      // Execute the full workflow
      await evolutionControl.toggleEvolution(organizationId, true, userId);

      // Simulate analysis completion
      vi.mocked(require('fs/promises').readFile).mockResolvedValue(`
        const users = await prisma.user.findMany();
        for (let i = 0; i < array.length; i++) {
          doSomething(array[i]);
        }
      `);

      const analysisResults = await analysisService.performFullCodebaseAnalysis();
      expect(analysisResults.length).toBeGreaterThan(0);

      // Simulate refactor suggestion processing
      await refactorService.storeSuggestion(mockAnalysisResult.suggestions[0] as any, 'analysis-e2e');
      const execution = await refactorService.autoApplySuggestion('stored-suggestion-1');
      expect(execution.status).toBe('completed');

      // Simulate canary deployment
      const deployedCanaryResult = await canaryService.deployCanaryModel(canaryModel);
      expect(deployedCanaryResult.id).toBe('canary-e2e');
      expect(deployedCanaryResult.status).toBe('testing');

      // Simulate canary promotion
      await canaryService.promoteCanary('canary-e2e', {
        canaryId: 'canary-e2e',
        baselineId: 'baseline-model-e2e',
        comparisonPeriod: { start: new Date(), end: new Date() },
        results: {
          performanceDelta: { responseTime: 5, accuracy: 5.56, errorRate: -50, throughput: 6.67 },
          qualityDelta: { coherence: 4.55, relevance: 4.44, factuality: 2.25, safety: 2.13 },
          costDelta: { perRequest: -10, total: 0, efficiency: 15 },
          userExperienceDelta: { satisfaction: 11.9, adoption: 0, retention: 0 },
        },
        recommendation: 'promote',
        confidence: 0.92,
        reasoning: ['Significant improvements across all metrics'],
      });

      // Verify final state
      expect(mockPrisma.evolutionSettings.update).toHaveBeenCalledWith({
        where: { organizationId },
        data: expect.objectContaining({ enabled: true }),
      });

      expect(mockPrisma.refactorExecution.update).toHaveBeenCalledWith({
        where: { id: 'execution-e2e' },
        data: expect.objectContaining({ status: 'completed' }),
      });

      expect(mockPrisma.canaryModel.update).toHaveBeenCalledWith({
        where: { id: 'canary-e2e' },
        data: expect.objectContaining({ status: 'promoted' }),
      });
    });
  });

  describe('Error Handling and Recovery', () => {
    it('should handle refactor failures with automatic rollback', async () => {
      const organizationId = 'org-error-test';

      // Mock failing refactor
      const failingSuggestion = {
        id: 'failing-suggestion',
        automationLevel: 'automatic',
        implementation: {
          changes: [
            {
              file: 'breaking.ts',
              operation: 'update' as const,
              oldContent: 'working code',
              newContent: 'broken code',
            },
          ],
          tests: ['breaking.test.ts'],
          rollbackPlan: 'Revert to working code',
        },
      };

      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue(failingSuggestion as any);
      mockPrisma.refactorExecution.create.mockResolvedValue({
        id: 'execution-fail',
        suggestionId: 'failing-suggestion',
        status: 'pending',
        executedBy: 'system',
        changes: failingSuggestion.implementation.changes,
        testResults: {
          passed: 45,
          failed: 8, // Tests failed
          skipped: 0,
          coverage: 82,
          errors: ['8 tests failed after refactoring'],
        },
        backupPath: '/backups/fail-test',
      });

      mockPrisma.refactorExecution.update
        .mockResolvedValueOnce({
          id: 'execution-fail',
          testResults: {
            passed: 45,
            failed: 8,
            skipped: 0,
            coverage: 82,
            errors: ['8 tests failed after refactoring'],
          },
        })
        .mockResolvedValueOnce({
          id: 'execution-fail',
          status: 'rolled_back',
          completedAt: new Date(),
        });

      mockPrisma.refactorFeedback.create.mockResolvedValue({
        id: 'feedback-fail',
        action: 'rejected',
        rating: 1,
        comments: 'Tests failed after application',
      });

      vi.mocked(require('fs/promises').mkdir).mockResolvedValue('');
      vi.mocked(require('fs/promises').writeFile).mockResolvedValue();
      vi.mocked(require('fs/promises').readFile).mockResolvedValue('working code');

      try {
        await refactorService.autoApplySuggestion('failing-suggestion');
      } catch (error) {
        // Expected to fail
      }

      expect(mockPrisma.refactorExecution.update).toHaveBeenCalledWith({
        where: { id: 'execution-fail' },
        data: {
          status: 'rolled_back',
          completedAt: expect.any(Date),
        },
      });

      expect(mockPrisma.refactorFeedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'rejected',
          rating: 1,
          comments: 'Tests failed after application',
        }),
      });
    });

    it('should handle canary rollback due to poor performance', async () => {
      const poorCanary = {
        id: 'poor-canary',
        testingStartedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25 hours ago
        promotionCriteria: {
          minTestDuration: 24,
          maxErrorRate: 0.05,
          minAccuracy: 0.85,
          minUserSatisfaction: 4.0,
        },
        metrics: {
          accuracy: 0.82, // Below threshold
          errorRate: 0.08, // Above threshold
          userSatisfaction: { rating: 3.8 }, // Below threshold
        },
        comparisonBaseline: 'baseline-poor',
      };

      mockPrisma.canaryModel.update.mockResolvedValue({
        id: 'poor-canary',
        status: 'rolled_back',
        metadata: {
          rollbackReason: 'Multiple criteria violations',
          rollbackAt: new Date(),
        },
      });

      const shouldPromote = await (canaryService as any).shouldPromoteCanary(poorCanary);

      expect(shouldPromote.promote).toBe(false);
      expect(shouldPromote.rollback).toBe(true);
      expect(shouldPromote.reason).toContain('Accuracy');

      if (shouldPromote.rollback) {
        await (canaryService as any).rollbackCanary('poor-canary', shouldPromote.reason);

        expect(mockPrisma.canaryModel.update).toHaveBeenCalledWith({
          where: { id: 'poor-canary' },
          data: {
            status: 'rolled_back',
            updatedAt: expect.any(Date),
            metadata: {
              rollbackReason: shouldPromote.reason,
              rollbackAt: expect.any(Date),
            },
          },
        });
      }
    });

    it('should trigger emergency stop on critical errors', async () => {
      const organizationId = 'org-emergency-test';
      const userId = 'user-emergency-test';
      const reason = 'Critical system failure detected';

      mockPrisma.evolutionSettings.update.mockResolvedValue({
        id: 'settings-emergency-test',
        organizationId,
        enabled: false,
        'safeguards.emergencyStop': true,
        metadata: {
          emergencyStopReason: reason,
          emergencyStopAt: new Date(),
          emergencyStopBy: userId,
        },
      });

      mockPrisma.refactorExecution.findMany.mockResolvedValue([
        { id: 'exec-1', status: 'in_progress' },
        { id: 'exec-2', status: 'in_progress' },
      ]);

      mockPrisma.refactorExecution.update.mockResolvedValue({
        status: 'rolled_back',
      });

      mockPrisma.evolutionEvent.create.mockResolvedValue({
        id: 'emergency-event',
        type: 'emergency_stop',
        severity: 'critical',
      });

      await evolutionControl.emergencyStop(organizationId, userId, reason);

      expect(mockPrisma.evolutionSettings.update).toHaveBeenCalledWith({
        where: { organizationId },
        data: expect.objectContaining({
          enabled: false,
          'safeguards.emergencyStop': true,
        }),
      });

      expect(mockPrisma.refactorExecution.update).toHaveBeenCalledTimes(2);
      expect(mockPrisma.evolutionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'emergency_stop',
          severity: 'critical',
        }),
      });
    });
  });

  describe('Safeguards and Limits', () => {
    it('should respect daily change limits', async () => {
      const organizationId = 'org-limits-test';

      const mockSettings = {
        enabled: true,
        features: { autoRefactor: { enabled: true } },
        safeguards: {
          maxDailyChanges: 5,
          emergencyStop: false,
          testCoverageThreshold: 80,
        },
      };

      mockPrisma.evolutionSettings.findUnique.mockResolvedValue(mockSettings as any);
      mockPrisma.refactorExecution.count.mockResolvedValue(6); // Over limit
      mockPrisma.evolutionEvent.create.mockResolvedValue({});

      const safeguardsPassed = await (evolutionControl as any).checkSafeguards(
        organizationId,
        mockSettings
      );

      expect(safeguardsPassed).toBe(false);
    });

    it('should enforce test coverage requirements', async () => {
      const organizationId = 'org-coverage-test';

      const mockSettings = {
        enabled: true,
        features: { autoRefactor: { enabled: true } },
        safeguards: {
          maxDailyChanges: 10,
          emergencyStop: false,
          testCoverageThreshold: 85,
        },
      };

      mockPrisma.evolutionSettings.findUnique.mockResolvedValue(mockSettings as any);
      mockPrisma.refactorExecution.count.mockResolvedValue(3);

      // Mock low test coverage
      const mockAnalysisService = analysisService as any;
      mockAnalysisService.getLatestAnalysisResults = vi.fn().mockResolvedValue([
        { metrics: { testCoverage: 75 } }, // Below threshold
      ]);

      const safeguardsPassed = await (evolutionControl as any).checkSafeguards(
        organizationId,
        mockSettings
      );

      expect(safeguardsPassed).toBe(false);
    });

    it('should require manual approval for high-risk changes', async () => {
      const highRiskSuggestion = {
        id: 'high-risk-suggestion',
        type: 'security_fix',
        priority: 'critical',
        confidence: 0.7, // Lower confidence
        automationLevel: 'manual', // Requires manual approval
        files: ['auth.ts', 'security.ts'],
      };

      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue(highRiskSuggestion as any);

      await expect(
        refactorService.autoApplySuggestion('high-risk-suggestion')
      ).rejects.toThrow('not marked for automatic application');

      // Should require manual feedback
      const feedback = {
        suggestionId: 'high-risk-suggestion',
        userId: 'security-reviewer',
        action: 'approved' as const,
        rating: 4,
        comments: 'Security review completed, changes approved',
        metadata: { securityReview: true },
      };

      mockPrisma.refactorFeedback.create.mockResolvedValue({
        id: 'feedback-manual',
        ...feedback,
        createdAt: new Date(),
      });

      mockPrisma.refactorSuggestion.update.mockResolvedValue({
        id: 'high-risk-suggestion',
        status: 'approved',
      });

      const result = await refactorService.submitFeedback(feedback);

      expect(result.action).toBe('approved');
      expect(result.comments).toContain('Security review completed');
    });
  });

  describe('Performance and Monitoring', () => {
    it('should track and report evolution metrics accurately', async () => {
      const organizationId = 'org-metrics-test';

      // Mock metrics collection
      const mockRefactorMetrics = {
        totalSuggestions: 25,
        approvedSuggestions: 20,
        rejectedSuggestions: 3,
        automaticApplied: 15,
        manualApplied: 5,
        averageRating: 4.3,
        successRate: 0.9,
        timeToImplementation: 1.8,
        impactMetrics: {
          performanceImprovement: 0.15,
          securityImprovement: 0.12,
          maintainabilityImprovement: 0.28,
          readabilityImprovement: 0.22,
        },
      };

      const mockAnalysisResults = [
        {
          findings: new Array(15).fill({ id: 'finding' }),
          suggestions: [
            { automationLevel: 'automatic' },
            { automationLevel: 'automatic' },
            { automationLevel: 'manual' },
          ],
        },
        {
          findings: new Array(8).fill({ id: 'finding' }),
          suggestions: [
            { automationLevel: 'automatic' },
          ],
        },
      ];

      const mockRefactorService = refactorService as any;
      mockRefactorService.getRefactorMetrics = vi.fn().mockResolvedValue(mockRefactorMetrics);

      const mockAnalysisServiceUpdated = analysisService as any;
      mockAnalysisServiceUpdated.getLatestAnalysisResults = vi.fn().mockResolvedValue(mockAnalysisResults);

      mockPrisma.evolutionMetrics.create.mockResolvedValue({
        id: 'metrics-created',
        organizationId,
      });

      await (evolutionControl as any).updateEvolutionMetrics(organizationId);

      expect(mockPrisma.evolutionMetrics.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId,
          codeAnalysis: expect.objectContaining({
            runsCompleted: 2,
            issuesFound: 23,
            issuesFixed: 3, // Automatic suggestions
          }),
          refactoring: expect.objectContaining({
            suggestionsGenerated: 25,
            suggestionsApproved: 20,
            suggestionsApplied: 20,
            successRate: 0.9,
          }),
          impact: expect.objectContaining({
            performanceImprovement: 15.2,
            securityIssuesResolved: 12,
            codeQualityIncrease: 8.5,
          }),
        }),
      });
    });

    it('should monitor system health and trigger alerts', async () => {
      const organizationId = 'org-health-test';

      // Simulate unhealthy metrics
      const unhealthyMetrics = {
        totalSuggestions: 50,
        approvedSuggestions: 10, // Low approval rate
        rejectedSuggestions: 30, // High rejection rate
        automaticApplied: 5,
        manualApplied: 5,
        averageRating: 2.1, // Poor rating
        successRate: 0.4, // Low success rate
        timeToImplementation: 8.5, // Slow implementation
        impactMetrics: {
          performanceImprovement: -0.05, // Negative impact
          securityImprovement: 0.01,
          maintainabilityImprovement: -0.02,
          readabilityImprovement: 0.03,
        },
      };

      const mockRefactorServiceHealth = refactorService as any;
      mockRefactorServiceHealth.getRefactorMetrics = vi.fn().mockResolvedValue(unhealthyMetrics);

      mockPrisma.evolutionEvent.create.mockResolvedValue({
        id: 'health-alert',
        type: 'error',
        severity: 'warning',
      });

      // This would trigger health monitoring alerts in a real system
      const approvalRate = unhealthyMetrics.approvedSuggestions / unhealthyMetrics.totalSuggestions;
      const rejectionRate = unhealthyMetrics.rejectedSuggestions / unhealthyMetrics.totalSuggestions;

      if (approvalRate < 0.3 || rejectionRate > 0.5 || unhealthyMetrics.averageRating < 3.0) {
        await evolutionControl.logEvent(organizationId, {
          type: 'error',
          severity: 'warning',
          title: 'System Health Alert',
          description: 'Evolution system showing poor performance metrics',
          data: {
            approvalRate,
            rejectionRate,
            averageRating: unhealthyMetrics.averageRating,
            successRate: unhealthyMetrics.successRate,
          },
          triggeredBy: 'system',
          metadata: {},
        });
      }

      expect(approvalRate).toBeLessThan(0.3);
      expect(rejectionRate).toBeGreaterThan(0.5);
      expect(mockPrisma.evolutionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'error',
          severity: 'warning',
          title: 'System Health Alert',
        }),
      });
    });
  });
});