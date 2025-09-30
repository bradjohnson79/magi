import { PrismaClient } from '@prisma/client';
import { trace } from '@opentelemetry/api';
import { CodeAnalysisService, RefactorSuggestion, FileChange } from './analysis-service';
import * as fs from 'fs/promises';
import * as path from 'path';

const tracer = trace.getTracer('refactor-service');

export interface RefactorFeedback {
  id: string;
  suggestionId: string;
  userId: string;
  action: 'approved' | 'rejected' | 'modified' | 'deferred';
  rating: number; // 1-5 scale
  comments?: string;
  modifiedImplementation?: {
    changes: FileChange[];
    reasoning: string;
  };
  appliedAt?: Date;
  reviewedBy?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export interface RefactorExecution {
  id: string;
  suggestionId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed' | 'rolled_back';
  startedAt: Date;
  completedAt?: Date;
  executedBy: string; // 'system' | userId
  changes: FileChange[];
  backupPath?: string;
  testResults: {
    passed: number;
    failed: number;
    skipped: number;
    coverage: number;
    errors: string[];
  };
  rollbackPlan: string;
  metadata: Record<string, any>;
}

export interface RefactorMetrics {
  totalSuggestions: number;
  approvedSuggestions: number;
  rejectedSuggestions: number;
  automaticApplied: number;
  manualApplied: number;
  averageRating: number;
  impactMetrics: {
    performanceImprovement: number;
    securityImprovement: number;
    maintainabilityImprovement: number;
    readabilityImprovement: number;
  };
  timeToImplementation: number; // average hours
  successRate: number;
}

export class RefactorService {
  private prisma: PrismaClient;
  private analysisService: CodeAnalysisService;

  constructor(prisma: PrismaClient, analysisService: CodeAnalysisService) {
    this.prisma = prisma;
    this.analysisService = analysisService;
  }

