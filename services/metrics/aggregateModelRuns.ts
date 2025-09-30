/**
 * Model Metrics Aggregation Service
 *
 * Computes and stores aggregated metrics for model performance tracking.
 * Designed to run as a nightly cron job or serverless function.
 */

import { prisma } from '@/lib/db';
import { redactSecretsFromObject } from '@/lib/utils/secretRedaction';

export interface ModelMetricsData {
  modelId: string;
  window: string;
  successRate: number;
  correctionRate: number;
  avgConfidence: number;
  meanTimeToFixMs: number;
  costPerRun: number;
  totalRuns: number;
}

export interface AggregationOptions {
  windows?: string[];
  modelIds?: string[];
  excludeNonConsenting?: boolean;
  batchSize?: number;
  dryRun?: boolean;
}

export class ModelMetricsAggregator {
  private readonly DEFAULT_WINDOWS = ['7d', '30d'];
  private readonly BATCH_SIZE = 1000;

  constructor(private options: AggregationOptions = {}) {
    this.options = {
      windows: this.DEFAULT_WINDOWS,
      excludeNonConsenting: true,
      batchSize: this.BATCH_SIZE,
      dryRun: false,
      ...options,
    };
  }

  /**
   * Run aggregation for all models and windows
   */
  async runAggregation(): Promise<{
    processedModels: number;
    totalMetrics: number;
    errors: string[];
  }> {
    console.log('Starting model metrics aggregation...');
    const startTime = Date.now();

    const errors: string[] = [];
    let processedModels = 0;
    let totalMetrics = 0;

    try {
      // Get all active models to process
      const models = await this.getModelsToProcess();
      console.log(`Found ${models.length} models to process`);

      for (const model of models) {
        try {
          const modelMetrics = await this.aggregateMetricsForModel(model.id);
          totalMetrics += modelMetrics.length;
          processedModels++;

          if (!this.options.dryRun) {
            await this.storeMetrics(modelMetrics);
          }

          console.log(`Processed model ${model.name} (${model.id}): ${modelMetrics.length} metrics`);

        } catch (error) {
          const errorMsg = `Failed to process model ${model.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Aggregation completed in ${duration}ms. Processed: ${processedModels} models, ${totalMetrics} metrics`);

      // Log aggregation telemetry
      await this.logAggregationTelemetry({
        processedModels,
        totalMetrics,
        duration,
        errors: errors.length,
        dryRun: this.options.dryRun || false,
      });

      return { processedModels, totalMetrics, errors };

    } catch (error) {
      const errorMsg = `Aggregation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(errorMsg);
      errors.push(errorMsg);

      return { processedModels, totalMetrics, errors };
    }
  }

  /**
   * Get models that need metric aggregation
   */
  private async getModelsToProcess(): Promise<Array<{ id: string; name: string }>> {
    const whereClause = {
      isActive: true,
      ...(this.options.modelIds && { id: { in: this.options.modelIds } }),
    };

    return await prisma.model.findMany({
      where: whereClause,
      select: { id: true, name: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Aggregate metrics for a single model across all windows
   */
  private async aggregateMetricsForModel(modelId: string): Promise<ModelMetricsData[]> {
    const metrics: ModelMetricsData[] = [];

    for (const window of this.options.windows || this.DEFAULT_WINDOWS) {
      try {
        const windowMetrics = await this.computeWindowMetrics(modelId, window);
        if (windowMetrics) {
          metrics.push(windowMetrics);
        }
      } catch (error) {
        console.error(`Failed to compute ${window} metrics for model ${modelId}:`, error);
      }
    }

    return metrics;
  }

  /**
   * Compute metrics for a specific model and time window
   */
  private async computeWindowMetrics(modelId: string, window: string): Promise<ModelMetricsData | null> {
    const windowStart = this.getWindowStartDate(window);
    if (!windowStart) {
      console.error(`Invalid window: ${window}`);
      return null;
    }

    // Build query conditions
    const baseWhere = {
      modelId,
      createdAt: { gte: windowStart },
      ...(this.options.excludeNonConsenting && {
        user: { allowTraining: true },
      }),
    };

    // Get basic run statistics
    const runStats = await prisma.modelRun.aggregate({
      where: baseWhere,
      _count: { id: true },
      _avg: {
        confidence: true,
        costUsd: true,
        runtimeMs: true,
      },
    });

    const totalRuns = runStats._count.id;
    if (totalRuns === 0) {
      return {
        modelId,
        window,
        successRate: 0,
        correctionRate: 0,
        avgConfidence: 0,
        meanTimeToFixMs: 0,
        costPerRun: 0,
        totalRuns: 0,
      };
    }

    // Get success rate
    const successfulRuns = await prisma.modelRun.count({
      where: { ...baseWhere, success: true },
    });

    // Get correction rate from feedback
    const runsWithFeedback = await prisma.modelRun.findMany({
      where: {
        ...baseWhere,
        feedback: { some: {} },
      },
      include: {
        feedback: {
          select: { correction: true },
        },
      },
    });

    const correctionsCount = runsWithFeedback.reduce((count, run) => {
      return count + run.feedback.filter(f => f.correction !== null).length;
    }, 0);

    const feedbackCount = runsWithFeedback.reduce((count, run) => count + run.feedback.length, 0);

    // Calculate metrics with handling for potential nulls
    const successRate = totalRuns > 0 ? successfulRuns / totalRuns : 0;
    const correctionRate = feedbackCount > 0 ? correctionsCount / feedbackCount : 0;
    const avgConfidence = Number(runStats._avg.confidence) || 0;
    const costPerRun = Number(runStats._avg.costUsd) || 0;
    const meanTimeToFixMs = Number(runStats._avg.runtimeMs) || 0;

    return {
      modelId,
      window,
      successRate: Math.min(Math.max(successRate, 0), 1), // Clamp between 0 and 1
      correctionRate: Math.min(Math.max(correctionRate, 0), 1),
      avgConfidence: Math.min(Math.max(avgConfidence, 0), 1),
      meanTimeToFixMs: Math.max(meanTimeToFixMs, 0),
      costPerRun: Math.max(costPerRun, 0),
      totalRuns,
    };
  }

  /**
   * Store computed metrics in the database
   */
  private async storeMetrics(metrics: ModelMetricsData[]): Promise<void> {
    for (const metric of metrics) {
      try {
        await prisma.modelMetrics.upsert({
          where: {
            modelId_window_createdAt: {
              modelId: metric.modelId,
              window: metric.window,
              createdAt: new Date(),
            },
          },
          create: {
            modelId: metric.modelId,
            window: metric.window,
            successRate: metric.successRate,
            correctionRate: metric.correctionRate,
            avgConfidence: metric.avgConfidence,
            meanTimeToFixMs: metric.meanTimeToFixMs,
            costPerRun: metric.costPerRun,
            totalRuns: metric.totalRuns,
          },
          update: {
            successRate: metric.successRate,
            correctionRate: metric.correctionRate,
            avgConfidence: metric.avgConfidence,
            meanTimeToFixMs: metric.meanTimeToFixMs,
            costPerRun: metric.costPerRun,
            totalRuns: metric.totalRuns,
          },
        });
      } catch (error) {
        console.error(`Failed to store metrics for model ${metric.modelId}, window ${metric.window}:`, error);
        throw error;
      }
    }
  }

  /**
   * Convert window string to start date
   */
  private getWindowStartDate(window: string): Date | null {
    const now = new Date();

    switch (window) {
      case '7d':
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case '30d':
        return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      case '90d':
        return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      case '1h':
        return new Date(now.getTime() - 60 * 60 * 1000);
      case '24h':
        return new Date(now.getTime() - 24 * 60 * 60 * 1000);
      default:
        // Try to parse as number of days
        const match = window.match(/^(\d+)d$/);
        if (match) {
          const days = parseInt(match[1], 10);
          return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
        }
        return null;
    }
  }

  /**
   * Log aggregation telemetry
   */
  private async logAggregationTelemetry(data: {
    processedModels: number;
    totalMetrics: number;
    duration: number;
    errors: number;
    dryRun: boolean;
  }): Promise<void> {
    try {
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'model_metrics_aggregation',
          payload: redactSecretsFromObject({
            ...data,
            timestamp: new Date().toISOString(),
            windows: this.options.windows,
            batchSize: this.options.batchSize,
          }),
        },
      });
    } catch (error) {
      console.error('Failed to log aggregation telemetry:', error);
    }
  }

  /**
   * Clean up old metrics (keep last 90 days)
   */
  async cleanupOldMetrics(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    try {
      const result = await prisma.modelMetrics.deleteMany({
        where: {
          createdAt: { lt: cutoffDate },
        },
      });

      console.log(`Cleaned up ${result.count} old metric records`);
      return result.count;
    } catch (error) {
      console.error('Failed to cleanup old metrics:', error);
      throw error;
    }
  }
}

/**
 * Main aggregation function for use in cron jobs
 */
export async function runModelMetricsAggregation(options?: AggregationOptions): Promise<void> {
  const aggregator = new ModelMetricsAggregator(options);
  const result = await aggregator.runAggregation();

  if (result.errors.length > 0) {
    console.error(`Aggregation completed with ${result.errors.length} errors:`, result.errors);
  }

  console.log(`Successfully processed ${result.processedModels} models and generated ${result.totalMetrics} metrics`);
}

/**
 * Helper function to get current metrics for a model
 */
export async function getModelMetrics(
  modelId: string,
  window: string = '7d'
): Promise<ModelMetricsData | null> {
  try {
    const metrics = await prisma.modelMetrics.findFirst({
      where: { modelId, window },
      orderBy: { createdAt: 'desc' },
    });

    if (!metrics) return null;

    return {
      modelId: metrics.modelId,
      window: metrics.window,
      successRate: Number(metrics.successRate),
      correctionRate: Number(metrics.correctionRate),
      avgConfidence: Number(metrics.avgConfidence),
      meanTimeToFixMs: metrics.meanTimeToFixMs,
      costPerRun: Number(metrics.costPerRun),
      totalRuns: metrics.totalRuns,
    };
  } catch (error) {
    console.error(`Failed to get metrics for model ${modelId}:`, error);
    return null;
  }
}

/**
 * Get metrics comparison between models
 */
export async function compareModelMetrics(
  modelIds: string[],
  window: string = '7d'
): Promise<ModelMetricsData[]> {
  try {
    const metrics = await prisma.modelMetrics.findMany({
      where: {
        modelId: { in: modelIds },
        window,
      },
      orderBy: [{ createdAt: 'desc' }, { modelId: 'asc' }],
      distinct: ['modelId'],
    });

    return metrics.map(m => ({
      modelId: m.modelId,
      window: m.window,
      successRate: Number(m.successRate),
      correctionRate: Number(m.correctionRate),
      avgConfidence: Number(m.avgConfidence),
      meanTimeToFixMs: m.meanTimeToFixMs,
      costPerRun: Number(m.costPerRun),
      totalRuns: m.totalRuns,
    }));
  } catch (error) {
    console.error('Failed to compare model metrics:', error);
    return [];
  }
}