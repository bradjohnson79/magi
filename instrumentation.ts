/**
 * Next.js Instrumentation File
 *
 * This file is automatically loaded by Next.js to set up instrumentation
 * before the application starts. We use it to initialize OpenTelemetry tracing.
 */

import { initializeOTel, isNodeRuntime } from '@/lib/observability/otel';

export async function register() {
  // Only initialize OpenTelemetry in Node.js runtime
  if (isNodeRuntime() && process.env.TELEMETRY_ENABLED !== 'false') {
    try {
      await initializeOTel();
      console.log('✅ Instrumentation register completed - OpenTelemetry initialized for Node.js runtime');
    } catch (error) {
      console.warn('⚠️  Instrumentation register failed:', error);
    }
  } else {
    console.log('ℹ️  Instrumentation register called - skipping OTel init (Edge Runtime or disabled)');
  }
}