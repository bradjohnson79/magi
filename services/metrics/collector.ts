/**
 * Metrics Collector Service
 *
 * Centralizes collection and recording of performance metrics, errors, and runtime
 * telemetry into the telemetry_events table for observability and monitoring.
 */

import { prisma } from '@/lib/db';
import { getCurrentTraceId, getCurrentSpanId } from '@/services/tracing/setup';

// Metric types that can be collected
export type MetricType =
  | 'api_latency'
  | 'db_query_time'
  | 'model_run_time'
  | 'health_check_latency'
  | 'error_rate'
  | 'success_rate'
  | 'system_resource'
  | 'mcp_latency'
  | 'storage_latency'
  | 'custom';

// Metric payload structure
export interface MetricPayload {
  // Core metric data
  name: string;
  value: number;
  unit: 'ms' | 'seconds' | 'bytes' | 'count' | 'percentage' | 'ratio';

  // Context information
  operation?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;

  // Performance data
  startTime?: number;
  endTime?: number;
  duration?: number;

  // Error information
  error?: {
    message: string;
    code?: string;
    stack?: string;
    type?: string;
  };

  // Additional metadata
  metadata?: Record<string, any>;

  // Tracing information (for future OpenTelemetry integration)
  traceId?: string;
  spanId?: string;
  parentSpanId?: string;
}

// Metric collection options
export interface CollectionOptions {
  projectId?: string;
  userId?: string;
  sessionId?: string;
  tags?: Record<string, string>;
  timestamp?: Date;
  immediate?: boolean; // Skip batching for critical metrics
}

export class MetricsCollector {
  private batchQueue: Array<{
    type: MetricType;
    payload: MetricPayload;
    options: CollectionOptions;
    timestamp: Date;
  }> = [];

  private readonly BATCH_SIZE = 50;
  private readonly BATCH_TIMEOUT = 5000; // 5 seconds
  private batchTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  /**
   * Record a latency metric (duration in milliseconds)
   */
  async recordLatency(
    operation: string,
    duration: number,
    options: CollectionOptions = {}
  ): Promise<void> {
    await this.recordMetric('api_latency', {
      name: `${operation}_latency`,
      value: duration,
      unit: 'ms',
      operation,
      duration,
      startTime: Date.now() - duration,
      endTime: Date.now(),
    }, options);
  }

  /**
   * Record an error occurrence
   */
  async recordError(
    operation: string,
    error: Error | string,
    options: CollectionOptions = {}
  ): Promise<void> {
    const errorInfo = typeof error === 'string'
      ? { message: error, type: 'string' }
      : {
          message: error.message,
          code: (error as any).code,
          stack: error.stack,
          type: error.constructor.name,
        };

    await this.recordMetric('error_rate', {
      name: `${operation}_error`,
      value: 1,
      unit: 'count',
      operation,
      error: errorInfo,
    }, { ...options, immediate: true }); // Errors are recorded immediately
  }

  /**
   * Record a success metric
   */
  async recordSuccess(
    operation: string,
    options: CollectionOptions = {}
  ): Promise<void> {
    await this.recordMetric('success_rate', {
      name: `${operation}_success`,
      value: 1,
      unit: 'count',
      operation,
    }, options);
  }

  /**
   * Record database query performance
   */
  async recordDatabaseQuery(
    query: string,
    duration: number,
    success: boolean,
    options: CollectionOptions = {}
  ): Promise<void> {
    await this.recordMetric('db_query_time', {
      name: 'db_query',
      value: duration,
      unit: 'ms',
      operation: 'database_query',
      duration,
      metadata: {
        query: query.substring(0, 100), // Truncate for storage
        success,
      },
    }, options);
  }

  /**
   * Record model run performance
   */
  async recordModelRun(
    modelId: string,
    duration: number,
    success: boolean,
    tokensUsed?: number,
    options: CollectionOptions = {}
  ): Promise<void> {
    await this.recordMetric('model_run_time', {
      name: 'model_execution',
      value: duration,
      unit: 'ms',
      operation: 'model_run',
      duration,
      metadata: {
        modelId,
        success,
        tokensUsed,
      },
    }, options);
  }

