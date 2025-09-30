/**
 * Common interfaces and types for AI Matrix agents
 */

import { z } from 'zod';

// Agent execution context
export interface AgentContext {
  userId: string;
  projectId?: string;
  taskId: string;
  sessionId?: string;
  inputs: Record<string, any>;
  constraints?: {
    timeLimit?: number;
    budget?: number;
    securityLevel?: 'standard' | 'strict' | 'enterprise';
  };
}

// Agent execution result
export interface AgentResult {
  success: boolean;
  outputs?: Record<string, any>;
  artifacts?: Artifact[];
  logs: LogEntry[];
  metrics: ExecutionMetrics;
  error?: string;
  snapshotId?: string;
}

// Artifact types (code, files, configurations, etc.)
export interface Artifact {
  id: string;
  type: 'code' | 'config' | 'documentation' | 'test' | 'schema' | 'migration';
  name: string;
  content: string;
  path?: string;
  metadata?: {
    language?: string;
    framework?: string;
    size?: number;
    checksum?: string;
  };
}

// Log entry for agent actions
export interface LogEntry {
  timestamp: Date;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  context?: Record<string, any>;
}

// Execution metrics for monitoring
export interface ExecutionMetrics {
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
  tokensUsed?: number;
  cost?: number;
  modelCalls: number;
  cacheHits: number;
  memoryUsage?: number;
}

// Model run data for database logging
export interface ModelRunData {
  agentType: string;
  model: string;
  prompt: string;
  response: string;
  tokensUsed: number;
  cost: number;
  success: boolean;
  error?: string;
  metadata?: Record<string, any>;
}

// Common agent interface
export interface Agent {
  readonly name: string;
  readonly version: string;
  readonly capabilities: string[];

  /**
   * Execute the agent with given context
   */
  execute(context: AgentContext): Promise<AgentResult>;

  /**
   * Validate inputs before execution
   */
  validateInputs(inputs: Record<string, any>): Promise<{ valid: boolean; errors: string[] }>;

  /**
   * Get agent health status
   */
  getHealthStatus(): Promise<AgentHealthStatus>;

  /**
   * Clean up resources
   */
  cleanup(): Promise<void>;
}

// Agent health status
export interface AgentHealthStatus {
  healthy: boolean;
  lastCheck: Date;
  errors?: string[];
  metrics?: {
    averageResponseTime: number;
    successRate: number;
    totalExecutions: number;
  };
}

// Schema definitions for validation
export const AgentContextSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().optional(),
  taskId: z.string().min(1),
  sessionId: z.string().optional(),
  inputs: z.record(z.any()),
  constraints: z.object({
    timeLimit: z.number().positive().optional(),
    budget: z.number().positive().optional(),
    securityLevel: z.enum(['standard', 'strict', 'enterprise']).optional(),
  }).optional(),
});

export const ArtifactSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['code', 'config', 'documentation', 'test', 'schema', 'migration']),
  name: z.string().min(1),
  content: z.string(),
  path: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

// Agent configuration
export interface AgentConfig {
  model: string;
  maxTokens: number;
  temperature: number;
  timeout: number;
  retries: number;
  cacheTTL?: number;
  rateLimiting?: {
    requestsPerMinute: number;
    tokensPerMinute: number;
  };
}

// Default configurations for different agents
export const DEFAULT_AGENT_CONFIGS: Record<string, AgentConfig> = {
  CodeGenAgent: {
    model: 'claude-3-sonnet-20241022',
    maxTokens: 8192,
    temperature: 0.1,
    timeout: 120000,
    retries: 3,
    cacheTTL: 300000, // 5 minutes
  },
  SchemaAgent: {
    model: 'claude-3-sonnet-20241022',
    maxTokens: 4096,
    temperature: 0.0,
    timeout: 60000,
    retries: 3,
    cacheTTL: 600000, // 10 minutes
  },
  AuthAgent: {
    model: 'claude-3-sonnet-20241022',
    maxTokens: 6144,
    temperature: 0.1,
    timeout: 90000,
    retries: 3,
    cacheTTL: 300000,
  },
  QAAgent: {
    model: 'claude-3-haiku-20240307',
    maxTokens: 4096,
    temperature: 0.2,
    timeout: 60000,
    retries: 2,
    cacheTTL: 180000, // 3 minutes
  },
};

// Export utility functions
export function createLogEntry(
  level: LogEntry['level'],
  message: string,
  context?: Record<string, any>
): LogEntry {
  return {
    timestamp: new Date(),
    level,
    message,
    context,
  };
}

export function createExecutionMetrics(): ExecutionMetrics {
  return {
    startTime: new Date(),
    modelCalls: 0,
    cacheHits: 0,
  };
}

export function finalizeMetrics(metrics: ExecutionMetrics): ExecutionMetrics {
  const endTime = new Date();
  return {
    ...metrics,
    endTime,
    durationMs: endTime.getTime() - metrics.startTime.getTime(),
  };
}