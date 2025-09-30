/**
 * OpenTelemetry Tracing Setup
 *
 * Configures distributed tracing across the Magi platform, including:
 * - API endpoints and middleware
 * - Router operations and agent orchestration
 * - Database queries and external services
 * - Model runs and telemetry events
 */

import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { trace, context, SpanStatusCode, SpanKind } from '@opentelemetry/api';
import { JaegerExporter } from '@opentelemetry/exporter-jaeger';
import { ZipkinExporter } from '@opentelemetry/exporter-zipkin';

// Export service name for consistent identification
export const SERVICE_NAME = 'magi-platform';

// Custom span attributes for Magi-specific operations
export const SPAN_ATTRIBUTES = {
  // Service identification
  SERVICE_NAME: 'service.name',
  SERVICE_VERSION: 'service.version',

  // User and project context
  USER_ID: 'magi.user_id',
  PROJECT_ID: 'magi.project_id',
  SESSION_ID: 'magi.session_id',

  // Operation types
  OPERATION_TYPE: 'magi.operation.type',
  OPERATION_NAME: 'magi.operation.name',

  // Model and AI operations
  MODEL_ID: 'magi.model.id',
  MODEL_PROVIDER: 'magi.model.provider',
  MODEL_VERSION: 'magi.model.version',
  PROMPT_TOKENS: 'magi.prompt.tokens',
  COMPLETION_TOKENS: 'magi.completion.tokens',

  // Database operations
  DB_OPERATION: 'magi.db.operation',
  DB_TABLE: 'magi.db.table',
  DB_QUERY_DURATION: 'magi.db.duration_ms',

  // Router and agent operations
  ROUTE_PATH: 'magi.route.path',
  AGENT_TYPE: 'magi.agent.type',
  AGENT_STATE: 'magi.agent.state',

  // Health and metrics
  HEALTH_CHECK_TYPE: 'magi.health.type',
  METRIC_TYPE: 'magi.metric.type',
  METRIC_VALUE: 'magi.metric.value',

  // Feedback and learning
  FEEDBACK_TYPE: 'magi.feedback.type',
  FEEDBACK_RATING: 'magi.feedback.rating',
  FEEDBACK_CORRECTION: 'magi.feedback.correction',

  // Error context
  ERROR_TYPE: 'magi.error.type',
  ERROR_MESSAGE: 'magi.error.message',
  ERROR_STACK: 'magi.error.stack',
} as const;

// Initialize OpenTelemetry SDK
let sdkInstance: NodeSDK | null = null;

