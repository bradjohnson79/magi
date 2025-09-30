#!/usr/bin/env node
/**
 * Neon MCP Server Test Script
 *
 * Tests the Neon MCP server configuration and connection.
 * This script verifies that:
 * 1. Environment variables are properly set
 * 2. Neon MCP server can start
 * 3. Basic connectivity to Neon API works
 */

const { execSync, spawn } = require('child_process');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSection(title) {
  console.log(`\n${colors.bold}${colors.blue}=== ${title} ===${colors.reset}`);
}

async function testEnvironmentVariables() {
  logSection('Environment Variables Check');

  const requiredVars = [
    'NEON_API_KEY',
    'NEON_PROJECT_ID',
    'NEON_DATABASE_NAME',
    'NEON_USERNAME'
  ];

  let allPresent = true;

  for (const varName of requiredVars) {
    const value = process.env[varName];
    if (!value || value === 'your_neon_api_key_here' || value === 'your_neon_project_id_here') {
      log(`❌ ${varName} is not set or using placeholder value`, 'red');
      allPresent = false;
    } else {
      const maskedValue = varName.includes('KEY') ?
        value.substring(0, 8) + '...' + value.substring(value.length - 4) :
        value;
      log(`✅ ${varName} = ${maskedValue}`, 'green');
    }
  }

  if (!allPresent) {
    log('\n⚠️  Please update your environment variables in .env.local', 'yellow');
    log('See NEON-SETUP.md for instructions', 'yellow');
    return false;
  }

  return true;
}

async function testNeonMCPInstallation() {
  logSection('Neon MCP Package Check');

  try {
    const packageInfo = execSync('npm list @neondatabase/mcp-server-neon --depth=0',
      { encoding: 'utf8', cwd: path.join(__dirname, '..') });
    log('✅ @neondatabase/mcp-server-neon is installed', 'green');

    // Extract version from npm list output
    const versionMatch = packageInfo.match(/@neondatabase\/mcp-server-neon@([^\s]+)/);
    if (versionMatch) {
      log(`   Version: ${versionMatch[1]}`, 'blue');
    }

    return true;
  } catch (error) {
    log('❌ @neondatabase/mcp-server-neon is not installed', 'red');
    log('   Run: npm install @neondatabase/mcp-server-neon', 'yellow');
    return false;
  }
}

async function testMCPConfiguration() {
  logSection('MCP Configuration Check');

  try {
    const mcpConfig = require(path.join(__dirname, '..', 'mcp-config.json'));

    if (mcpConfig.mcpServers && mcpConfig.mcpServers.neon) {
      log('✅ Neon MCP server is configured in mcp-config.json', 'green');

      const neonConfig = mcpConfig.mcpServers.neon;
      log(`   Command: ${neonConfig.command}`, 'blue');
      log(`   Args: ${JSON.stringify(neonConfig.args)}`, 'blue');

      if (neonConfig.env && neonConfig.env.NEON_API_KEY) {
        log('✅ NEON_API_KEY is configured in MCP server env', 'green');
      } else {
        log('❌ NEON_API_KEY is not configured in MCP server env', 'red');
        return false;
      }

      return true;
    } else {
      log('❌ Neon MCP server is not configured in mcp-config.json', 'red');
      return false;
    }
  } catch (error) {
    log(`❌ Error reading mcp-config.json: ${error.message}`, 'red');
    return false;
  }
}

async function testNeonAPIConnection() {
  logSection('Neon API Connection Test');

  const apiKey = process.env.NEON_API_KEY;
  if (!apiKey || apiKey === 'your_neon_api_key_here') {
    log('❌ Cannot test API connection: NEON_API_KEY not set', 'red');
    return false;
  }

  try {
    // Test API connection using curl (if available) or fetch
    const testEndpoint = 'https://console.neon.tech/api/v2/projects';

    log('🔍 Testing connection to Neon API...', 'yellow');

    // Use node's built-in fetch (Node 18+) or require a fallback
    let fetch;
    try {
      fetch = globalThis.fetch;
    } catch {
      // Fallback for older Node versions
      const { default: nodeFetch } = await import('node-fetch');
      fetch = nodeFetch;
    }

    const response = await fetch(testEndpoint, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'User-Agent': 'MAGI-MCP-Test/1.0'
      }
    });

    if (response.ok) {
      const data = await response.json();
      log('✅ Successfully connected to Neon API', 'green');

      if (data.projects && data.projects.length > 0) {
        log(`   Found ${data.projects.length} project(s)`, 'blue');

        // Check if the configured project exists
        const projectId = process.env.NEON_PROJECT_ID;
        const targetProject = data.projects.find(p => p.id === projectId);

        if (targetProject) {
          log(`✅ Target project found: ${targetProject.name} (${projectId})`, 'green');
        } else if (projectId && projectId !== 'your_neon_project_id_here') {
          log(`❌ Target project ${projectId} not found in account`, 'red');
          log('   Available projects:', 'yellow');
          data.projects.forEach(p => {
            log(`     - ${p.name} (${p.id})`, 'yellow');
          });
        }
      } else {
        log('   No projects found - you may need to create one', 'yellow');
      }

      return true;
    } else {
      log(`❌ API request failed: ${response.status} ${response.statusText}`, 'red');

      if (response.status === 401) {
        log('   This usually means the API key is invalid or expired', 'yellow');
      } else if (response.status === 403) {
        log('   This usually means the API key lacks required permissions', 'yellow');
      }

      return false;
    }
  } catch (error) {
    log(`❌ Error testing Neon API connection: ${error.message}`, 'red');
    return false;
  }
}

