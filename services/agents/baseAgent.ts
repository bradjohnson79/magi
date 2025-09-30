/**
 * Base Agent Implementation
 *
 * Provides common functionality for all AI Matrix agents including:
 * - Model run logging
 * - Error handling
 * - Metrics collection
 * - Input validation
 * - Health monitoring
 */

import { prisma } from '@/lib/db';
import { redactSecretsFromObject } from '@/lib/utils/secretRedaction';
import { AgentSecretsHelper } from './secretsHelper';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES, getCurrentTraceId, getCurrentSpanId } from '@/services/tracing/setup';
import {
  Agent,
  AgentContext,
  AgentResult,
  AgentConfig,
  AgentHealthStatus,
  LogEntry,
  ExecutionMetrics,
  ModelRunData,
  createLogEntry,
  createExecutionMetrics,
  finalizeMetrics,
  AgentContextSchema,
} from './types';

export abstract class BaseAgent implements Agent {
  public abstract readonly name: string;
  public abstract readonly version: string;
  public abstract readonly capabilities: string[];

  protected config: AgentConfig;
  protected logs: LogEntry[] = [];
  protected metrics: ExecutionMetrics;
  protected secrets: AgentSecretsHelper;
  private healthMetrics = {
    totalExecutions: 0,
    successCount: 0,
    responseTimes: [] as number[],
    lastCheck: new Date(),
  };

  constructor(config: AgentConfig) {
    this.config = config;
    this.metrics = createExecutionMetrics();
    this.secrets = new AgentSecretsHelper(this.name);
  }

  /**
   * Main execution method - implements common workflow
   */
  async execute(context: AgentContext): Promise<AgentResult> {
    return await withSpan(`agent.${this.name}.execute`, async () => {
      this.logs = [];
      this.metrics = createExecutionMetrics();
      this.healthMetrics.totalExecutions++;

      // Update secrets helper with user context
      this.secrets = new AgentSecretsHelper(this.name, context.userId);

      addSpanAttributes({
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'agent_execution',
        'agent.name': this.name,
        'agent.version': this.version,
        'task.id': context.taskId,
        'user.id': context.userId || 'anonymous',
      });

      try {
        this.log('info', `Starting ${this.name} execution`, { taskId: context.taskId });

        // Validate inputs
        const validation = await this.validateInputs(context.inputs);
        if (!validation.valid) {
          throw new Error(`Input validation failed: ${validation.errors.join(', ')}`);
        }

        // Execute agent-specific logic
        const result = await this.executeInternal(context);

        // Log successful execution
        await this.logModelRun(context, result, true);

        this.healthMetrics.successCount++;
        this.log('info', `${this.name} execution completed successfully`);

        return {
          ...result,
          logs: this.logs,
          metrics: finalizeMetrics(this.metrics),
        };

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        this.log('error', `${this.name} execution failed: ${errorMessage}`);

        // Log failed execution
        await this.logModelRun(context, { success: false, error: errorMessage }, false);

        return {
          success: false,
          error: errorMessage,
          logs: this.logs,
          metrics: finalizeMetrics(this.metrics),
        };
      } finally {
        // Update health metrics
        if (this.metrics.durationMs) {
          this.healthMetrics.responseTimes.push(this.metrics.durationMs);
          // Keep only last 100 response times
          if (this.healthMetrics.responseTimes.length > 100) {
            this.healthMetrics.responseTimes = this.healthMetrics.responseTimes.slice(-100);
          }
        }
        this.healthMetrics.lastCheck = new Date();
      }
    });
  }

  /**
   * Abstract method for agent-specific execution logic
   */
  protected abstract executeInternal(context: AgentContext): Promise<Omit<AgentResult, 'logs' | 'metrics'>>;

