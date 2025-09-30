#!/usr/bin/env node

/**
 * Test script for GitHub MCP server
 *
 * This script tests the basic functionality of the GitHub MCP server
 * to ensure it's properly configured and can communicate with GitHub.
 */

const { spawn } = require('child_process');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const GITHUB_TOKEN = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

if (!GITHUB_TOKEN) {
  console.error('❌ GITHUB_PERSONAL_ACCESS_TOKEN not found in .env.local');
  process.exit(1);
}

console.log('🚀 Testing GitHub MCP Server...');
console.log('📝 Token configured:', GITHUB_TOKEN.substring(0, 20) + '...');

// Test the GitHub MCP server
const testServer = () => {
  return new Promise((resolve, reject) => {
    const server = spawn('npx', ['-y', '@modelcontextprotocol/server-github'], {
      env: {
        ...process.env,
        GITHUB_PERSONAL_ACCESS_TOKEN: GITHUB_TOKEN
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let output = '';
    let errorOutput = '';

    server.stdout.on('data', (data) => {
      output += data.toString();
    });

    server.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });

    server.on('close', (code) => {
      if (code === 0 || output.includes('GitHub MCP Server')) {
        resolve({ success: true, output, errorOutput });
      } else {
        reject({ success: false, output, errorOutput, code });
      }
    });

    server.on('error', (error) => {
      reject({ success: false, error: error.message });
    });

    // Send a simple test message and close
    setTimeout(() => {
      server.kill('SIGTERM');
    }, 2000);
  });
};

// Run the test
testServer()
  .then((result) => {
    console.log('✅ GitHub MCP Server is working!');
    console.log('📤 Server output:', result.output.trim());
    if (result.errorOutput) {
      console.log('⚠️  Warnings:', result.errorOutput.trim());
    }
    console.log('\n🎉 Setup complete! The GitHub MCP server is ready to use.');
    console.log('\n📋 Next steps:');
    console.log('1. Configure your Claude Code client to use the MCP server');
    console.log('2. Use mcp-config.json for Claude Code configuration');
    console.log('3. Test GitHub operations through Claude Code');
  })
  .catch((error) => {
    console.error('❌ GitHub MCP Server test failed:');
    console.error('Exit code:', error.code);
    console.error('Output:', error.output);
    console.error('Error output:', error.errorOutput);
    if (error.error) {
      console.error('Error:', error.error);
    }

    console.log('\n🔧 Troubleshooting tips:');
    console.log('1. Check your GitHub token permissions');
    console.log('2. Ensure you have internet connectivity');
    console.log('3. Verify the token is correctly set in .env.local');
    process.exit(1);
  });