export function initializeTracing(): void {
  if (sdkInstance) {
    console.warn('OpenTelemetry already initialized');
    return;
  }

  // Configure exporters based on environment
  const exporters = [];

  // Jaeger exporter (if configured)
  if (process.env.JAEGER_ENDPOINT) {
    exporters.push(new JaegerExporter({
      endpoint: process.env.JAEGER_ENDPOINT,
    }));
  }

  // Zipkin exporter (if configured)
  if (process.env.ZIPKIN_ENDPOINT) {
    exporters.push(new ZipkinExporter({
      url: process.env.ZIPKIN_ENDPOINT,
    }));
  }

  // Console exporter for development (default if no external configured)
  if (exporters.length === 0 && process.env.NODE_ENV !== 'production') {
    const { ConsoleSpanExporter } = require('@opentelemetry/sdk-node');
    exporters.push(new ConsoleSpanExporter());
  }

  sdkInstance = new NodeSDK({
    serviceName: SERVICE_NAME,
    serviceVersion: process.env.npm_package_version || '1.0.0',
    traceExporter: exporters.length > 0 ? exporters[0] : undefined,
    instrumentations: [
      getNodeAutoInstrumentations({
        // Disable instrumentations we don't need or that cause issues
        '@opentelemetry/instrumentation-fs': {
          enabled: false, // Too noisy for our use case
        },
        '@opentelemetry/instrumentation-dns': {
          enabled: false, // Too noisy for our use case
        },
        // Enable HTTP instrumentation for API calls
        '@opentelemetry/instrumentation-http': {
          enabled: true,
          requestHook: (span, request) => {
            // Add custom attributes for HTTP requests
            span.setAttributes({
              [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'http_request',
              [SPAN_ATTRIBUTES.ROUTE_PATH]: request.url,
            });
          },
        },
      }),
    ],
  });

  try {
    sdkInstance.start();
    console.log('✅ OpenTelemetry tracing initialized successfully');
  } catch (error) {
    console.error('❌ Failed to initialize OpenTelemetry:', error);
  }
}

// Graceful shutdown
export async function shutdownTracing(): Promise<void> {
  if (sdkInstance) {
    try {
      await sdkInstance.shutdown();
      console.log('✅ OpenTelemetry tracing shut down successfully');
    } catch (error) {
      console.error('❌ Error shutting down OpenTelemetry:', error);
    }
  }
}

// Initialize tracing when this module is imported (for Next.js)
if (process.env.TELEMETRY_ENABLED !== 'false') {
  initializeTracing();
}

// Utility functions for custom tracing
export const tracer = trace.getTracer(SERVICE_NAME);

/**
 * Create a new span with Magi-specific attributes
 */
export function createSpan(
  name: string,
  attributes: Record<string, string | number | boolean> = {},
  kind: SpanKind = SpanKind.INTERNAL
) {
  return tracer.startSpan(name, {
    kind,
    attributes: {
      [SPAN_ATTRIBUTES.SERVICE_NAME]: SERVICE_NAME,
      [SPAN_ATTRIBUTES.SERVICE_VERSION]: process.env.npm_package_version || '1.0.0',
      ...attributes,
    },
  });
}

/**
 * Execute a function within a traced span
 */
export async function withSpan<T>(
  name: string,
  fn: (span: any) => Promise<T> | T,
  attributes: Record<string, string | number | boolean> = {},
  kind: SpanKind = SpanKind.INTERNAL
): Promise<T> {
  const span = createSpan(name, attributes, kind);

  try {
    const result = await context.with(trace.setSpan(context.active(), span), fn, span);
    span.setStatus({ code: SpanStatusCode.OK });
    return result;
  } catch (error) {
    span.recordException(error as Error);
    span.setStatus({
      code: SpanStatusCode.ERROR,
      message: error instanceof Error ? error.message : 'Unknown error',
    });

    // Add error attributes
    if (error instanceof Error) {
      span.setAttributes({
        [SPAN_ATTRIBUTES.ERROR_TYPE]: error.constructor.name,
        [SPAN_ATTRIBUTES.ERROR_MESSAGE]: error.message,
        [SPAN_ATTRIBUTES.ERROR_STACK]: error.stack || '',
      });
    }

    throw error;
  } finally {
    span.end();
  }
}

/**
 * Get the current trace ID from the active span
 */
export function getCurrentTraceId(): string | null {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return null;

  const spanContext = activeSpan.spanContext();
  return spanContext.traceId || null;
}

/**
 * Get the current span ID from the active span
 */
export function getCurrentSpanId(): string | null {
  const activeSpan = trace.getActiveSpan();
  if (!activeSpan) return null;

  const spanContext = activeSpan.spanContext();
  return spanContext.spanId || null;
}

/**
 * Add attributes to the current active span
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    activeSpan.setAttributes(attributes);
  }
}

/**
 * Record an exception in the current active span
 */
export function recordSpanException(error: Error | string): void {
  const activeSpan = trace.getActiveSpan();
  if (activeSpan) {
    if (typeof error === 'string') {
      activeSpan.recordException(new Error(error));
    } else {
      activeSpan.recordException(error);
    }
  }
}

/**
 * Start a database operation span
 */
export function createDatabaseSpan(
  operation: string,
  table: string,
  attributes: Record<string, string | number | boolean> = {}
) {
  return createSpan(`db.${operation}`, {
    [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'database',
    [SPAN_ATTRIBUTES.DB_OPERATION]: operation,
    [SPAN_ATTRIBUTES.DB_TABLE]: table,
    ...attributes,
  }, SpanKind.CLIENT);
}

/**
 * Start a model operation span
 */
export function createModelSpan(
  modelId: string,
  provider: string,
  attributes: Record<string, string | number | boolean> = {}
) {
  return createSpan(`model.run`, {
    [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'model_run',
    [SPAN_ATTRIBUTES.MODEL_ID]: modelId,
    [SPAN_ATTRIBUTES.MODEL_PROVIDER]: provider,
    ...attributes,
  }, SpanKind.CLIENT);
}

/**
 * Start an agent operation span
 */
export function createAgentSpan(
  agentType: string,
  operation: string,
  attributes: Record<string, string | number | boolean> = {}
) {
  return createSpan(`agent.${operation}`, {
    [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'agent',
    [SPAN_ATTRIBUTES.AGENT_TYPE]: agentType,
    [SPAN_ATTRIBUTES.OPERATION_NAME]: operation,
    ...attributes,
  });
}

/**
 * Start an API operation span
 */
export function createAPISpan(
  method: string,
  path: string,
  attributes: Record<string, string | number | boolean> = {}
) {
  return createSpan(`api.${method.toLowerCase()}.${path}`, {
    [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'api',
    [SPAN_ATTRIBUTES.ROUTE_PATH]: path,
    'http.method': method,
    ...attributes,
  }, SpanKind.SERVER);
}

/**
 * Middleware function to automatically trace API requests
 */
export function createTracingMiddleware() {
  return function tracingMiddleware<T extends (...args: any[]) => Promise<any>>(
    handler: T,
    operationName?: string
  ): T {
    return (async (...args: any[]) => {
      const [request] = args;
      const method = request?.method || 'UNKNOWN';
      const url = request?.url || request?.nextUrl?.pathname || 'unknown';

      const spanName = operationName || `${method} ${url}`;

      return await withSpan(
        spanName,
        async (span) => {
          // Add request context to span
          span.setAttributes({
            [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'api_request',
            [SPAN_ATTRIBUTES.ROUTE_PATH]: url,
            'http.method': method,
            'http.url': url,
          });

          // Execute the handler
          const result = await handler(...args);

          // Add response context if available
          if (result?.status) {
            span.setAttributes({
              'http.status_code': result.status,
            });
          }

          return result;
        },
        {},
        SpanKind.SERVER
      );
    }) as T;
  };
}

// Export types for external use
export type {
  SpanKind,
} from '@opentelemetry/api';