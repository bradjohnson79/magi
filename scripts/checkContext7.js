#!/usr/bin/env node

/**
 * Context7 MCP Health Check Script
 *
 * This script checks the health and available tools of configured Context7 MCP endpoints.
 *
 * Usage:
 *   node scripts/checkContext7.js           # Check all endpoints and list tools
 *   node scripts/checkContext7.js --health  # Health check only
 *   node scripts/checkContext7.js --tools   # List available tools
 */

const fs = require('fs');
const path = require('path');

// ANSI color codes for terminal output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
};

// Configuration
const CONFIG_PATH = path.join(__dirname, '..', 'mcp', 'clients', 'context7.json');
const DEFAULT_ENDPOINTS = [
  'http://localhost:3001',
  'http://localhost:8080',
];

/**
 * Load Context7 configuration
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const configData = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(configData);
      return config.endpoints || [];
    } else {
      console.log(`${colors.yellow}⚠️  Config file not found at ${CONFIG_PATH}${colors.reset}`);
      console.log(`${colors.blue}Using default endpoints: ${DEFAULT_ENDPOINTS.join(', ')}${colors.reset}`);
      return DEFAULT_ENDPOINTS.map((url, index) => ({
        id: `default-${index}`,
        name: `Default Endpoint ${index + 1}`,
        url,
        enabled: true,
        timeout: 5000,
      }));
    }
  } catch (error) {
    console.error(`${colors.red}❌ Failed to load config: ${error.message}${colors.reset}`);
    return [];
  }
}

/**
 * Check health of a single endpoint
 */
async function checkEndpointHealth(endpoint) {
  const startTime = Date.now();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout || 5000);

    const response = await fetch(`${endpoint.url}/health`, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Magi-Context7-Check/1.0.0',
      },
    });

    clearTimeout(timeoutId);
    const responseTime = Date.now() - startTime;

    return {
      success: response.ok,
      status: response.status,
      responseTime,
      endpoint: endpoint.url,
      error: response.ok ? null : `HTTP ${response.status}`,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;

    let errorMessage = error.message;
    if (error.name === 'AbortError') {
      errorMessage = `Timeout after ${endpoint.timeout || 5000}ms`;
    } else if (error.code === 'ECONNREFUSED') {
      errorMessage = 'Connection refused';
    } else if (error.code === 'ENOTFOUND') {
      errorMessage = 'Host not found';
    }

    return {
      success: false,
      status: 0,
      responseTime,
      endpoint: endpoint.url,
      error: errorMessage,
    };
  }
}

/**
 * Get available tools from an endpoint
 */
async function getEndpointTools(endpoint) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), endpoint.timeout || 5000);

    const headers = {
      'User-Agent': 'Magi-Context7-Check/1.0.0',
      'Accept': 'application/json',
    };

    // Add authentication if token is available
    const token = process.env.CONTEXT7_TOKEN;
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${endpoint.url}/tools`, {
      method: 'GET',
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return {
        success: false,
        tools: [],
        error: `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    const tools = Array.isArray(data.tools) ? data.tools :
                  Array.isArray(data) ? data :
                  Object.keys(data.tools || {});

    return {
      success: true,
      tools,
      error: null,
    };
  } catch (error) {
    let errorMessage = error.message;
    if (error.name === 'AbortError') {
      errorMessage = `Timeout after ${endpoint.timeout || 5000}ms`;
    }

    return {
      success: false,
      tools: [],
      error: errorMessage,
    };
  }
}

/**
 * Print health status for all endpoints
 */
async function printHealthStatus(endpoints) {
  console.log(`${colors.bold}🔍 Context7 MCP Health Check${colors.reset}\n`);

  const results = await Promise.all(
    endpoints.map(async (endpoint) => {
      const health = await checkEndpointHealth(endpoint);
      return { endpoint, health };
    })
  );

  let healthyCount = 0;
  let totalCount = results.length;

  results.forEach(({ endpoint, health }) => {
    const status = health.success ?
      `${colors.green}✅ Healthy${colors.reset}` :
      `${colors.red}❌ Unhealthy${colors.reset}`;

    const responseTime = health.success ?
      `${colors.blue}(${health.responseTime}ms)${colors.reset}` :
      '';

    const error = health.error ?
      `${colors.red}- ${health.error}${colors.reset}` :
      '';

    console.log(`${status} ${endpoint.url} ${responseTime} ${error}`);

    if (health.success) {
      healthyCount++;
    }
  });

  console.log(`\n${colors.bold}Summary: ${healthyCount}/${totalCount} endpoints healthy${colors.reset}`);

  return healthyCount === totalCount;
}

