/**
 * MCP (Model Context Protocol) Configuration
 * Handles feature flags and environment setup for Context7 integration
 */

export interface MCPConfig {
  enabled: boolean;
  endpoints: string[];
  token?: string;
  timeout: number;
  retries: number;
}

/**
 * Load MCP configuration from environment variables
 */
export function loadMCPConfig(): MCPConfig {
  // Check if MCP is enabled (defaults to true for backward compatibility)
  const enabled = process.env.MCP_ENABLED !== 'false';

  // Parse endpoints from environment
  const endpointsEnv = process.env.CONTEXT7_ENDPOINTS || 'http://localhost:3001,http://localhost:8080';
  const endpoints = endpointsEnv.split(',').map(url => url.trim()).filter(Boolean);

  // Get authentication token
  const token = process.env.CONTEXT7_TOKEN;

  // Configure timeouts and retries
  const timeout = parseInt(process.env.CONTEXT7_TIMEOUT || '30000', 10);
  const retries = parseInt(process.env.CONTEXT7_RETRIES || '3', 10);

  return {
    enabled,
    endpoints,
    token,
    timeout,
    retries
  };
}

/**
 * Validate MCP configuration
 */
export function validateMCPConfig(config: MCPConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (config.enabled) {
    if (!config.endpoints || config.endpoints.length === 0) {
      errors.push('At least one Context7 endpoint must be configured when MCP is enabled');
    }

    for (const endpoint of config.endpoints) {
      try {
        new URL(endpoint);
      } catch {
        errors.push(`Invalid endpoint URL: ${endpoint}`);
      }
    }

    if (config.timeout <= 0) {
      errors.push('Timeout must be a positive number');
    }

    if (config.retries < 0) {
      errors.push('Retries must be a non-negative number');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Get a safe configuration object (with sensitive data redacted)
 */
export function getSafeMCPConfig(config: MCPConfig): Partial<MCPConfig> {
  return {
    enabled: config.enabled,
    endpoints: config.endpoints,
    token: config.token ? '[REDACTED]' : undefined,
    timeout: config.timeout,
    retries: config.retries
  };
}

/**
 * Check if MCP is properly configured and available
 */
export function isMCPAvailable(): boolean {
  const config = loadMCPConfig();
  const validation = validateMCPConfig(config);

  return config.enabled && validation.valid;
}

// Export singleton config instance
export const mcpConfig = loadMCPConfig();

// Validate configuration on module load and log warnings
const validation = validateMCPConfig(mcpConfig);
if (!validation.valid) {
  console.warn('MCP configuration issues detected:', validation.errors);
}

export type { MCPConfig };