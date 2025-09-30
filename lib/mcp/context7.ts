import { prisma } from "@/lib/db";

// Types for Context7 MCP client
interface Context7Config {
  endpoints: string[];
  token?: string;
  timeout: number;
  retries: number;
}

interface ToolCall {
  name: string;
  input: Record<string, any>;
}

interface ToolResponse {
  success: boolean;
  data?: any;
  error?: string;
  metadata?: {
    endpoint: string;
    responseTime: number;
    retryCount: number;
  };
}

interface ToolDefinition {
  name: string;
  description: string;
  parameters?: any;
  endpoint?: string;
}

interface CallToolResult {
  success: boolean;
  output?: any;
  error?: string;
  endpoint?: string;
  latencyMs?: number;
}

interface MCPEndpoint {
  id: string;
  url: string;
  enabled: boolean;
  timeout: number;
  retries: number;
}

class Context7Client {
  private config: Context7Config;
  private endpoints: MCPEndpoint[];
  private currentEndpointIndex = 0;
  private discoveredTools: Map<string, ToolDefinition[]> = new Map();
  private lastDiscovery: Date | null = null;
  private readonly DISCOVERY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Read configuration from environment variables
    const endpointsEnv = process.env.CONTEXT7_ENDPOINTS || "http://localhost:3001,http://localhost:8080";
    const endpoints = endpointsEnv.split(",").map(url => url.trim());

    this.config = {
      endpoints,
      token: process.env.CONTEXT7_TOKEN,
      timeout: 30000,
      retries: 3,
    };

