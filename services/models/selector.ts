/**
 * Model Selection Service
 *
 * Handles intelligent model selection with canary testing support.
 * Routes a small percentage of critical tasks to canary models for testing.
 */

import { modelRegistry } from './registry';
import type { ModelConfig } from './registry';
import { getModelMetrics } from '../metrics/aggregateModelRuns';

export interface ModelSelectionContext {
  role: string;
  isCritical?: boolean;
  userId?: string;
  projectId?: string;
  taskType?: string;
  capabilities?: string[];
}

export interface ModelSelectionResult {
  model: ModelConfig;
  reason: 'stable' | 'canary' | 'fallback' | 'performance_based';
  confidence: number;
  metadata: {
    candidateCount: number;
    canaryEnabled: boolean;
    performanceConsidered: boolean;
    fallbackUsed: boolean;
  };
}

export interface CanaryConfig {
  enabled: boolean;
  percentage: number;
  criticalTasksOnly: boolean;
  excludeRoles: string[];
}

export class ModelSelector {
  private readonly canaryConfig: CanaryConfig;
  private readonly performanceWeighting: number = 0.7; // Weight for performance vs availability

  constructor() {
    this.canaryConfig = {
      enabled: process.env.CANARY_ENABLED === 'true',
      percentage: parseInt(process.env.CANARY_PERCENT || '5', 10),
      criticalTasksOnly: process.env.CANARY_CRITICAL_ONLY === 'true',
      excludeRoles: (process.env.CANARY_EXCLUDE_ROLES || '').split(',').filter(Boolean),
    };

    console.log('Model selector initialized with canary config:', this.canaryConfig);
  }

  /**
   * Select the best model for a given context
   */
  async selectModel(context: ModelSelectionContext): Promise<ModelSelectionResult | null> {
    try {
      // Get available models for the role
      const candidates = await modelRegistry.getModelsByRole(context.role);

      if (candidates.length === 0) {
        console.warn(`No models available for role: ${context.role}`);
        return null;
      }

      // Filter by capabilities if specified
      const eligibleModels = context.capabilities
        ? candidates.filter(model =>
            context.capabilities!.every(cap => model.capabilities.includes(cap))
          )
        : candidates;

      if (eligibleModels.length === 0) {
        console.warn(`No models with required capabilities for role: ${context.role}`);
        return null;
      }

      // Separate stable and canary models
      const stableModels = eligibleModels.filter(m => m.status === 'stable');
      const canaryModels = eligibleModels.filter(m => m.status === 'canary');

      // Determine if canary selection is applicable
      const shouldConsiderCanary = this.shouldUseCanary(context, canaryModels);

      let selectedModel: ModelConfig;
      let reason: ModelSelectionResult['reason'];
      let confidence: number;

      if (shouldConsiderCanary && canaryModels.length > 0) {
        // Select best canary model based on performance
        const canarySelection = await this.selectBestPerformingModel(canaryModels);
        selectedModel = canarySelection.model;
        reason = 'canary';
        confidence = canarySelection.confidence;
      } else if (stableModels.length > 0) {
        // Select best stable model based on performance
        const stableSelection = await this.selectBestPerformingModel(stableModels);
        selectedModel = stableSelection.model;
        reason = stableSelection.confidence > 0.8 ? 'performance_based' : 'stable';
        confidence = stableSelection.confidence;
      } else {
        // Fallback to any available model
        selectedModel = eligibleModels[0];
        reason = 'fallback';
        confidence = 0.5;
      }

      return {
        model: selectedModel,
        reason,
        confidence,
        metadata: {
          candidateCount: eligibleModels.length,
          canaryEnabled: this.canaryConfig.enabled,
          performanceConsidered: reason === 'performance_based',
          fallbackUsed: reason === 'fallback',
        },
      };

    } catch (error) {
      console.error('Failed to select model:', error);
      return null;
    }
  }

  /**
   * Select the best performing model from a list of candidates
   */
  private async selectBestPerformingModel(
    models: ModelConfig[]
  ): Promise<{ model: ModelConfig; confidence: number }> {
    if (models.length === 1) {
      return { model: models[0], confidence: 0.8 };
    }

    // Score models based on metrics
    const scoredModels = await Promise.all(
      models.map(async (model) => {
        const score = await this.calculateModelScore(model);
        return { model, score };
      })
    );

    // Sort by score (highest first)
    scoredModels.sort((a, b) => b.score - a.score);

    const bestModel = scoredModels[0];
    const confidence = Math.min(bestModel.score, 1.0);

    return {
      model: bestModel.model,
      confidence,
    };
  }