  /**
   * Record system resource usage
   */
  async recordSystemMetrics(options: CollectionOptions = {}): Promise<void> {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Record memory metrics
    await this.recordMetric('system_resource', {
      name: 'memory_usage',
      value: Math.round(memoryUsage.heapUsed / 1024 / 1024),
      unit: 'bytes',
      operation: 'system_monitoring',
      metadata: {
        heapUsed: memoryUsage.heapUsed,
        heapTotal: memoryUsage.heapTotal,
        external: memoryUsage.external,
        rss: memoryUsage.rss,
      },
    }, options);

    // Record CPU metrics
    await this.recordMetric('system_resource', {
      name: 'cpu_usage',
      value: cpuUsage.user + cpuUsage.system,
      unit: 'ms',
      operation: 'system_monitoring',
      metadata: {
        user: cpuUsage.user,
        system: cpuUsage.system,
      },
    }, options);

    // Record uptime
    await this.recordMetric('system_resource', {
      name: 'process_uptime',
      value: process.uptime(),
      unit: 'seconds',
      operation: 'system_monitoring',
    }, options);
  }

  /**
   * Record MCP (Model Context Protocol) health metrics
   */
  async recordMCPHealth(
    service: string,
    healthy: boolean,
    latency?: number,
    options: CollectionOptions = {}
  ): Promise<void> {
    await this.recordMetric('mcp_latency', {
      name: `mcp_${service}_health`,
      value: healthy ? 1 : 0,
      unit: 'count',
      operation: 'mcp_health_check',
      metadata: {
        service,
        healthy,
        latency,
      },
    }, options);

    if (latency !== undefined) {
      await this.recordMetric('mcp_latency', {
        name: `mcp_${service}_latency`,
        value: latency,
        unit: 'ms',
        operation: 'mcp_health_check',
        duration: latency,
        metadata: { service },
      }, options);
    }
  }

  /**
   * Record storage operation metrics
   */
  async recordStorageOperation(
    operation: 'read' | 'write' | 'delete',
    duration: number,
    success: boolean,
    bytes?: number,
    options: CollectionOptions = {}
  ): Promise<void> {
    await this.recordMetric('storage_latency', {
      name: `storage_${operation}`,
      value: duration,
      unit: 'ms',
      operation: `storage_${operation}`,
      duration,
      metadata: {
        success,
        bytes,
      },
    }, options);
  }

  /**
   * Record a custom metric
   */
  async recordCustomMetric(
    name: string,
    value: number,
    unit: MetricPayload['unit'],
    metadata?: Record<string, any>,
    options: CollectionOptions = {}
  ): Promise<void> {
    await this.recordMetric('custom', {
      name,
      value,
      unit,
      operation: 'custom_metric',
      metadata,
    }, options);
  }

  /**
   * Core method to record any metric
   */
  private async recordMetric(
    type: MetricType,
    payload: MetricPayload,
    options: CollectionOptions = {}
  ): Promise<void> {
    const timestamp = options.timestamp || new Date();

    // Add metric to batch queue
    this.batchQueue.push({
      type,
      payload: {
        ...payload,
        metadata: {
          ...payload.metadata,
          ...options.tags,
          collectedAt: timestamp.toISOString(),
        },
      },
      options,
      timestamp,
    });

    // Process immediately for critical metrics or if batch is full
    if (options.immediate || this.batchQueue.length >= this.BATCH_SIZE) {
      await this.processBatch();
    } else {
      // Schedule batch processing if not already scheduled
      this.scheduleBatchProcessing();
    }
  }

  /**
   * Schedule batch processing with timeout
   */
  private scheduleBatchProcessing(): void {
    if (this.batchTimer) return;

    this.batchTimer = setTimeout(async () => {
      await this.processBatch();
    }, this.BATCH_TIMEOUT);
  }