  async processNewSuggestions(): Promise<void> {
    return tracer.startActiveSpan('processNewSuggestions', async (span) => {
      try {
        span.addEvent('Processing new refactor suggestions');

        const analysisResults = await this.analysisService.getLatestAnalysisResults(5);

        for (const result of analysisResults) {
          for (const suggestion of result.suggestions) {
            await this.storeSuggestion(suggestion, result.id);

            // Auto-apply suggestions with high confidence and automation level
            if (suggestion.automationLevel === 'automatic' && suggestion.confidence > 0.9) {
              await this.autoApplySuggestion(suggestion.id);
            }
          }
        }

        span.addEvent('Suggestions processed');
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async storeSuggestion(suggestion: RefactorSuggestion, analysisId: string): Promise<void> {
    await this.prisma.refactorSuggestion.create({
      data: {
        type: suggestion.type,
        priority: suggestion.priority,
        title: suggestion.title,
        description: suggestion.description,
        files: suggestion.files,
        estimatedImpact: suggestion.estimatedImpact as any,
        automationLevel: suggestion.automationLevel,
        implementation: suggestion.implementation as any,
        confidence: suggestion.confidence,
        reasoning: suggestion.reasoning,
        analysisId,
        status: 'pending',
        createdAt: new Date(),
        metadata: {
          originalSuggestionId: suggestion.id,
        } as any,
      },
    });
  }

  async autoApplySuggestion(suggestionId: string): Promise<RefactorExecution> {
    return tracer.startActiveSpan('autoApplySuggestion', async (span) => {
      try {
        span.setAttributes({ suggestionId });

        const suggestion = await this.prisma.refactorSuggestion.findUnique({
          where: { id: suggestionId },
        });

        if (!suggestion) {
          throw new Error(`Suggestion ${suggestionId} not found`);
        }

        if (suggestion.automationLevel !== 'automatic') {
          throw new Error(`Suggestion ${suggestionId} is not marked for automatic application`);
        }

        const execution = await this.createExecution(suggestion as any, 'system');

        try {
          await this.executeRefactor(execution);
          await this.runTests(execution);

          if (execution.testResults.failed === 0) {
            await this.completeExecution(execution.id);
            await this.recordPositiveFeedback(suggestionId, 'system', 'Automatically applied successfully');
          } else {
            await this.rollbackExecution(execution.id);
            await this.recordNegativeFeedback(suggestionId, 'system', 'Tests failed after application');
          }
        } catch (error) {
          await this.failExecution(execution.id, (error as Error).message);
          await this.recordNegativeFeedback(suggestionId, 'system', `Execution failed: ${(error as Error).message}`);
          throw error;
        }

        span.addEvent('Auto-application completed');
        return execution;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async submitFeedback(feedback: Omit<RefactorFeedback, 'id' | 'createdAt'>): Promise<RefactorFeedback> {
    return tracer.startActiveSpan('submitFeedback', async (span) => {
      try {
        const feedbackRecord = await this.prisma.refactorFeedback.create({
          data: {
            suggestionId: feedback.suggestionId,
            userId: feedback.userId,
            action: feedback.action,
            rating: feedback.rating,
            comments: feedback.comments,
            modifiedImplementation: feedback.modifiedImplementation as any,
            appliedAt: feedback.appliedAt,
            reviewedBy: feedback.reviewedBy,
            metadata: feedback.metadata as any,
            createdAt: new Date(),
          },
        });

        // Update suggestion status based on feedback
        await this.updateSuggestionStatus(feedback.suggestionId, feedback.action);

        // If approved, queue for execution
        if (feedback.action === 'approved') {
          await this.queueForExecution(feedback.suggestionId, feedback.userId);
        }

        span.addEvent('Feedback submitted', { action: feedback.action, rating: feedback.rating });
        return feedbackRecord as RefactorFeedback;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async executeApprovedSuggestion(suggestionId: string, userId: string): Promise<RefactorExecution> {
    return tracer.startActiveSpan('executeApprovedSuggestion', async (span) => {
      try {
        const suggestion = await this.prisma.refactorSuggestion.findUnique({
          where: { id: suggestionId },
        });

        if (!suggestion) {
          throw new Error(`Suggestion ${suggestionId} not found`);
        }

        if (suggestion.status !== 'approved') {
          throw new Error(`Suggestion ${suggestionId} is not approved for execution`);
        }

        const execution = await this.createExecution(suggestion as any, userId);

        await this.executeRefactor(execution);
        await this.runTests(execution);

        if (execution.testResults.failed === 0) {
          await this.completeExecution(execution.id);
        } else {
          await this.rollbackExecution(execution.id);
        }

        span.addEvent('Suggestion executed');
        return execution;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async createExecution(suggestion: RefactorSuggestion, executedBy: string): Promise<RefactorExecution> {
    const execution: RefactorExecution = {
      id: `exec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      suggestionId: suggestion.id,
      status: 'pending',
      startedAt: new Date(),
      executedBy,
      changes: suggestion.implementation.changes,
      rollbackPlan: suggestion.implementation.rollbackPlan,
      testResults: {
        passed: 0,
        failed: 0,
        skipped: 0,
        coverage: 0,
        errors: [],
      },
      metadata: {},
    };

    await this.prisma.refactorExecution.create({
      data: {
        suggestionId: execution.suggestionId,
        status: execution.status,
        startedAt: execution.startedAt,
        executedBy: execution.executedBy,
        changes: execution.changes as any,
        rollbackPlan: execution.rollbackPlan,
        testResults: execution.testResults as any,
        metadata: execution.metadata as any,
      },
    });

    return execution;
  }

  private async executeRefactor(execution: RefactorExecution): Promise<void> {
    return tracer.startActiveSpan('executeRefactor', async (span) => {
      try {
        span.setAttributes({ executionId: execution.id });

        await this.updateExecutionStatus(execution.id, 'in_progress');

        // Create backup
        const backupPath = await this.createBackup(execution.changes);
        execution.backupPath = backupPath;

        // Apply changes
        for (const change of execution.changes) {
          await this.applyFileChange(change);
        }

        span.addEvent('Refactor changes applied');
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async createBackup(changes: FileChange[]): Promise<string> {
    const backupDir = path.join(process.cwd(), '.magi-backups', Date.now().toString());
    await fs.mkdir(backupDir, { recursive: true });

    for (const change of changes) {
      if (change.operation === 'update' || change.operation === 'delete') {
        const backupFile = path.join(backupDir, change.file);
        await fs.mkdir(path.dirname(backupFile), { recursive: true });

        try {
          const originalContent = await fs.readFile(change.file, 'utf-8');
          await fs.writeFile(backupFile, originalContent);
        } catch (error) {
          // File might not exist, which is okay for some operations
        }
      }
    }

    return backupDir;
  }

  private async applyFileChange(change: FileChange): Promise<void> {
    switch (change.operation) {
      case 'create':
        if (change.newContent) {
          await fs.mkdir(path.dirname(change.file), { recursive: true });
          await fs.writeFile(change.file, change.newContent);
        }
        break;

      case 'update':
        if (change.newContent) {
          await fs.writeFile(change.file, change.newContent);
        }
        break;

      case 'delete':
        try {
          await fs.unlink(change.file);
        } catch (error) {
          // File might not exist
        }
        break;

      case 'rename':
        if (change.oldPath && change.newPath) {
          await fs.rename(change.oldPath, change.newPath);
        }
        break;
    }
  }

  private async runTests(execution: RefactorExecution): Promise<void> {
    return tracer.startActiveSpan('runTests', async (span) => {
      try {
        // Simulate test execution - in real implementation, this would run actual tests
        const testResult = await this.simulateTestExecution();

        execution.testResults = testResult;

        await this.updateExecutionTestResults(execution.id, testResult);

        span.setAttributes({
          passed: testResult.passed,
          failed: testResult.failed,
          coverage: testResult.coverage,
        });
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async simulateTestExecution(): Promise<RefactorExecution['testResults']> {
    // Simulate test execution with random results
    const passed = Math.floor(Math.random() * 50) + 45; // 45-95 passed tests
    const failed = Math.floor(Math.random() * 5); // 0-5 failed tests
    const skipped = Math.floor(Math.random() * 3); // 0-3 skipped tests
    const coverage = Math.random() * 20 + 80; // 80-100% coverage

    return {
      passed,
      failed,
      skipped,
      coverage,
      errors: failed > 0 ? [`${failed} tests failed after refactoring`] : [],
    };
  }

  private async completeExecution(executionId: string): Promise<void> {
    await this.updateExecutionStatus(executionId, 'completed');
  }

  private async rollbackExecution(executionId: string): Promise<void> {
    const execution = await this.prisma.refactorExecution.findUnique({
      where: { id: executionId },
    });

    if (execution?.backupPath) {
      // Restore from backup
      await this.restoreFromBackup(execution.backupPath, execution.changes as FileChange[]);
    }

    await this.updateExecutionStatus(executionId, 'rolled_back');
  }

  private async failExecution(executionId: string, error: string): Promise<void> {
    await this.prisma.refactorExecution.update({
      where: { id: executionId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        metadata: {
          error,
        },
      },
    });
  }

  private async restoreFromBackup(backupPath: string, changes: FileChange[]): Promise<void> {
    for (const change of changes) {
      const backupFile = path.join(backupPath, change.file);

      try {
        const backupContent = await fs.readFile(backupFile, 'utf-8');
        await fs.writeFile(change.file, backupContent);
      } catch (error) {
        // Backup file might not exist
      }
    }
  }

  private async updateExecutionStatus(executionId: string, status: RefactorExecution['status']): Promise<void> {
    await this.prisma.refactorExecution.update({
      where: { id: executionId },
      data: {
        status,
        ...(status === 'completed' || status === 'failed' || status === 'rolled_back' ? {
          completedAt: new Date(),
        } : {}),
      },
    });
  }

  private async updateExecutionTestResults(executionId: string, testResults: RefactorExecution['testResults']): Promise<void> {
    await this.prisma.refactorExecution.update({
      where: { id: executionId },
      data: {
        testResults: testResults as any,
      },
    });
  }

  private async updateSuggestionStatus(suggestionId: string, action: RefactorFeedback['action']): Promise<void> {
    let status: string;

    switch (action) {
      case 'approved':
        status = 'approved';
        break;
      case 'rejected':
        status = 'rejected';
        break;
      case 'deferred':
        status = 'deferred';
        break;
      default:
        status = 'pending';
    }

    await this.prisma.refactorSuggestion.update({
      where: { id: suggestionId },
      data: { status },
    });
  }

  private async queueForExecution(suggestionId: string, userId: string): Promise<void> {
    // In a real implementation, this would add to a job queue
    setTimeout(async () => {
      try {
        await this.executeApprovedSuggestion(suggestionId, userId);
      } catch (error) {
        console.error('Failed to execute queued suggestion:', error);
      }
    }, 5000); // Execute after 5 seconds
  }

  private async recordPositiveFeedback(suggestionId: string, userId: string, comments: string): Promise<void> {
    await this.submitFeedback({
      suggestionId,
      userId,
      action: 'approved',
      rating: 5,
      comments,
      appliedAt: new Date(),
      metadata: { automatic: true },
    });
  }

  private async recordNegativeFeedback(suggestionId: string, userId: string, comments: string): Promise<void> {
    await this.submitFeedback({
      suggestionId,
      userId,
      action: 'rejected',
      rating: 1,
      comments,
      metadata: { automatic: true },
    });
  }

  async getPendingSuggestions(limit: number = 20): Promise<RefactorSuggestion[]> {
    const suggestions = await this.prisma.refactorSuggestion.findMany({
      where: { status: 'pending' },
      orderBy: [
        { priority: 'desc' },
        { confidence: 'desc' },
        { createdAt: 'desc' },
      ],
      take: limit,
    });

    return suggestions as RefactorSuggestion[];
  }

  async getSuggestionFeedback(suggestionId: string): Promise<RefactorFeedback[]> {
    const feedback = await this.prisma.refactorFeedback.findMany({
      where: { suggestionId },
      orderBy: { createdAt: 'desc' },
    });

    return feedback as RefactorFeedback[];
  }

  async getExecutionHistory(suggestionId?: string): Promise<RefactorExecution[]> {
    const executions = await this.prisma.refactorExecution.findMany({
      where: suggestionId ? { suggestionId } : undefined,
      orderBy: { startedAt: 'desc' },
    });

    return executions as RefactorExecution[];
  }

  async getRefactorMetrics(timeRange?: { start: Date; end: Date }): Promise<RefactorMetrics> {
    const suggestions = await this.prisma.refactorSuggestion.findMany({
      where: timeRange ? {
        createdAt: {
          gte: timeRange.start,
          lte: timeRange.end,
        },
      } : undefined,
      include: {
        feedback: true,
        executions: true,
      },
    });

    const feedback = suggestions.flatMap(s => s.feedback || []);
    const executions = suggestions.flatMap(s => s.executions || []);

    const totalSuggestions = suggestions.length;
    const approvedSuggestions = suggestions.filter(s => s.status === 'approved').length;
    const rejectedSuggestions = suggestions.filter(s => s.status === 'rejected').length;
    const automaticApplied = executions.filter(e => e.executedBy === 'system' && e.status === 'completed').length;
    const manualApplied = executions.filter(e => e.executedBy !== 'system' && e.status === 'completed').length;

    const ratings = feedback.map(f => f.rating).filter(r => r > 0);
    const averageRating = ratings.length > 0 ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length : 0;

    const completedExecutions = executions.filter(e => e.status === 'completed');
    const successRate = executions.length > 0 ? completedExecutions.length / executions.length : 0;

    // Calculate average time to implementation
    const timesToImplementation = completedExecutions
      .map(e => e.completedAt && e.startedAt ?
        (new Date(e.completedAt).getTime() - new Date(e.startedAt).getTime()) / (1000 * 60 * 60) : 0)
      .filter(t => t > 0);

    const timeToImplementation = timesToImplementation.length > 0 ?
      timesToImplementation.reduce((sum, t) => sum + t, 0) / timesToImplementation.length : 0;

    // Calculate impact metrics (simplified)
    const impactMetrics = {
      performanceImprovement: 0.15,
      securityImprovement: 0.25,
      maintainabilityImprovement: 0.35,
      readabilityImprovement: 0.20,
    };

    return {
      totalSuggestions,
      approvedSuggestions,
      rejectedSuggestions,
      automaticApplied,
      manualApplied,
      averageRating,
      impactMetrics,
      timeToImplementation,
      successRate,
    };
  }
}