    // Load endpoint configuration from JSON file
    this.endpoints = this.loadEndpointsConfig();
  }

  private loadEndpointsConfig(): MCPEndpoint[] {
    try {
      // In a real implementation, you'd read from the JSON file
      // For now, we'll use the environment configuration
      return this.config.endpoints.map((url, index) => ({
        id: `endpoint-${index}`,
        url,
        enabled: true,
        timeout: this.config.timeout,
        retries: this.config.retries,
      }));
    } catch (error) {
      console.warn("Failed to load Context7 endpoints config, using defaults:", error);
      return this.config.endpoints.map((url, index) => ({
        id: `endpoint-${index}`,
        url,
        enabled: true,
        timeout: this.config.timeout,
        retries: this.config.retries,
      }));
    }
  }

  private async makeRequest(
    endpoint: MCPEndpoint,
    toolCall: ToolCall,
    retryCount = 0
  ): Promise<ToolResponse> {
    const startTime = Date.now();

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'User-Agent': 'Magi/1.0.0',
      };

      if (this.config.token) {
        headers['Authorization'] = `Bearer ${this.config.token}`;
      }

      const response = await fetch(`${endpoint.url}/tools/${toolCall.name}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(toolCall.input),
        signal: AbortSignal.timeout(endpoint.timeout),
      });

      const responseTime = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Log successful request
      await this.logTelemetry({
        success: true,
        toolName: toolCall.name,
        endpoint: endpoint.url,
        responseTime,
        retryCount,
        statusCode: response.status,
      });

      return {
        success: true,
        data,
        metadata: {
          endpoint: endpoint.url,
          responseTime,
          retryCount,
        },
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Log failed request
      await this.logTelemetry({
        success: false,
        toolName: toolCall.name,
        endpoint: endpoint.url,
        responseTime,
        retryCount,
        error: errorMessage,
      });

      // Retry logic
      if (retryCount < endpoint.retries) {
        console.warn(`Context7 request failed, retrying (${retryCount + 1}/${endpoint.retries}):`, errorMessage);
        await this.delay(Math.pow(2, retryCount) * 1000); // Exponential backoff
        return this.makeRequest(endpoint, toolCall, retryCount + 1);
      }

      return {
        success: false,
        error: errorMessage,
        metadata: {
          endpoint: endpoint.url,
          responseTime,
          retryCount,
        },
      };
    }
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async logTelemetry(data: {
    success: boolean;
    toolName: string;
    endpoint: string;
    responseTime: number;
    retryCount: number;
    statusCode?: number;
    error?: string;
  }): Promise<void> {
    try {
      // Redact sensitive information from logs
      const sanitizedEndpoint = this.redactSensitiveInfo(data.endpoint);

      await prisma.telemetryEvent.create({
        data: {
          eventType: 'mcp.context7.tool_call',
          payload: {
            tool_name: data.toolName,
            endpoint: sanitizedEndpoint,
            success: data.success,
            response_time_ms: data.responseTime,
            retry_count: data.retryCount,
            status_code: data.statusCode,
            error: data.error,
            timestamp: new Date().toISOString(),
          },
          sessionId: `mcp-${Date.now()}`,
        },
      });
    } catch (error) {
      console.error("Failed to log Context7 telemetry:", error);
    }
  }

  /**
   * Log telemetry events for tool calls
   */
  private async logCallTelemetry(event: {
    tool: string;
    endpoint: string;
    latencyMs: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'mcp_callTool',
          data: {
            tool: event.tool,
            endpoint: this.redactSensitiveInfo(event.endpoint),
            latency_ms: event.latencyMs,
            success: event.success,
            error: event.error
          },
          metadata: {
            source: 'context7-client',
            version: '1.0.0'
          }
        }
      });
    } catch (error) {
      // Don't throw on telemetry errors, just log them
      console.warn('Failed to log call telemetry event:', error);
    }
  }

  /**
   * Log telemetry events for discovery operations
   */
  private async logDiscoveryTelemetry(event: {
    operation: string;
    endpoint: string;
    latencyMs: number;
    success: boolean;
    error?: string;
    toolCount?: number;
  }): Promise<void> {
    try {
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'mcp_discover',
          data: {
            operation: event.operation,
            endpoint: this.redactSensitiveInfo(event.endpoint),
            latency_ms: event.latencyMs,
            success: event.success,
            error: event.error,
            tool_count: event.toolCount
          },
          metadata: {
            source: 'context7-client',
            version: '1.0.0'
          }
        }
      });
    } catch (error) {
      // Don't throw on telemetry errors, just log them
      console.warn('Failed to log discovery telemetry event:', error);
    }
  }

  private redactSensitiveInfo(input: string): string {
    // Redact tokens and sensitive information
    return input
      .replace(/([?&]token=)[^&]*/gi, '$1[REDACTED]')
      .replace(/([?&]key=)[^&]*/gi, '$1[REDACTED]')
      .replace(/([?&]secret=)[^&]*/gi, '$1[REDACTED]')
      .replace(/(Bearer\s+)[^\s]+/gi, '$1[REDACTED]');
  }

  private getNextEndpoint(): MCPEndpoint | null {
    const availableEndpoints = this.endpoints.filter(ep => ep.enabled);

    if (availableEndpoints.length === 0) {
      return null;
    }

    // Round-robin selection
    const endpoint = availableEndpoints[this.currentEndpointIndex % availableEndpoints.length];
    this.currentEndpointIndex++;

    return endpoint;
  }

  /**
   * Call a tool with enhanced round-robin, timeout & retry logic
   */
  async callTool(name: string, input: Record<string, any>): Promise<CallToolResult> {
    if (!name) {
      const result: CallToolResult = {
        success: false,
        error: "Tool name is required"
      };

      await this.logCallTelemetry({
        tool: name,
        endpoint: 'none',
        latencyMs: 0,
        success: false,
        error: result.error
      });

      return result;
    }

    const healthyEndpoints = this.endpoints.filter(ep => ep.enabled);

    if (healthyEndpoints.length === 0) {
      const result: CallToolResult = {
        success: false,
        error: 'No healthy Context7 endpoints available'
      };

      await this.logCallTelemetry({
        tool: name,
        endpoint: 'none',
        latencyMs: 0,
        success: false,
        error: result.error
      });

      return result;
    }

    // Redact sensitive information from input before logging
    const sanitizedInput = this.redactSensitiveInfo(JSON.stringify(input));
    console.log(`Calling Context7 tool: ${name} with input:`, sanitizedInput);

    let lastError: Error | null = null;

    // Try endpoints in round-robin fashion with retries
    for (let attempt = 0; attempt < healthyEndpoints.length * 2; attempt++) {
      const endpoint = this.getNextEndpoint();

      if (!endpoint) {
        break;
      }

      const startTime = Date.now();
      const result = await this.makeRequest(endpoint, { name, input });
      const latencyMs = Date.now() - startTime;

      if (result.success) {
        const callResult: CallToolResult = {
          success: true,
          output: result.data,
          endpoint: endpoint.url,
          latencyMs
        };

        // Log successful call
        await this.logCallTelemetry({
          tool: name,
          endpoint: endpoint.url,
          latencyMs,
          success: true
        });

        return callResult;
      }

      lastError = new Error(result.error || 'Unknown error');

      // Log failed call
      await this.logCallTelemetry({
        tool: name,
        endpoint: endpoint.url,
        latencyMs,
        success: false,
        error: lastError.message
      });

      // Mark endpoint as temporarily disabled on repeated failures
      if (result.metadata?.retryCount === endpoint.retries) {
        console.warn(`Temporarily disabling endpoint ${endpoint.url} due to repeated failures`);
        endpoint.enabled = false;

        // Re-enable after 5 minutes
        setTimeout(() => {
          endpoint.enabled = true;
          console.log(`Re-enabled endpoint ${endpoint.url}`);
        }, 5 * 60 * 1000);
      }

      // Wait before retry (exponential backoff)
      if (attempt < healthyEndpoints.length * 2 - 1) {
        await this.delay(Math.min(1000 * Math.pow(2, attempt), 5000));
      }
    }

    const result: CallToolResult = {
      success: false,
      error: lastError?.message || 'All Context7 endpoints failed'
    };

    return result;
  }

  /**
   * Check health of all configured endpoints
   */
  async healthCheck(): Promise<{ endpoint: string; healthy: boolean; responseTime?: number; error?: string }[]> {
    const checks = await Promise.all(
      this.endpoints.map(async (endpoint) => {
        const startTime = Date.now();

        try {
          const response = await fetch(`${endpoint.url}/health`, {
            method: 'GET',
            signal: AbortSignal.timeout(5000),
          });

          const responseTime = Date.now() - startTime;

          return {
            endpoint: endpoint.url,
            healthy: response.ok,
            responseTime,
            error: response.ok ? undefined : `HTTP ${response.status}`,
          };
        } catch (error) {
          const responseTime = Date.now() - startTime;

          return {
            endpoint: endpoint.url,
            healthy: false,
            responseTime,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return checks;
  }

  /**
   * Discover and cache tools from all healthy endpoints
   */
  async discover(): Promise<ToolDefinition[]> {
    // Check if we need to refresh the discovery cache
    if (this.lastDiscovery &&
        Date.now() - this.lastDiscovery.getTime() < this.DISCOVERY_CACHE_TTL) {
      // Return cached tools from all endpoints
      const allTools: ToolDefinition[] = [];
      for (const tools of this.discoveredTools.values()) {
        allTools.push(...tools);
      }
      return allTools;
    }

    const healthyEndpoints = this.endpoints.filter(ep => ep.enabled);
    const allTools: ToolDefinition[] = [];
    this.discoveredTools.clear();

    for (const endpoint of healthyEndpoints) {
      try {
        const startTime = Date.now();
        const response = await fetch(`${endpoint.url}/tools`, {
          method: 'GET',
          signal: AbortSignal.timeout(5000),
          headers: this.config.token ? {
            'Authorization': `Bearer ${this.config.token}`,
          } : {},
        });

        const latencyMs = Date.now() - startTime;

        if (response.ok) {
          const data = await response.json();
          let tools: any[] = [];

          // Handle different response formats
          if (Array.isArray(data)) {
            tools = data;
          } else if (data.tools && Array.isArray(data.tools)) {
            tools = data.tools;
          } else if (typeof data === 'object' && data !== null) {
            tools = Object.keys(data).map(key => ({ name: key, description: '' }));
          }

          // Convert to ToolDefinition objects
          const toolDefinitions: ToolDefinition[] = tools.map(tool => ({
            name: typeof tool === 'string' ? tool : tool.name,
            description: typeof tool === 'string' ? '' : (tool.description || ''),
            parameters: typeof tool === 'string' ? undefined : tool.parameters,
            endpoint: endpoint.url
          }));

          this.discoveredTools.set(endpoint.url, toolDefinitions);
          allTools.push(...toolDefinitions);

          // Log successful discovery
          await this.logDiscoveryTelemetry({
            operation: 'discover',
            endpoint: endpoint.url,
            latencyMs,
            success: true,
            toolCount: tools.length
          });
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      } catch (error) {
        console.warn(`Failed to discover tools from ${endpoint.url}:`, error);

        // Log failed discovery
        await this.logDiscoveryTelemetry({
          operation: 'discover',
          endpoint: endpoint.url,
          latencyMs: 0,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    this.lastDiscovery = new Date();
    return allTools;
  }

  /**
   * Get list of available tools from all healthy endpoints (legacy method)
   */
  async getAvailableTools(): Promise<string[]> {
    const tools = await this.discover();
    return tools.map(tool => tool.name);
  }
}

// Export singleton instance
export const context7Client = new Context7Client();

// Export types for use in other modules
export type { ToolCall, ToolResponse, ToolDefinition, CallToolResult };