import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { EvolutionControlService } from '@/services/evolution/evolution-control';
import { CodeAnalysisService } from '@/services/evolution/analysis-service';
import { RefactorService } from '@/services/evolution/refactor-service';
import { CanaryModelService } from '@/services/evolution/canary-service';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

describe('EvolutionControlService', () => {
  let evolutionControl: EvolutionControlService;
  let mockAnalysisService: CodeAnalysisService;
  let mockRefactorService: RefactorService;
  let mockCanaryService: CanaryModelService;

  beforeEach(() => {
    mockAnalysisService = mockDeep<CodeAnalysisService>();
    mockRefactorService = mockDeep<RefactorService>();
    mockCanaryService = mockDeep<CanaryModelService>();

    evolutionControl = new EvolutionControlService(
      mockPrisma,
      mockAnalysisService,
      mockRefactorService,
      mockCanaryService
    );

    vi.clearAllMocks();
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('Evolution Toggle', () => {
    it('should enable evolution and start processes', async () => {
      const organizationId = 'org-123';
      const userId = 'user-456';

      const mockSettings = {
        id: 'settings-1',
        organizationId,
        enabled: true,
        features: {
          codeAnalysis: { enabled: true },
          autoRefactor: { enabled: true },
          canaryTesting: { enabled: true },
        },
        safeguards: {
          maxDailyChanges: 10,
          emergencyStop: false,
        },
        lastModifiedBy: userId,
        updatedAt: new Date(),
      };

      mockPrisma.evolutionSettings.update.mockResolvedValue(mockSettings as any);
      mockPrisma.evolutionEvent.create.mockResolvedValue({
        id: 'event-1',
        organizationId,
        type: 'analysis_started',
        severity: 'info',
        title: 'Evolution Enabled',
        createdAt: new Date(),
      });

      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      const result = await evolutionControl.toggleEvolution(organizationId, true, userId);

      expect(result.enabled).toBe(true);
      expect(result.lastModifiedBy).toBe(userId);
      expect(mockPrisma.evolutionSettings.update).toHaveBeenCalledWith({
        where: { organizationId },
        data: {
          enabled: true,
          lastModifiedBy: userId,
          updatedAt: expect.any(Date),
        },
      });

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30 * 60 * 1000 // 30 minutes
      );

      setIntervalSpy.mockRestore();
    });

    it('should disable evolution and stop processes', async () => {
      const organizationId = 'org-456';
      const userId = 'user-789';

      const mockSettings = {
        id: 'settings-2',
        organizationId,
        enabled: false,
        lastModifiedBy: userId,
        updatedAt: new Date(),
      };

      mockPrisma.evolutionSettings.update.mockResolvedValue(mockSettings as any);
      mockPrisma.evolutionEvent.create.mockResolvedValue({
        id: 'event-2',
        organizationId,
        type: 'emergency_stop',
        severity: 'warning',
        title: 'Evolution Disabled',
        createdAt: new Date(),
      });

      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      const result = await evolutionControl.toggleEvolution(organizationId, false, userId);

      expect(result.enabled).toBe(false);
      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  describe('Settings Management', () => {
    it('should update evolution settings', async () => {
      const organizationId = 'org-settings';
      const userId = 'user-settings';
      const updates = {
        features: {
          codeAnalysis: {
            enabled: true,
            schedule: '0 */4 * * *',
            analysisTypes: ['performance', 'security'],
            autoFix: {
              enabled: true,
              confidenceThreshold: 0.95,
              allowedTypes: ['style_improvement'],
            },
          },
          autoRefactor: {
            enabled: false,
            autoApprove: false,
            confidenceThreshold: 0.8,
            maxChangesPerDay: 5,
            requiresReview: ['**/*.ts'],
            rollbackOnFailure: true,
          },
        },
        safeguards: {
          maxDailyChanges: 3,
          requiredApprovers: 2,
          emergencyStop: false,
          rollbackWindow: 48,
          testCoverageThreshold: 85,
          securityScanRequired: true,
        },
      };

      const updatedSettings = {
        id: 'settings-updated',
        organizationId,
        enabled: true,
        features: updates.features,
        safeguards: updates.safeguards,
        lastModifiedBy: userId,
        updatedAt: new Date(),
      };

      mockPrisma.evolutionSettings.update.mockResolvedValue(updatedSettings as any);
      mockPrisma.evolutionEvent.create.mockResolvedValue({
        id: 'event-settings',
        organizationId,
        type: 'analysis_started',
        severity: 'info',
        title: 'Settings Updated',
        createdAt: new Date(),
      });

      const result = await evolutionControl.updateEvolutionSettings(
        organizationId,
        updates,
        userId
      );

      expect(result.features).toEqual(updates.features);
      expect(result.safeguards).toEqual(updates.safeguards);
      expect(mockPrisma.evolutionSettings.update).toHaveBeenCalledWith({
        where: { organizationId },
        data: {
          features: updates.features,
          safeguards: updates.safeguards,
          metadata: undefined,
          lastModifiedBy: userId,
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should create default settings if none exist', async () => {
      const organizationId = 'org-new';

      mockPrisma.evolutionSettings.findUnique.mockResolvedValue(null);
      mockPrisma.evolutionSettings.create.mockResolvedValue({
        id: 'settings-default',
        organizationId,
        enabled: false,
        features: {
          codeAnalysis: {
            enabled: true,
            schedule: '0 */6 * * *',
            analysisTypes: ['performance', 'security', 'style', 'complexity'],
            autoFix: {
              enabled: false,
              confidenceThreshold: 0.9,
              allowedTypes: ['style_improvement'],
            },
          },
          autoRefactor: {
            enabled: false,
            autoApprove: false,
            confidenceThreshold: 0.8,
            maxChangesPerDay: 10,
            requiresReview: ['**/*.ts', '**/*.tsx'],
            rollbackOnFailure: true,
          },
          canaryTesting: {
            enabled: false,
            autoPromote: false,
            trafficPercentage: 10,
            testDuration: 24,
            promotionCriteria: {
              accuracyImprovement: 2,
              errorRateThreshold: 0.05,
              latencyThreshold: 1.5,
            },
          },
          notifications: {
            enabled: true,
            channels: ['email'],
            events: ['canary_promoted', 'error'],
            recipients: [],
          },
        },
        safeguards: {
          maxDailyChanges: 5,
          requiredApprovers: 1,
          emergencyStop: false,
          rollbackWindow: 24,
          testCoverageThreshold: 80,
          securityScanRequired: true,
        },
        metadata: {},
        lastModifiedBy: 'system',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await evolutionControl.getEvolutionSettings(organizationId);

      expect(result.organizationId).toBe(organizationId);
      expect(result.enabled).toBe(false);
      expect(result.features.codeAnalysis.enabled).toBe(true);
      expect(result.safeguards.maxDailyChanges).toBe(5);
    });
  });

  describe('Emergency Stop', () => {
    it('should activate emergency stop and cleanup', async () => {
      const organizationId = 'org-emergency';
      const userId = 'user-emergency';
      const reason = 'Critical security vulnerability detected';

      mockPrisma.evolutionSettings.update.mockResolvedValue({
        id: 'settings-emergency',
        organizationId,
        enabled: false,
        'safeguards.emergencyStop': true,
        lastModifiedBy: userId,
        updatedAt: new Date(),
        metadata: {
          emergencyStopReason: reason,
          emergencyStopAt: new Date(),
          emergencyStopBy: userId,
        },
      });

      mockPrisma.refactorExecution.findMany.mockResolvedValue([
        {
          id: 'execution-1',
          status: 'in_progress',
        },
        {
          id: 'execution-2',
          status: 'in_progress',
        },
      ]);

      mockPrisma.refactorExecution.update.mockResolvedValue({
        id: 'execution-1',
        status: 'rolled_back',
      });

      mockPrisma.evolutionEvent.create.mockResolvedValue({
        id: 'event-emergency',
        organizationId,
        type: 'emergency_stop',
        severity: 'critical',
        title: 'Emergency Stop Activated',
        createdAt: new Date(),
      });

      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      await evolutionControl.emergencyStop(organizationId, userId, reason);

      expect(mockPrisma.evolutionSettings.update).toHaveBeenCalledWith({
        where: { organizationId },
        data: {
          enabled: false,
          'safeguards.emergencyStop': true,
          lastModifiedBy: userId,
          updatedAt: expect.any(Date),
          metadata: {
            emergencyStopReason: reason,
            emergencyStopAt: expect.any(Date),
            emergencyStopBy: userId,
          },
        },
      });

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });

    it('should rollback in-progress executions during emergency stop', async () => {
      const organizationId = 'org-rollback';
      const userId = 'user-rollback';
      const reason = 'System instability';

      const inProgressExecutions = [
        { id: 'exec-1', status: 'in_progress' },
        { id: 'exec-2', status: 'in_progress' },
        { id: 'exec-3', status: 'in_progress' },
      ];

      mockPrisma.evolutionSettings.update.mockResolvedValue({} as any);
      mockPrisma.refactorExecution.findMany.mockResolvedValue(inProgressExecutions as any);
      mockPrisma.refactorExecution.update.mockResolvedValue({
        status: 'rolled_back',
        completedAt: new Date(),
      });
      mockPrisma.evolutionEvent.create.mockResolvedValue({} as any);

      await evolutionControl.emergencyStop(organizationId, userId, reason);

      expect(mockPrisma.refactorExecution.update).toHaveBeenCalledTimes(3);
      expect(mockPrisma.refactorExecution.update).toHaveBeenCalledWith({
        where: { id: 'exec-1' },
        data: {
          status: 'rolled_back',
          completedAt: expect.any(Date),
          metadata: {
            rollbackReason: 'Emergency stop',
          },
        },
      });
    });
  });

  describe('Evolution Cycle', () => {
    it('should run evolution cycle when enabled', async () => {
      const organizationId = 'org-cycle';

      const mockSettings = {
        enabled: true,
        features: {
          autoRefactor: { enabled: true },
        },
        safeguards: {
          maxDailyChanges: 10,
          emergencyStop: false,
          testCoverageThreshold: 80,
        },
      };

      mockPrisma.evolutionSettings.findUnique.mockResolvedValue(mockSettings as any);
      mockPrisma.refactorExecution.count.mockResolvedValue(3); // Under limit
      mockAnalysisService.getLatestAnalysisResults.mockResolvedValue([
        {
          id: 'analysis-1',
          metrics: { testCoverage: 85 },
        } as any,
      ]);
      mockRefactorService.processNewSuggestions.mockResolvedValue();
      mockPrisma.evolutionMetrics.create.mockResolvedValue({} as any);

      await (evolutionControl as any).runEvolutionCycle(organizationId);

      expect(mockRefactorService.processNewSuggestions).toHaveBeenCalled();
      expect(mockPrisma.evolutionMetrics.create).toHaveBeenCalled();
    });

    it('should skip cycle when safeguards fail', async () => {
      const organizationId = 'org-safeguards';

      const mockSettings = {
        enabled: true,
        features: {
          autoRefactor: { enabled: true },
        },
        safeguards: {
          maxDailyChanges: 5,
          emergencyStop: false,
          testCoverageThreshold: 90,
        },
      };

      mockPrisma.evolutionSettings.findUnique.mockResolvedValue(mockSettings as any);
      mockPrisma.refactorExecution.count.mockResolvedValue(6); // Over limit
      mockPrisma.evolutionEvent.create.mockResolvedValue({} as any);

      await (evolutionControl as any).runEvolutionCycle(organizationId);

      expect(mockRefactorService.processNewSuggestions).not.toHaveBeenCalled();
      expect(mockPrisma.evolutionEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'error',
          severity: 'warning',
          title: 'Safeguards Failed',
        }),
      });
    });

    it('should skip cycle when emergency stop is active', async () => {
      const organizationId = 'org-emergency-skip';

      const mockSettings = {
        enabled: true,
        safeguards: {
          maxDailyChanges: 10,
          emergencyStop: true, // Emergency stop active
        },
      };

      mockPrisma.evolutionSettings.findUnique.mockResolvedValue(mockSettings as any);
      mockPrisma.refactorExecution.count.mockResolvedValue(2);
      mockPrisma.evolutionEvent.create.mockResolvedValue({} as any);

      await (evolutionControl as any).runEvolutionCycle(organizationId);

      expect(mockRefactorService.processNewSuggestions).not.toHaveBeenCalled();
    });

    it('should skip cycle when test coverage is below threshold', async () => {
      const organizationId = 'org-coverage';

      const mockSettings = {
        enabled: true,
        features: {
          autoRefactor: { enabled: true },
        },
        safeguards: {
          maxDailyChanges: 10,
          emergencyStop: false,
          testCoverageThreshold: 85,
        },
      };

      mockPrisma.evolutionSettings.findUnique.mockResolvedValue(mockSettings as any);
      mockPrisma.refactorExecution.count.mockResolvedValue(2);
      mockAnalysisService.getLatestAnalysisResults.mockResolvedValue([
        {
          id: 'analysis-1',
          metrics: { testCoverage: 75 }, // Below threshold
        } as any,
      ]);
      mockPrisma.evolutionEvent.create.mockResolvedValue({} as any);

      await (evolutionControl as any).runEvolutionCycle(organizationId);

      expect(mockRefactorService.processNewSuggestions).not.toHaveBeenCalled();
    });
  });

  describe('Metrics and Events', () => {
    it('should update evolution metrics correctly', async () => {
      const organizationId = 'org-metrics';

      const mockRefactorMetrics = {
        totalSuggestions: 15,
        approvedSuggestions: 10,
        rejectedSuggestions: 3,
        automaticApplied: 7,
        manualApplied: 3,
        averageRating: 4.2,
        successRate: 0.85,
        timeToImplementation: 2.5,
        impactMetrics: {
          performanceImprovement: 0.12,
          securityImprovement: 0.08,
          maintainabilityImprovement: 0.25,
          readabilityImprovement: 0.18,
        },
      };

      const mockAnalysisResults = [
        {
          findings: [{ id: '1' }, { id: '2' }, { id: '3' }],
          suggestions: [{ automationLevel: 'automatic' }, { automationLevel: 'manual' }],
        },
        {
          findings: [{ id: '4' }],
          suggestions: [{ automationLevel: 'automatic' }],
        },
      ];

      mockRefactorService.getRefactorMetrics.mockResolvedValue(mockRefactorMetrics);
      mockAnalysisService.getLatestAnalysisResults.mockResolvedValue(mockAnalysisResults as any);
      mockPrisma.evolutionMetrics.create.mockResolvedValue({
        id: 'metrics-1',
        organizationId,
        createdAt: new Date(),
      });

      await (evolutionControl as any).updateEvolutionMetrics(organizationId);

      expect(mockPrisma.evolutionMetrics.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          organizationId,
          codeAnalysis: expect.objectContaining({
            runsCompleted: 2,
            issuesFound: 4,
            issuesFixed: 2,
          }),
          refactoring: expect.objectContaining({
            suggestionsGenerated: 15,
            suggestionsApproved: 10,
            suggestionsApplied: 10,
            successRate: 0.85,
          }),
        }),
      });
    });

    it('should log events correctly', async () => {
      const organizationId = 'org-events';
      const event = {
        type: 'analysis_completed' as const,
        severity: 'info' as const,
        title: 'Code Analysis Completed',
        description: 'Analysis found 5 issues',
        data: { issueCount: 5 },
        triggeredBy: 'system',
        metadata: {},
      };

      mockPrisma.evolutionEvent.create.mockResolvedValue({
        id: 'event-1',
        organizationId,
        ...event,
        createdAt: new Date(),
      });

      await evolutionControl.logEvent(organizationId, event);

      expect(mockPrisma.evolutionEvent.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          type: 'analysis_completed',
          severity: 'info',
          title: 'Code Analysis Completed',
          description: 'Analysis found 5 issues',
          data: { issueCount: 5 },
          triggeredBy: 'system',
          acknowledgedAt: undefined,
          acknowledgedBy: undefined,
          metadata: {},
          createdAt: expect.any(Date),
        },
      });
    });

    it('should retrieve evolution metrics for time range', async () => {
      const organizationId = 'org-get-metrics';
      const days = 30;

      const mockMetrics = [
        {
          id: 'metrics-1',
          organizationId,
          period: { start: new Date(), end: new Date() },
          codeAnalysis: { runsCompleted: 10 },
          refactoring: { suggestionsGenerated: 25 },
          createdAt: new Date(),
        },
        {
          id: 'metrics-2',
          organizationId,
          period: { start: new Date(), end: new Date() },
          codeAnalysis: { runsCompleted: 8 },
          refactoring: { suggestionsGenerated: 20 },
          createdAt: new Date(),
        },
      ];

      mockPrisma.evolutionMetrics.findMany.mockResolvedValue(mockMetrics as any);

      const result = await evolutionControl.getEvolutionMetrics(organizationId, days);

      expect(result).toEqual(mockMetrics);
      expect(mockPrisma.evolutionMetrics.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          createdAt: { gte: expect.any(Date) },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should retrieve evolution events with limit', async () => {
      const organizationId = 'org-get-events';
      const limit = 25;

      const mockEvents = [
        {
          id: 'event-1',
          organizationId,
          type: 'analysis_started',
          severity: 'info',
          title: 'Analysis Started',
          createdAt: new Date(),
        },
        {
          id: 'event-2',
          organizationId,
          type: 'refactor_applied',
          severity: 'info',
          title: 'Refactor Applied',
          createdAt: new Date(),
        },
      ];

      mockPrisma.evolutionEvent.findMany.mockResolvedValue(mockEvents as any);

      const result = await evolutionControl.getEvolutionEvents(organizationId, limit);

      expect(result).toEqual(mockEvents);
      expect(mockPrisma.evolutionEvent.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
        take: limit,
      });
    });

    it('should acknowledge events', async () => {
      const eventId = 'event-ack';
      const userId = 'user-ack';

      mockPrisma.evolutionEvent.update.mockResolvedValue({
        id: eventId,
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
      });

      await evolutionControl.acknowledgeEvent(eventId, userId);

      expect(mockPrisma.evolutionEvent.update).toHaveBeenCalledWith({
        where: { id: eventId },
        data: {
          acknowledgedAt: expect.any(Date),
          acknowledgedBy: userId,
        },
      });
    });
  });
});