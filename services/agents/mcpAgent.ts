import { context7Client, ToolDefinition, CallToolResult } from '@/lib/mcp/context7';
import { redactSecretsFromObject } from '@/lib/utils/secretRedaction';
import { z } from 'zod';

// Schema validation for tool inputs
const ToolInputSchema = z.record(z.any());

export interface MCPAgentResult {
  success: boolean;
  output?: any;
  logs: string[];
  error?: string;
  metadata?: {
    tool: string;
    endpoint?: string;
    latencyMs?: number;
    validationErrors?: string[];
  };
}

export interface MCPAgentOptions {
  timeout?: number;
  validateInput?: boolean;
  logLevel?: 'debug' | 'info' | 'warn' | 'error';
}

export class MCPAgent {
  private logs: string[] = [];
  private readonly MCP_ENABLED: boolean;

  constructor() {
    // Check if MCP is enabled via environment variable
    this.MCP_ENABLED = process.env.MCP_ENABLED !== 'false';
  }

  /**
   * Run a tool with the given input
   */
  async run(
    toolName: string,
    input: Record<string, any>,
    options: MCPAgentOptions = {}
  ): Promise<MCPAgentResult> {
    const {
      timeout = 30000,
      validateInput = true,
      logLevel = 'info'
    } = options;

    this.logs = [];
    const startTime = Date.now();

    try {
      // Check if MCP is enabled
      if (!this.MCP_ENABLED) {
        this.log('warn', 'MCP is disabled, falling back to mock response');
        return this.createFallbackResponse(toolName, input);
      }

      this.log('info', `Starting MCP tool execution: ${toolName}`);

      // Validate tool name
      if (!toolName || typeof toolName !== 'string') {
        const error = 'Tool name must be a non-empty string';
        this.log('error', error);
        return {
          success: false,
          error,
          logs: this.logs,
          metadata: {
            tool: toolName,
            validationErrors: [error]
          }
        };
      }

      // Validate input schema if requested
      if (validateInput) {
        const validation = await this.validateToolInput(toolName, input);
        if (!validation.success) {
          this.log('error', `Input validation failed: ${validation.errors.join(', ')}`);
          return {
            success: false,
            error: 'Input validation failed',
            logs: this.logs,
            metadata: {
              tool: toolName,
              validationErrors: validation.errors
            }
          };
        }
      }

      // Redact sensitive information before logging
      const redactedInput = redactSecretsFromObject(input);
      this.log('debug', `Tool input: ${JSON.stringify(redactedInput)}`);

      // Call the tool via Context7 client
      const result = await this.callToolWithTimeout(toolName, input, timeout);

      const latencyMs = Date.now() - startTime;
      this.log('info', `Tool execution completed in ${latencyMs}ms`);

      if (result.success) {
        this.log('info', 'Tool execution successful');

        // Redact sensitive information from output
        const redactedOutput = redactSecretsFromObject(result.output);

        return {
          success: true,
          output: redactedOutput,
          logs: this.logs,
          metadata: {
            tool: toolName,
            endpoint: result.endpoint,
            latencyMs: result.latencyMs || latencyMs
          }
        };
      } else {
        this.log('error', `Tool execution failed: ${result.error}`);
        return {
          success: false,
          error: result.error,
          logs: this.logs,
          metadata: {
            tool: toolName,
            endpoint: result.endpoint,
            latencyMs: result.latencyMs || latencyMs
          }
        };
      }

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.log('error', `Unexpected error during tool execution: ${errorMessage}`);

      return {
        success: false,
        error: errorMessage,
        logs: this.logs,
        metadata: {
          tool: toolName,
          latencyMs
        }
      };
    }
  }

  /**
   * Discover available tools from all endpoints
   */
  async discoverTools(): Promise<ToolDefinition[]> {
    try {
      if (!this.MCP_ENABLED) {
        this.log('warn', 'MCP is disabled, returning empty tool list');
        return [];
      }

      this.log('info', 'Discovering available MCP tools');
      const tools = await context7Client.discover();
      this.log('info', `Discovered ${tools.length} tools`);

      return tools;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Failed to discover tools: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Get health status of all MCP endpoints
   */
  async getHealthStatus(): Promise<{ endpoint: string; healthy: boolean; responseTime?: number; error?: string }[]> {
    try {
      if (!this.MCP_ENABLED) {
        this.log('warn', 'MCP is disabled, returning empty health status');
        return [];
      }

      this.log('info', 'Checking MCP endpoint health');
      const health = await context7Client.healthCheck();
      this.log('info', `Health check completed for ${health.length} endpoints`);

      return health;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Failed to check endpoint health: ${errorMessage}`);
      return [];
    }
  }

  /**
   * Call tool with timeout wrapper
   */
  private async callToolWithTimeout(
    toolName: string,
    input: Record<string, any>,
    timeout: number
  ): Promise<CallToolResult> {
    return new Promise(async (resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Tool call timed out after ${timeout}ms`));
      }, timeout);

      try {
        const result = await context7Client.callTool(toolName, input);
        clearTimeout(timeoutId);
        resolve(result);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Validate tool input schema
   */
  private async validateToolInput(
    toolName: string,
    input: Record<string, any>
  ): Promise<{ success: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Basic input validation
      const result = ToolInputSchema.safeParse(input);
      if (!result.success) {
        result.error.issues.forEach(issue => {
          errors.push(`${issue.path.join('.')}: ${issue.message}`);
        });
      }

      // Additional tool-specific validation could be added here
      // For now, we'll just check for basic structure

      if (input === null || input === undefined) {
        errors.push('Input cannot be null or undefined');
      }

      if (typeof input !== 'object') {
        errors.push('Input must be an object');
      }

      return {
        success: errors.length === 0,
        errors
      };

    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return {
        success: false,
        errors
      };
    }
  }

  /**
   * Create fallback response when MCP is disabled
   */
  private createFallbackResponse(toolName: string, input: Record<string, any>): MCPAgentResult {
    this.log('info', `Creating fallback response for tool: ${toolName}`);

    return {
      success: true,
      output: {
        message: `MCP is disabled. This is a fallback response for tool: ${toolName}`,
        tool: toolName,
        input: redactSecretsFromObject(input),
        timestamp: new Date().toISOString(),
        fallback: true
      },
      logs: this.logs,
      metadata: {
        tool: toolName,
        latencyMs: 0
      }
    };
  }

  /**
   * Log messages with appropriate level
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    this.logs.push(logEntry);

    // Also log to console based on level
    switch (level) {
      case 'debug':
        console.debug(logEntry);
        break;
      case 'info':
        console.info(logEntry);
        break;
      case 'warn':
        console.warn(logEntry);
        break;
      case 'error':
        console.error(logEntry);
        break;
    }
  }

  /**
   * Get all logs from the current execution
   */
  getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * Clear logs
   */
  clearLogs(): void {
    this.logs = [];
  }

  /**
   * Check if MCP is enabled
   */
  isMCPEnabled(): boolean {
    return this.MCP_ENABLED;
  }
}

// Export singleton instance for convenience
export const mcpAgent = new MCPAgent();

// Export types
export type { MCPAgentResult, MCPAgentOptions };