  /**
   * Process the current batch of metrics
   */
  private async processBatch(): Promise<void> {
    if (this.isProcessing || this.batchQueue.length === 0) return;

    this.isProcessing = true;

    // Clear the timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    // Get current batch and clear queue
    const batch = [...this.batchQueue];
    this.batchQueue = [];

    try {
      // Prepare telemetry events for bulk insert
      const telemetryEvents = batch.map(({ type, payload, options, timestamp }) => {
        // Get current trace context if available
        const traceId = payload.traceId || getCurrentTraceId();
        const spanId = payload.spanId || getCurrentSpanId();

        return {
          projectId: options.projectId || null,
          userId: options.userId || null,
          eventType: `metric.${type}`,
          sessionId: options.sessionId || null,
          traceId,
          spanId,
          payload: {
            metric: payload,
            collectionInfo: {
              batchSize: batch.length,
              timestamp: timestamp.toISOString(),
            },
          },
          createdAt: timestamp,
        };
      });

      // Bulk insert all telemetry events
      await prisma.telemetryEvent.createMany({
        data: telemetryEvents,
        skipDuplicates: false,
      });

      // Log batch processing for debugging (can be removed in production)
      console.log(`Metrics batch processed: ${batch.length} events`);

    } catch (error) {
      console.error('Failed to process metrics batch:', error);

      // Re-queue failed metrics (with a limit to prevent infinite loops)
      if (batch.length < this.BATCH_SIZE * 2) {
        this.batchQueue.unshift(...batch);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Flush all pending metrics (useful for graceful shutdown)
   */
  async flush(): Promise<void> {
    if (this.batchQueue.length > 0) {
      await this.processBatch();
    }
  }

  /**
   * Get aggregated metrics for a time period
   */
  async getAggregatedMetrics(
    metricType: MetricType,
    startDate: Date,
    endDate: Date,
    groupBy: 'hour' | 'day' = 'hour'
  ): Promise<Array<{
    timestamp: string;
    count: number;
    avgValue: number;
    minValue: number;
    maxValue: number;
  }>> {
    const events = await prisma.telemetryEvent.findMany({
      where: {
        eventType: `metric.${metricType}`,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      select: {
        payload: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group and aggregate metrics
    const grouped = new Map<string, number[]>();

    for (const event of events) {
      const metric = (event.payload as any).metric;
      if (!metric || typeof metric.value !== 'number') continue;

      // Create time bucket key
      const date = new Date(event.createdAt);
      const bucketKey = groupBy === 'hour'
        ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:00`
        : `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

      if (!grouped.has(bucketKey)) {
        grouped.set(bucketKey, []);
      }
      grouped.get(bucketKey)!.push(metric.value);
    }

    // Calculate aggregations
    return Array.from(grouped.entries()).map(([timestamp, values]) => ({
      timestamp,
      count: values.length,
      avgValue: values.reduce((sum, val) => sum + val, 0) / values.length,
      minValue: Math.min(...values),
      maxValue: Math.max(...values),
    }));
  }

  /**
   * Clean up old metric data (for data retention)
   */
  async cleanupOldMetrics(daysToKeep: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.telemetryEvent.deleteMany({
      where: {
        eventType: {
          startsWith: 'metric.',
        },
        createdAt: {
          lt: cutoffDate,
        },
      },
    });

    return result.count;
  }
}

// Export a singleton instance
export const metricsCollector = new MetricsCollector();

// Utility functions for common metric patterns
export const metrics = {
  /**
   * Time a function and record its latency
   */
  async time<T>(
    operation: string,
    fn: () => Promise<T>,
    options: CollectionOptions = {}
  ): Promise<T> {
    const start = Date.now();
    let success = false;

    try {
      const result = await fn();
      success = true;
      return result;
    } catch (error) {
      await metricsCollector.recordError(operation, error as Error, options);
      throw error;
    } finally {
      const duration = Date.now() - start;
      await metricsCollector.recordLatency(operation, duration, options);

      if (success) {
        await metricsCollector.recordSuccess(operation, options);
      }
    }
  },

  /**
   * Time a synchronous function and record its latency
   */
  timeSync<T>(
    operation: string,
    fn: () => T,
    options: CollectionOptions = {}
  ): T {
    const start = Date.now();
    let success = false;

    try {
      const result = fn();
      success = true;
      return result;
    } catch (error) {
      // Record error asynchronously (fire and forget)
      metricsCollector.recordError(operation, error as Error, options).catch(console.error);
      throw error;
    } finally {
      const duration = Date.now() - start;
      // Record metrics asynchronously (fire and forget)
      metricsCollector.recordLatency(operation, duration, options).catch(console.error);

      if (success) {
        metricsCollector.recordSuccess(operation, options).catch(console.error);
      }
    }
  },

  /**
   * Create a middleware wrapper for API endpoints
   */
  middleware(operation: string) {
    return function<T extends (...args: any[]) => Promise<any>>(
      handler: T,
      options: CollectionOptions = {}
    ): T {
      return (async (...args: any[]) => {
        return await metrics.time(operation, () => handler(...args), options);
      }) as T;
    };
  },
};

// Export types for external use
export type {
  MetricType,
  MetricPayload,
  CollectionOptions,
};