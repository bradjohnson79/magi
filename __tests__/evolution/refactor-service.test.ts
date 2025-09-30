import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { RefactorService } from '@/services/evolution/refactor-service';
import { CodeAnalysisService } from '@/services/evolution/analysis-service';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';
import * as fs from 'fs/promises';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('fs/promises');

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;
const mockFs = vi.mocked(fs);

describe('RefactorService', () => {
  let refactorService: RefactorService;
  let mockAnalysisService: CodeAnalysisService;

  beforeEach(() => {
    mockAnalysisService = mockDeep<CodeAnalysisService>();
    refactorService = new RefactorService(mockPrisma, mockAnalysisService);
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('Suggestion Storage', () => {
    it('should store refactor suggestion in database', async () => {
      const suggestion = {
        id: 'suggestion-1',
        type: 'optimize_query' as const,
        priority: 'medium' as const,
        title: 'Optimize database query',
        description: 'Cache query results',
        files: ['database.ts'],
        estimatedImpact: {
          performance: 0.7,
          security: 0.1,
          maintainability: 0.3,
          readability: 0.2,
        },
        automationLevel: 'assisted' as const,
        implementation: {
          changes: [],
          tests: [],
          rollbackPlan: 'Revert changes',
        },
        confidence: 0.8,
        reasoning: 'Query optimization will improve performance',
      };

      mockPrisma.refactorSuggestion.create.mockResolvedValue({
        id: 'stored-suggestion-1',
        type: 'optimize_query',
        priority: 'medium',
        title: 'Optimize database query',
        description: 'Cache query results',
        files: ['database.ts'],
        estimatedImpact: suggestion.estimatedImpact,
        automationLevel: 'assisted',
        implementation: suggestion.implementation,
        confidence: 0.8,
        reasoning: 'Query optimization will improve performance',
        analysisId: 'analysis-1',
        status: 'pending',
        createdAt: new Date(),
        metadata: {},
      });

      await refactorService.storeSuggestion(suggestion, 'analysis-1');

      expect(mockPrisma.refactorSuggestion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'optimize_query',
          priority: 'medium',
          title: 'Optimize database query',
          status: 'pending',
          analysisId: 'analysis-1',
        }),
      });
    });
  });

  describe('Auto-Application', () => {
    it('should automatically apply high-confidence suggestions', async () => {
      const mockSuggestion = {
        id: 'auto-suggestion-1',
        type: 'style_improvement',
        priority: 'low',
        title: 'Fix code style',
        description: 'Add missing semicolons',
        files: ['style.ts'],
        estimatedImpact: {
          performance: 0,
          security: 0,
          maintainability: 0.4,
          readability: 0.8,
        },
        automationLevel: 'automatic',
        implementation: {
          changes: [
            {
              file: 'style.ts',
              operation: 'update' as const,
              oldContent: 'const x = 1',
              newContent: 'const x = 1;',
            },
          ],
          tests: [],
          rollbackPlan: 'Revert formatting',
        },
        confidence: 0.95,
        reasoning: 'Style fixes are safe',
        analysisId: 'analysis-1',
        status: 'pending',
        createdAt: new Date(),
        metadata: {},
      };

      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue(mockSuggestion);
      mockPrisma.refactorExecution.create.mockResolvedValue({
        id: 'execution-1',
        suggestionId: 'auto-suggestion-1',
        status: 'pending',
        startedAt: new Date(),
        executedBy: 'system',
        changes: mockSuggestion.implementation.changes,
        rollbackPlan: 'Revert formatting',
        testResults: {
          passed: 0,
          failed: 0,
          skipped: 0,
          coverage: 0,
          errors: [],
        },
        metadata: {},
      });

      mockPrisma.refactorExecution.update.mockResolvedValue({
        id: 'execution-1',
        status: 'completed',
        completedAt: new Date(),
      });

      mockPrisma.refactorFeedback.create.mockResolvedValue({
        id: 'feedback-1',
        suggestionId: 'auto-suggestion-1',
        userId: 'system',
        action: 'approved',
        rating: 5,
        comments: 'Automatically applied successfully',
        createdAt: new Date(),
        metadata: { automatic: true },
      });

      mockFs.readFile.mockResolvedValue('const x = 1');
      mockFs.writeFile.mockResolvedValue();
      mockFs.mkdir.mockResolvedValue('');

      const execution = await refactorService.autoApplySuggestion('auto-suggestion-1');

      expect(execution.suggestionId).toBe('auto-suggestion-1');
      expect(execution.executedBy).toBe('system');
      expect(mockPrisma.refactorExecution.create).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith('style.ts', 'const x = 1;');
    });

    it('should rollback on test failures', async () => {
      const mockSuggestion = {
        id: 'failing-suggestion',
        automationLevel: 'automatic',
        implementation: {
          changes: [
            {
              file: 'failing.ts',
              operation: 'update' as const,
              oldContent: 'original code',
              newContent: 'broken code',
            },
          ],
          tests: ['test.spec.ts'],
          rollbackPlan: 'Revert changes',
        },
      };

      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue(mockSuggestion as any);
      mockPrisma.refactorExecution.create.mockResolvedValue({
        id: 'execution-2',
        suggestionId: 'failing-suggestion',
        status: 'pending',
        startedAt: new Date(),
        executedBy: 'system',
        changes: mockSuggestion.implementation.changes,
        rollbackPlan: 'Revert changes',
        testResults: {
          passed: 0,
          failed: 0,
          skipped: 0,
          coverage: 0,
          errors: [],
        },
        metadata: {},
        backupPath: '/backups/123',
      });

      // Mock test failure
      const failedTestResults = {
        passed: 45,
        failed: 5,
        skipped: 0,
        coverage: 85,
        errors: ['5 tests failed after refactoring'],
      };

      mockPrisma.refactorExecution.update
        .mockResolvedValueOnce({
          id: 'execution-2',
          testResults: failedTestResults,
        })
        .mockResolvedValueOnce({
          id: 'execution-2',
          status: 'rolled_back',
          completedAt: new Date(),
        });

      mockFs.mkdir.mockResolvedValue('');
      mockFs.writeFile.mockResolvedValue();
      mockFs.readFile.mockResolvedValue('original code');

      const execution = await refactorService.autoApplySuggestion('failing-suggestion');

      expect(mockPrisma.refactorExecution.update).toHaveBeenCalledWith({
        where: { id: 'execution-2' },
        data: {
          status: 'rolled_back',
          completedAt: expect.any(Date),
        },
      });
    });

    it('should reject non-automatic suggestions', async () => {
      const mockSuggestion = {
        id: 'manual-suggestion',
        automationLevel: 'manual',
      };

      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue(mockSuggestion as any);

      await expect(
        refactorService.autoApplySuggestion('manual-suggestion')
      ).rejects.toThrow('not marked for automatic application');
    });
  });

  describe('Feedback System', () => {
    it('should submit user feedback for suggestions', async () => {
      const feedback = {
        suggestionId: 'suggestion-1',
        userId: 'user-123',
        action: 'approved' as const,
        rating: 4,
        comments: 'Good suggestion, but needs minor adjustments',
        metadata: { reviewedManually: true },
      };

      mockPrisma.refactorFeedback.create.mockResolvedValue({
        id: 'feedback-1',
        ...feedback,
        createdAt: new Date(),
      });

      mockPrisma.refactorSuggestion.update.mockResolvedValue({
        id: 'suggestion-1',
        status: 'approved',
      });

      const result = await refactorService.submitFeedback(feedback);

      expect(result.action).toBe('approved');
      expect(result.rating).toBe(4);
      expect(mockPrisma.refactorSuggestion.update).toHaveBeenCalledWith({
        where: { id: 'suggestion-1' },
        data: { status: 'approved' },
      });
    });

    it('should queue approved suggestions for execution', async () => {
      const feedback = {
        suggestionId: 'suggestion-2',
        userId: 'user-456',
        action: 'approved' as const,
        rating: 5,
        metadata: {},
      };

      mockPrisma.refactorFeedback.create.mockResolvedValue({
        id: 'feedback-2',
        ...feedback,
        createdAt: new Date(),
      });

      mockPrisma.refactorSuggestion.update.mockResolvedValue({
        id: 'suggestion-2',
        status: 'approved',
      });

      const setTimeoutSpy = vi.spyOn(global, 'setTimeout');

      await refactorService.submitFeedback(feedback);

      expect(setTimeoutSpy).toHaveBeenCalledWith(
        expect.any(Function),
        5000
      );

      setTimeoutSpy.mockRestore();
    });
  });

  describe('Execution Management', () => {
    it('should execute approved suggestions', async () => {
      const mockSuggestion = {
        id: 'approved-suggestion',
        status: 'approved',
        implementation: {
          changes: [
            {
              file: 'approved.ts',
              operation: 'update' as const,
              oldContent: 'old code',
              newContent: 'improved code',
            },
          ],
          tests: ['approved.test.ts'],
          rollbackPlan: 'Revert to old code',
        },
      };

      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue(mockSuggestion as any);
      mockPrisma.refactorExecution.create.mockResolvedValue({
        id: 'execution-3',
        suggestionId: 'approved-suggestion',
        status: 'pending',
        startedAt: new Date(),
        executedBy: 'user-789',
        changes: mockSuggestion.implementation.changes,
        rollbackPlan: 'Revert to old code',
        testResults: {
          passed: 0,
          failed: 0,
          skipped: 0,
          coverage: 0,
          errors: [],
        },
        metadata: {},
      });

      mockPrisma.refactorExecution.update.mockResolvedValue({
        id: 'execution-3',
        status: 'completed',
        completedAt: new Date(),
      });

      mockFs.mkdir.mockResolvedValue('');
      mockFs.writeFile.mockResolvedValue();
      mockFs.readFile.mockResolvedValue('old code');

      const execution = await refactorService.executeApprovedSuggestion(
        'approved-suggestion',
        'user-789'
      );

      expect(execution.executedBy).toBe('user-789');
      expect(mockFs.writeFile).toHaveBeenCalledWith('approved.ts', 'improved code');
    });

    it('should reject execution of non-approved suggestions', async () => {
      const mockSuggestion = {
        id: 'pending-suggestion',
        status: 'pending',
      };

      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue(mockSuggestion as any);

      await expect(
        refactorService.executeApprovedSuggestion('pending-suggestion', 'user-123')
      ).rejects.toThrow('not approved for execution');
    });
  });

  describe('File Operations', () => {
    it('should create backup before applying changes', async () => {
      const changes = [
        {
          file: 'test.ts',
          operation: 'update' as const,
          oldContent: 'original',
          newContent: 'modified',
        },
      ];

      mockFs.mkdir.mockResolvedValue('');
      mockFs.readFile.mockResolvedValue('original content');
      mockFs.writeFile.mockResolvedValue();

      const backupPath = await (refactorService as any).createBackup(changes);

      expect(backupPath).toMatch(/\.magi-backups/);
      expect(mockFs.mkdir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        expect.stringContaining('test.ts'),
        'original content'
      );
    });

    it('should apply different file operations correctly', async () => {
      const createChange = {
        file: 'new.ts',
        operation: 'create' as const,
        newContent: 'new file content',
      };

      const updateChange = {
        file: 'existing.ts',
        operation: 'update' as const,
        newContent: 'updated content',
      };

      const deleteChange = {
        file: 'old.ts',
        operation: 'delete' as const,
      };

      const renameChange = {
        file: 'renamed.ts',
        operation: 'rename' as const,
        oldPath: 'old-name.ts',
        newPath: 'new-name.ts',
      };

      mockFs.mkdir.mockResolvedValue('');
      mockFs.writeFile.mockResolvedValue();
      mockFs.unlink.mockResolvedValue();
      mockFs.rename.mockResolvedValue();

      await (refactorService as any).applyFileChange(createChange);
      await (refactorService as any).applyFileChange(updateChange);
      await (refactorService as any).applyFileChange(deleteChange);
      await (refactorService as any).applyFileChange(renameChange);

      expect(mockFs.writeFile).toHaveBeenCalledWith('new.ts', 'new file content');
      expect(mockFs.writeFile).toHaveBeenCalledWith('existing.ts', 'updated content');
      expect(mockFs.unlink).toHaveBeenCalledWith('old.ts');
      expect(mockFs.rename).toHaveBeenCalledWith('old-name.ts', 'new-name.ts');
    });
  });

  describe('Metrics and Reporting', () => {
    it('should calculate refactor metrics correctly', async () => {
      const timeRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      };

      const mockSuggestions = [
        {
          id: 'suggestion-1',
          status: 'approved',
          createdAt: new Date('2024-01-15'),
          feedback: [
            { rating: 4, createdAt: new Date('2024-01-16') },
            { rating: 5, createdAt: new Date('2024-01-17') },
          ],
          executions: [
            {
              executedBy: 'system',
              status: 'completed',
              startedAt: new Date('2024-01-16T10:00:00Z'),
              completedAt: new Date('2024-01-16T10:30:00Z'),
            },
          ],
        },
        {
          id: 'suggestion-2',
          status: 'rejected',
          createdAt: new Date('2024-01-20'),
          feedback: [{ rating: 2, createdAt: new Date('2024-01-21') }],
          executions: [],
        },
      ];

      mockPrisma.refactorSuggestion.findMany.mockResolvedValue(mockSuggestions as any);

      const metrics = await refactorService.getRefactorMetrics(timeRange);

      expect(metrics.totalSuggestions).toBe(2);
      expect(metrics.approvedSuggestions).toBe(1);
      expect(metrics.rejectedSuggestions).toBe(1);
      expect(metrics.automaticApplied).toBe(1);
      expect(metrics.manualApplied).toBe(0);
      expect(metrics.averageRating).toBe(3.67); // (4+5+2)/3
      expect(metrics.successRate).toBe(1); // 1 completed execution out of 1 total
      expect(metrics.timeToImplementation).toBe(0.5); // 30 minutes
    });

    it('should retrieve pending suggestions ordered by priority', async () => {
      const mockSuggestions = [
        {
          id: 'high-priority',
          priority: 'critical',
          confidence: 0.9,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'medium-priority',
          priority: 'medium',
          confidence: 0.8,
          createdAt: new Date('2024-01-02'),
        },
      ];

      mockPrisma.refactorSuggestion.findMany.mockResolvedValue(mockSuggestions as any);

      const suggestions = await refactorService.getPendingSuggestions(10);

      expect(suggestions).toHaveLength(2);
      expect(mockPrisma.refactorSuggestion.findMany).toHaveBeenCalledWith({
        where: { status: 'pending' },
        orderBy: [
          { priority: 'desc' },
          { confidence: 'desc' },
          { createdAt: 'desc' },
        ],
        take: 10,
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle file system errors during execution', async () => {
      const mockSuggestion = {
        id: 'error-suggestion',
        automationLevel: 'automatic',
        implementation: {
          changes: [
            {
              file: 'error.ts',
              operation: 'update' as const,
              newContent: 'new content',
            },
          ],
          tests: [],
          rollbackPlan: 'Revert changes',
        },
      };

      mockPrisma.refactorSuggestion.findUnique.mockResolvedValue(mockSuggestion as any);
      mockPrisma.refactorExecution.create.mockResolvedValue({
        id: 'execution-error',
        suggestionId: 'error-suggestion',
        status: 'pending',
        startedAt: new Date(),
        executedBy: 'system',
        changes: mockSuggestion.implementation.changes,
        rollbackPlan: 'Revert changes',
        testResults: {
          passed: 0,
          failed: 0,
          skipped: 0,
          coverage: 0,
          errors: [],
        },
        metadata: {},
      });

      mockPrisma.refactorExecution.update.mockResolvedValue({
        id: 'execution-error',
        status: 'failed',
      });

      mockFs.mkdir.mockResolvedValue('');
      mockFs.writeFile.mockRejectedValue(new Error('Permission denied'));

      await expect(
        refactorService.autoApplySuggestion('error-suggestion')
      ).rejects.toThrow('Permission denied');

      expect(mockPrisma.refactorExecution.update).toHaveBeenCalledWith({
        where: { id: 'execution-error' },
        data: {
          status: 'failed',
          completedAt: expect.any(Date),
          metadata: {
            error: 'Permission denied',
          },
        },
      });
    });
  });
});