  /**
   * Calculate a performance score for a model
   */
  private async calculateModelScore(model: ModelConfig): Promise<number> {
    try {
      // Get recent metrics for the model
      const metrics7d = await getModelMetrics(model.id, '7d');
      const metrics30d = await getModelMetrics(model.id, '30d');

      if (!metrics7d && !metrics30d) {
        // No metrics available, use moderate score
        return 0.6;
      }

      // Use 7d metrics if available, otherwise 30d
      const metrics = metrics7d || metrics30d!;

      // Calculate weighted score
      let score = 0;

      // Success rate (40% weight)
      score += metrics.successRate * 0.4;

      // Confidence (30% weight)
      score += metrics.avgConfidence * 0.3;

      // Inverse correction rate (20% weight) - lower correction rate is better
      score += (1 - metrics.correctionRate) * 0.2;

      // Performance factor (10% weight) - lower cost and faster execution
      const performanceFactor = this.calculatePerformanceFactor(metrics.costPerRun, metrics.meanTimeToFixMs);
      score += performanceFactor * 0.1;

      // Boost score for recent activity
      if (metrics.totalRuns > 10) {
        score *= 1.1;
      }

      // Cap at 1.0
      return Math.min(score, 1.0);

    } catch (error) {
      console.error(`Failed to calculate score for model ${model.id}:`, error);
      return 0.5; // Default moderate score
    }
  }

  /**
   * Calculate performance factor based on cost and execution time
   */
  private calculatePerformanceFactor(costPerRun: number, meanTimeMs: number): number {
    // Normalize cost (assuming reasonable range of $0.001 to $0.10 per run)
    const normalizedCost = Math.max(0, Math.min(1, costPerRun / 0.1));

    // Normalize time (assuming reasonable range of 1s to 60s)
    const normalizedTime = Math.max(0, Math.min(1, meanTimeMs / 60000));

    // Better performance = lower cost and time
    return 1 - (normalizedCost * 0.6 + normalizedTime * 0.4);
  }

  /**
   * Determine if canary model should be used
   */
  private shouldUseCanary(context: ModelSelectionContext, canaryModels: ModelConfig[]): boolean {
    // Check if canary is enabled
    if (!this.canaryConfig.enabled || canaryModels.length === 0) {
      return false;
    }

    // Check if role is excluded
    if (this.canaryConfig.excludeRoles.includes(context.role)) {
      return false;
    }

    // Check if critical tasks only and this isn't critical
    if (this.canaryConfig.criticalTasksOnly && !context.isCritical) {
      return false;
    }

    // Use deterministic selection based on user/project ID for consistent experience
    const seed = this.generateSeed(context);
    const percentage = (seed % 100) + 1;

    return percentage <= this.canaryConfig.percentage;
  }

  /**
   * Generate a deterministic seed for canary selection
   */
  private generateSeed(context: ModelSelectionContext): number {
    // Create a seed based on user and project for consistent canary assignment
    const seedString = `${context.userId || 'anonymous'}-${context.projectId || 'default'}-${context.role}`;

    // Simple hash function
    let hash = 0;
    for (let i = 0; i < seedString.length; i++) {
      const char = seedString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return Math.abs(hash);
  }

  /**
   * Get canary configuration
   */
  getCanaryConfig(): CanaryConfig {
    return { ...this.canaryConfig };
  }

  /**
   * Update canary configuration
   */
  updateCanaryConfig(updates: Partial<CanaryConfig>): void {
    Object.assign(this.canaryConfig, updates);
    console.log('Updated canary config:', this.canaryConfig);
  }

  /**
   * Get selection statistics
   */
  async getSelectionStats(role?: string): Promise<{
    totalSelections: number;
    stableSelections: number;
    canarySelections: number;
    canaryPercentage: number;
  }> {
    // This would typically come from telemetry data
    // For now, return mock data
    return {
      totalSelections: 100,
      stableSelections: 95,
      canarySelections: 5,
      canaryPercentage: 5.0,
    };
  }
}

// Export singleton instance
export const modelSelector = new ModelSelector();

/**
 * Convenience function for model selection
 */
export async function selectModelForTask(
  role: string,
  options: {
    isCritical?: boolean;
    userId?: string;
    projectId?: string;
    taskType?: string;
    capabilities?: string[];
  } = {}
): Promise<ModelSelectionResult | null> {
  return await modelSelector.selectModel({
    role,
    ...options,
  });
}