/**
 * Print available tools for all healthy endpoints
 */
async function printAvailableTools(endpoints) {
  console.log(`${colors.bold}🛠️  Available Context7 Tools${colors.reset}\n`);

  const allTools = new Set();
  const endpointTools = new Map();

  for (const endpoint of endpoints) {
    const health = await checkEndpointHealth(endpoint);

    if (health.success) {
      const toolsResult = await getEndpointTools(endpoint);

      if (toolsResult.success) {
        endpointTools.set(endpoint.url, toolsResult.tools);
        toolsResult.tools.forEach(tool => allTools.add(tool));
      } else {
        console.log(`${colors.red}❌ Failed to get tools from ${endpoint.url}: ${toolsResult.error}${colors.reset}`);
      }
    } else {
      console.log(`${colors.red}❌ Endpoint ${endpoint.url} is not healthy${colors.reset}`);
    }
  }

  if (allTools.size === 0) {
    console.log(`${colors.yellow}⚠️  No tools available from any endpoint${colors.reset}`);
    return;
  }

  // Print all unique tools
  console.log(`${colors.bold}All Available Tools (${allTools.size}):${colors.reset}`);
  Array.from(allTools).sort().forEach(tool => {
    console.log(`  ${colors.green}•${colors.reset} ${tool}`);
  });

  // Print tools by endpoint
  console.log(`\n${colors.bold}Tools by Endpoint:${colors.reset}`);
  endpointTools.forEach((tools, endpoint) => {
    console.log(`\n${colors.blue}${endpoint}${colors.reset} (${tools.length} tools):`);
    tools.sort().forEach(tool => {
      console.log(`  ${colors.green}•${colors.reset} ${tool}`);
    });
  });
}

/**
 * Print usage information
 */
function printUsage() {
  console.log(`${colors.bold}Context7 MCP Health Check${colors.reset}

${colors.bold}Usage:${colors.reset}
  node scripts/checkContext7.js           Check all endpoints and list tools
  node scripts/checkContext7.js --health  Health check only
  node scripts/checkContext7.js --tools   List available tools only
  node scripts/checkContext7.js --help    Show this help

${colors.bold}Environment Variables:${colors.reset}
  CONTEXT7_TOKEN     Authentication token for Context7 MCP servers
  CONTEXT7_ENDPOINTS Comma-separated list of endpoint URLs to check

${colors.bold}Configuration:${colors.reset}
  Configuration is loaded from: ${CONFIG_PATH}
  Default endpoints: ${DEFAULT_ENDPOINTS.join(', ')}
`);
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printUsage();
    return;
  }

  const endpoints = loadConfig();

  if (endpoints.length === 0) {
    console.error(`${colors.red}❌ No endpoints configured${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.blue}📡 Checking ${endpoints.length} Context7 MCP endpoint(s)...${colors.reset}\n`);

  const healthOnly = args.includes('--health');
  const toolsOnly = args.includes('--tools');

  try {
    if (toolsOnly) {
      await printAvailableTools(endpoints);
    } else if (healthOnly) {
      const allHealthy = await printHealthStatus(endpoints);
      process.exit(allHealthy ? 0 : 1);
    } else {
      // Default: show both health and tools
      const allHealthy = await printHealthStatus(endpoints);
      console.log(); // Empty line
      await printAvailableTools(endpoints);

      if (!allHealthy) {
        process.exit(1);
      }
    }
  } catch (error) {
    console.error(`${colors.red}❌ Unexpected error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Handle fetch polyfill for older Node.js versions
if (typeof fetch === 'undefined') {
  console.error(`${colors.red}❌ fetch is not available. Please use Node.js 18+ or install a fetch polyfill.${colors.reset}`);
  process.exit(1);
}

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error(`${colors.red}❌ Fatal error: ${error.message}${colors.reset}`);
    process.exit(1);
  });
}