async function testMCPServerStartup() {
  logSection('MCP Server Startup Test');

  log('🔍 Testing Neon MCP server startup...', 'yellow');

  return new Promise((resolve) => {
    const serverProcess = spawn('npx', ['-y', '@neondatabase/mcp-server-neon'], {
      env: {
        ...process.env,
        NEON_API_KEY: process.env.NEON_API_KEY
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let outputReceived = false;
    let errorOutput = '';

    const timeout = setTimeout(() => {
      serverProcess.kill();
      if (!outputReceived) {
        log('❌ MCP server startup timeout (no output received)', 'red');
        resolve(false);
      }
    }, 10000); // 10 second timeout

    serverProcess.stdout.on('data', (data) => {
      const output = data.toString();
      outputReceived = true;

      // Look for MCP initialization messages
      if (output.includes('ready') || output.includes('initialized') || output.includes('server')) {
        clearTimeout(timeout);
        serverProcess.kill();
        log('✅ MCP server started successfully', 'green');
        resolve(true);
      }
    });

    serverProcess.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    serverProcess.on('close', (code) => {
      clearTimeout(timeout);

      if (!outputReceived) {
        log('❌ MCP server failed to start', 'red');
        if (errorOutput) {
          log(`   Error output: ${errorOutput.trim()}`, 'red');
        }
        resolve(false);
      }
    });

    serverProcess.on('error', (error) => {
      clearTimeout(timeout);
      log(`❌ Failed to spawn MCP server: ${error.message}`, 'red');
      resolve(false);
    });

    // Send a simple message to the server to trigger initialization
    setTimeout(() => {
      try {
        serverProcess.stdin.write(JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'test-client', version: '1.0.0' }
          }
        }) + '\n');
      } catch (error) {
        // Ignore write errors
      }
    }, 1000);
  });
}

async function runAllTests() {
  log(`${colors.bold}${colors.blue}🧪 Neon MCP Setup Test Suite${colors.reset}\n`);

  const tests = [
    { name: 'Environment Variables', fn: testEnvironmentVariables },
    { name: 'Package Installation', fn: testNeonMCPInstallation },
    { name: 'MCP Configuration', fn: testMCPConfiguration },
    { name: 'Neon API Connection', fn: testNeonAPIConnection },
    { name: 'MCP Server Startup', fn: testMCPServerStartup }
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      const result = await test.fn();
      if (result) {
        passed++;
      } else {
        failed++;
      }
    } catch (error) {
      log(`❌ Test "${test.name}" threw an error: ${error.message}`, 'red');
      failed++;
    }
  }

  logSection('Test Results');
  log(`✅ Passed: ${passed}`, 'green');
  log(`❌ Failed: ${failed}`, failed > 0 ? 'red' : 'green');
  log(`📊 Total: ${passed + failed}`, 'blue');

  if (failed === 0) {
    log(`\n🎉 All tests passed! Your Neon MCP setup is ready to use.`, 'green');
    log(`\nNext steps:`, 'blue');
    log(`  1. Use Claude Code with MCP to create a development branch`, 'blue');
    log(`  2. Update your DATABASE_URL to point to the new branch`, 'blue');
    log(`  3. Run database migrations: npm run db:migrate`, 'blue');
  } else {
    log(`\n⚠️  Some tests failed. Please check the configuration and try again.`, 'yellow');
    log(`See NEON-SETUP.md for detailed setup instructions.`, 'yellow');
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Handle command line arguments
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Neon MCP Test Script

Usage: node scripts/test-neon-mcp.js [options]

Options:
  --help, -h    Show this help message

This script tests the Neon MCP server configuration and verifies:
  - Environment variables are set correctly
  - Package is installed
  - MCP configuration is valid
  - Neon API connectivity works
  - MCP server can start up

For setup instructions, see NEON-SETUP.md
  `);
  process.exit(0);
}

// Run the test suite
runAllTests().catch((error) => {
  console.error(`${colors.red}Unexpected error: ${error.message}${colors.reset}`);
  process.exit(1);
});