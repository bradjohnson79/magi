/**
 * Node.js-only OpenTelemetry setup for Magi
 *
 * This file provides safe Node.js runtime detection and OTel initialization
 * that will never break Edge Runtime compatibility.
 */

import { trace, context, SpanStatusCode } from '@opentelemetry/api';

let isInitialized = false;
let tracer: any = null;

/**
 * Safely detect if we're running in Node.js runtime
 * Avoids all process APIs to prevent Edge Runtime conflicts
 */
export function isNodeRuntime(): boolean {
  // Check if we're explicitly in Edge Runtime
  if (typeof EdgeRuntime !== 'undefined') {
    return false;
  }

  // Simple check: require exists in Node.js but not in Edge Runtime
  try {
    return typeof require !== 'undefined' && typeof module !== 'undefined';
  } catch {
    return false;
  }
}

/**
 * Initialize OpenTelemetry for Node.js runtime only
 */
export async function initializeOTel(): Promise<void> {
  if (isInitialized || !isNodeRuntime()) {
    return;
  }

  try {
    // Dynamic imports to prevent Edge Runtime issues
    const { NodeSDK } = await import('@opentelemetry/sdk-node');
    const { getNodeAutoInstrumentations } = await import('@opentelemetry/auto-instrumentations-node');
    const { Resource } = await import('@opentelemetry/resources');
    const { SemanticResourceAttributes } = await import('@opentelemetry/semantic-conventions');

    // Create resource with service metadata
    const resource = new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: 'magi-dev',
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
      [SemanticResourceAttributes.DEPLOYMENT_ENVIRONMENT]: 'development',
    });

    // Initialize SDK with console exporter for development
    const sdk = new NodeSDK({
      resource,
      instrumentations: [getNodeAutoInstrumentations({
        // Disable problematic instrumentations for Next.js
        '@opentelemetry/instrumentation-fs': {
          enabled: false,
        },
        '@opentelemetry/instrumentation-dns': {
          enabled: false,
        },
      })],
    });

    // Start the SDK
    await sdk.start();

    // Get tracer instance
    tracer = trace.getTracer('magi-api', '1.0.0');

    isInitialized = true;
    console.log('✅ OpenTelemetry initialized for Node.js runtime');
  } catch (error) {
    console.warn('⚠️  OpenTelemetry initialization failed:', error);
  }
}

/**
 * Create a span with safe error handling
 */
export function withSpan<T>(
  name: string,
  fn: (span: any) => Promise<T>,
  attributes: Record<string, string | number | boolean> = {}
): Promise<T> {
  if (!isNodeRuntime() || !tracer) {
    // If not in Node.js or tracer not available, just run the function
    return fn(null);
  }

  return tracer.startActiveSpan(name, async (span: any) => {
    try {
      // Add attributes to span
      Object.entries(attributes).forEach(([key, value]) => {
        span.setAttributes({ [key]: value });
      });

      const result = await fn(span);

      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
      span.recordException(error instanceof Error ? error : new Error(String(error)));
      throw error;
    } finally {
      span.end();
    }
  });
}

/**
 * Add attributes to current span if available
 */
export function addSpanAttributes(attributes: Record<string, string | number | boolean>): void {
  if (!isNodeRuntime()) return;

  try {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      activeSpan.setAttributes(attributes);
    }
  } catch (error) {
    // Silently fail - don't break application flow
  }
}

/**
 * Get current trace ID for logging correlation
 */
export function getCurrentTraceId(): string | null {
  if (!isNodeRuntime()) return null;

  try {
    const activeSpan = trace.getActiveSpan();
    if (activeSpan) {
      return activeSpan.spanContext().traceId;
    }
  } catch (error) {
    // Silently fail
  }

  return null;
}

/**
 * Utility to ensure OTel is initialized before use
 */
export async function ensureOTelInitialized(): Promise<void> {
  if (!isInitialized && isNodeRuntime()) {
    await initializeOTel();
  }
}