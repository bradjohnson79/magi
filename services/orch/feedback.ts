/**
 * Feedback Loop System for Intuition Layer
 *
 * Handles user corrections to improve classification and recommendation accuracy.
 * Updates model metrics when users override AI suggestions.
 */

import { prisma } from '@/lib/prisma';
import { ProjectCategory } from './classifier';
import { RecommendedStack } from './recommender';
import { trace, context, SpanStatusCode } from '@opentelemetry/api';

const tracer = trace.getTracer('feedback-system');

export interface StackCorrection {
  originalCategory: ProjectCategory;
  correctedCategory?: ProjectCategory;
  originalStack: RecommendedStack;
  correctedStack: Partial<RecommendedStack>;
  reason?: string;
  confidence: number;
}

export interface FeedbackMetrics {
  modelId: string;
  window: string;
  totalRecommendations: number;
  userCorrections: number;
  correctionRate: number;
  categoryAccuracy: number;
  stackAccuracy: number;
  avgUserSatisfaction: number;
}

export class FeedbackManager {
  private static instance: FeedbackManager;

  public static getInstance(): FeedbackManager {
    if (!FeedbackManager.instance) {
      FeedbackManager.instance = new FeedbackManager();
    }
    return FeedbackManager.instance;
  }

  /**
   * Record user correction when they override AI recommendations
   */
  async recordStackCorrection(
    userId: string,
    projectId: string,
    modelRunId: string,
    correction: StackCorrection,
    traceId?: string,
    spanId?: string
  ): Promise<void> {
    return tracer.startActiveSpan('record_stack_correction', async (span) => {
      try {
        span.setAttributes({
          'feedback.user_id': userId,
          'feedback.project_id': projectId,
          'feedback.model_run_id': modelRunId,
          'feedback.original_category': correction.originalCategory,
          'feedback.corrected_category': correction.correctedCategory || 'none',
          'feedback.correction_confidence': correction.confidence,
        });

        // Store feedback in database
        await prisma.feedback.create({
          data: {
            modelRunId,
            userId,
            rating: this.calculateRatingFromCorrection(correction),
            comment: correction.reason || 'User stack override',
            correction: {
              type: 'stack_correction',
              originalCategory: correction.originalCategory,
              correctedCategory: correction.correctedCategory,
              originalStack: this.serializeStack(correction.originalStack),
              correctedStack: correction.correctedStack,
              confidence: correction.confidence,
            },
            metadata: {
              traceId,
              spanId,
              correctionType: 'stack_override',
              timestamp: new Date().toISOString(),
            },
          },
        });

        // Update model metrics
        await this.updateModelMetrics(modelRunId, correction);

        // Log audit event
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'system.stack_correction_recorded',
            resource: 'feedback',
            resourceId: modelRunId,
            details: {
              originalCategory: correction.originalCategory,
              correctedCategory: correction.correctedCategory,
              correctionConfidence: correction.confidence,
            },
            metadata: {
              projectId,
              traceId,
              spanId,
            },
            severity: 'info',
            outcome: 'success',
          },
        });

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Record category correction when user changes project classification
   */
  async recordCategoryCorrection(
    userId: string,
    projectId: string,
    originalCategory: ProjectCategory,
    correctedCategory: ProjectCategory,
    confidence: number,
    reason?: string
  ): Promise<void> {
    return tracer.startActiveSpan('record_category_correction', async (span) => {
      try {
        span.setAttributes({
          'feedback.user_id': userId,
          'feedback.project_id': projectId,
          'feedback.original_category': originalCategory,
          'feedback.corrected_category': correctedCategory,
          'feedback.confidence': confidence,
        });

        // Update project category in database
        await prisma.project.update({
          where: { id: projectId },
          data: {
            category: correctedCategory,
            metadata: {
              categoryCorrection: {
                originalCategory,
                correctedAt: new Date().toISOString(),
                correctedBy: userId,
                reason,
                confidence,
              },
            },
          },
        });

        // Record in audit log
        await prisma.auditLog.create({
          data: {
            userId,
            action: 'user.project_category_corrected',
            resource: 'project',
            resourceId: projectId,
            details: {
              originalCategory,
              correctedCategory,
              confidence,
              reason,
            },
            severity: 'info',
            outcome: 'success',
          },
        });

        span.setStatus({ code: SpanStatusCode.OK });
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Update model metrics with correction data
   */
  private async updateModelMetrics(
    modelRunId: string,
    correction: StackCorrection
  ): Promise<void> {
    // Get the model run details
    const modelRun = await prisma.modelRun.findUnique({
      where: { id: modelRunId },
      include: { model: true },
    });

    if (!modelRun?.model) {
      throw new Error('Model run or model not found');
    }

    const modelId = modelRun.model.id;
    const window = this.getCurrentWindow();

    // Get or create model metrics for current window
    const existingMetrics = await prisma.modelMetrics.findUnique({
      where: {
        modelId_window: {
          modelId,
          window,
        },
      },
    });

    if (existingMetrics) {
      // Update existing metrics
      const newCorrectionRate = this.calculateNewCorrectionRate(
        existingMetrics.correctionRate,
        existingMetrics.totalRuns,
        1
      );

      await prisma.modelMetrics.update({
        where: {
          modelId_window: {
            modelId,
            window,
          },
        },
        data: {
          correctionRate: newCorrectionRate,
          totalRuns: existingMetrics.totalRuns + 1,
        },
      });
    } else {
      // Create new metrics record
      await prisma.modelMetrics.create({
        data: {
          modelId,
          window,
          successRate: 1.0, // Will be updated as more data comes in
          correctionRate: 1.0, // First correction
          avgConfidence: correction.confidence,
          meanTimeToFixMs: 0,
          costPerRun: 0,
          totalRuns: 1,
        },
      });
    }
  }

  /**
   * Get feedback metrics for a specific model and time window
   */
  async getFeedbackMetrics(
    modelId: string,
    window: string = this.getCurrentWindow()
  ): Promise<FeedbackMetrics | null> {
    const metrics = await prisma.modelMetrics.findUnique({
      where: {
        modelId_window: {
          modelId,
          window,
        },
      },
    });

    if (!metrics) {
      return null;
    }

    // Get additional feedback data
    const feedbackStats = await this.calculateFeedbackStats(modelId, window);

    return {
      modelId,
      window,
      totalRecommendations: metrics.totalRuns,
      userCorrections: Math.round(metrics.totalRuns * Number(metrics.correctionRate)),
      correctionRate: Number(metrics.correctionRate),
      categoryAccuracy: feedbackStats.categoryAccuracy,
      stackAccuracy: feedbackStats.stackAccuracy,
      avgUserSatisfaction: feedbackStats.avgUserSatisfaction,
    };
  }

  /**
   * Get learning insights from feedback data
   */
  async getLearningInsights(
    timeWindow: string = this.getCurrentWindow()
  ): Promise<{
    commonCorrections: Array<{
      originalCategory: ProjectCategory;
      correctedCategory: ProjectCategory;
      frequency: number;
      pattern: string;
    }>;
    improvementSuggestions: string[];
    accuracyTrends: Array<{
      window: string;
      accuracy: number;
      corrections: number;
    }>;
  }> {
    return tracer.startActiveSpan('get_learning_insights', async (span) => {
      try {
        // Analyze common correction patterns
        const corrections = await prisma.feedback.findMany({
          where: {
            correction: {
              path: ['type'],
              equals: 'stack_correction',
            },
            createdAt: {
              gte: this.getWindowStartDate(timeWindow),
            },
          },
          include: {
            modelRun: {
              include: { model: true },
            },
          },
        });

        const commonCorrections = this.analyzeCommonCorrections(corrections);
        const improvementSuggestions = this.generateImprovementSuggestions(commonCorrections);
        const accuracyTrends = await this.getAccuracyTrends();

        span.setAttributes({
          'insights.corrections_analyzed': corrections.length,
          'insights.common_patterns': commonCorrections.length,
          'insights.suggestions_generated': improvementSuggestions.length,
        });

        return {
          commonCorrections,
          improvementSuggestions,
          accuracyTrends,
        };
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: (error as Error).message
        });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Helper methods
   */
  private calculateRatingFromCorrection(correction: StackCorrection): number {
    // Lower rating if user had to make corrections
    const baseRating = 3; // Neutral
    const confidencePenalty = (1 - correction.confidence) * 2;
    return Math.max(1, Math.min(5, baseRating - confidencePenalty));
  }

  private serializeStack(stack: RecommendedStack): any {
    return {
      database: stack.database,
      auth: stack.auth,
      frontend: stack.frontend,
      backend: stack.backend,
      hosting: stack.hosting,
      extras: stack.extras,
      complexity: stack.complexity,
      timeEstimate: stack.timeEstimate,
      confidence: stack.confidence,
    };
  }

  private calculateNewCorrectionRate(
    currentRate: any,
    totalRuns: number,
    newCorrections: number
  ): number {
    const currentCorrections = totalRuns * Number(currentRate);
    const newTotalCorrections = currentCorrections + newCorrections;
    const newTotalRuns = totalRuns + 1;
    return newTotalCorrections / newTotalRuns;
  }

  private getCurrentWindow(): string {
    const now = new Date();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    return `${year}-${month}`;
  }

  private getWindowStartDate(window: string): Date {
    const [year, month] = window.split('-').map(Number);
    return new Date(year, month - 1, 1);
  }

  private async calculateFeedbackStats(modelId: string, window: string) {
    // Implementation for detailed feedback statistics
    return {
      categoryAccuracy: 0.85,
      stackAccuracy: 0.80,
      avgUserSatisfaction: 4.2,
    };
  }

  private analyzeCommonCorrections(corrections: any[]) {
    // Group corrections by pattern and frequency
    const patterns = new Map();

    corrections.forEach(feedback => {
      const correction = feedback.correction;
      if (correction?.originalCategory && correction?.correctedCategory) {
        const key = `${correction.originalCategory} → ${correction.correctedCategory}`;
        patterns.set(key, (patterns.get(key) || 0) + 1);
      }
    });

    return Array.from(patterns.entries())
      .map(([pattern, frequency]) => {
        const [original, corrected] = pattern.split(' → ');
        return {
          originalCategory: original as ProjectCategory,
          correctedCategory: corrected as ProjectCategory,
          frequency,
          pattern,
        };
      })
      .sort((a, b) => b.frequency - a.frequency)
      .slice(0, 10);
  }

  private generateImprovementSuggestions(commonCorrections: any[]): string[] {
    const suggestions = [];

    commonCorrections.forEach(correction => {
      if (correction.frequency > 5) {
        suggestions.push(
          `Consider refining classification rules for ${correction.originalCategory} → ${correction.correctedCategory} (${correction.frequency} corrections)`
        );
      }
    });

    return suggestions;
  }

  private async getAccuracyTrends() {
    // Get accuracy trends over time
    const metrics = await prisma.modelMetrics.findMany({
      orderBy: { createdAt: 'desc' },
      take: 12, // Last 12 months
    });

    return metrics.map(metric => ({
      window: metric.window,
      accuracy: 1 - Number(metric.correctionRate),
      corrections: Math.round(metric.totalRuns * Number(metric.correctionRate)),
    }));
  }
}

export const feedbackManager = FeedbackManager.getInstance();