  /**
   * Validate inputs using agent-specific schema
   */
  async validateInputs(inputs: Record<string, any>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Basic validation - subclasses can override for specific validation
      if (!inputs || typeof inputs !== 'object') {
        errors.push('Inputs must be a valid object');
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      return {
        valid: false,
        errors: [`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Get agent health status
   */
  async getHealthStatus(): Promise<AgentHealthStatus> {
    const avgResponseTime = this.healthMetrics.responseTimes.length > 0
      ? this.healthMetrics.responseTimes.reduce((a, b) => a + b, 0) / this.healthMetrics.responseTimes.length
      : 0;

    const successRate = this.healthMetrics.totalExecutions > 0
      ? this.healthMetrics.successCount / this.healthMetrics.totalExecutions
      : 1;

    return {
      healthy: successRate >= 0.8, // 80% success rate threshold
      lastCheck: this.healthMetrics.lastCheck,
      metrics: {
        averageResponseTime: avgResponseTime,
        successRate,
        totalExecutions: this.healthMetrics.totalExecutions,
      },
    };
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.logs = [];
    // Subclasses can override for specific cleanup
  }

  /**
   * Log a message with context
   */
  protected log(
    level: LogEntry['level'],
    message: string,
    context?: Record<string, any>
  ): void {
    const logEntry = createLogEntry(level, message, context);
    this.logs.push(logEntry);

    // Also log to console for development
    switch (level) {
      case 'debug':
        console.debug(`[${this.name}] ${message}`, context);
        break;
      case 'info':
        console.info(`[${this.name}] ${message}`, context);
        break;
      case 'warn':
        console.warn(`[${this.name}] ${message}`, context);
        break;
      case 'error':
        console.error(`[${this.name}] ${message}`, context);
        break;
    }
  }

  /**
   * Log model run to database
   */
  protected async logModelRun(
    context: AgentContext,
    result: any,
    success: boolean,
    modelData?: Partial<ModelRunData>
  ): Promise<void> {
    try {
      // Redact sensitive information
      const redactedInputs = redactSecretsFromObject(context.inputs);
      const redactedOutputs = success ? redactSecretsFromObject(result.outputs || {}) : {};

      const modelRun = await prisma.modelRun.create({
        data: {
          userId: context.userId,
          projectId: context.projectId,
          inputPayload: redactedInputs,
          outputPayload: success ? redactedOutputs : null,
          success,
          runtimeMs: this.metrics.durationMs || null,
          costUsd: modelData?.cost || this.metrics.cost || null,
          confidence: null, // Can be set by subclasses
          provenance: {
            agentType: this.name,
            agentVersion: this.version,
            model: modelData?.model || this.config.model,
            taskId: context.taskId,
            sessionId: context.sessionId,
            executionTime: this.metrics.durationMs,
            modelCalls: this.metrics.modelCalls,
            cacheHits: this.metrics.cacheHits,
            ...modelData?.metadata,
          },
          errorMessage: success ? null : (result.error || 'Execution failed'),
          traceId: getCurrentTraceId(),
          spanId: getCurrentSpanId(),
        },
      });

      this.log('debug', 'Model run logged', { modelRunId: modelRun.id });

    } catch (error) {
      // Don't throw on logging errors, just warn
      this.log('warn', 'Failed to log model run', { error: error instanceof Error ? error.message : 'Unknown error' });
    }
  }

  /**
   * Make an API call to an AI model (to be implemented by subclasses)
   */
  protected async callModel(
    prompt: string,
    options?: {
      model?: string;
      maxTokens?: number;
      temperature?: number;
      system?: string;
    }
  ): Promise<{
    response: string;
    tokensUsed: number;
    cost: number;
  }> {
    // This is a stub - subclasses should implement actual model calls
    this.metrics.modelCalls++;

    this.log('debug', 'Model call made', {
      model: options?.model || this.config.model,
      promptLength: prompt.length,
    });

    // Return mock response for base implementation
    return {
      response: 'Mock response from base agent',
      tokensUsed: 100,
      cost: 0.001,
    };
  }

  /**
   * Check cache for previous results
   */
  protected async checkCache(key: string): Promise<any | null> {
    // Cache implementation would go here
    // For now, return null (cache miss)
    return null;
  }

  /**
   * Store result in cache
   */
  protected async setCache(key: string, value: any, ttl?: number): Promise<void> {
    // Cache implementation would go here
    this.metrics.cacheHits++;
  }

  /**
   * Generate a cache key for inputs
   */
  protected generateCacheKey(inputs: Record<string, any>): string {
    const sortedInputs = Object.keys(inputs)
      .sort()
      .reduce((sorted, key) => {
        sorted[key] = inputs[key];
        return sorted;
      }, {} as Record<string, any>);

    return `${this.name}:${this.version}:${JSON.stringify(sortedInputs)}`;
  }

  /**
   * Create a snapshot before making changes (if needed)
   */
  protected async createSnapshot(context: AgentContext, reason: string): Promise<string | null> {
    if (!context.projectId) {
      this.log('warn', 'Cannot create snapshot without project ID');
      return null;
    }

    try {
      // This would integrate with the snapshot service
      // For now, return a mock snapshot ID
      const snapshotId = `snapshot-${Date.now()}`;

      this.log('info', 'Snapshot created', { snapshotId, reason });

      return snapshotId;
    } catch (error) {
      this.log('error', 'Failed to create snapshot', { error: error instanceof Error ? error.message : 'Unknown error' });
      return null;
    }
  }

  /**
   * Validate context before execution
   */
  protected validateContext(context: AgentContext): void {
    const result = AgentContextSchema.safeParse(context);
    if (!result.success) {
      throw new Error(`Invalid context: ${result.error.issues.map(i => i.message).join(', ')}`);
    }
  }
}