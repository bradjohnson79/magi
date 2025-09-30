#!/usr/bin/env node
/**
 * Neon Setup Status Script
 *
 * Shows the current status of Neon MCP setup and next steps
 */

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logHeader() {
  console.log(`${colors.bold}${colors.blue}
╔════════════════════════════════════════════════════════════════════════════════╗
║                      MAGI NEON DATABASE SETUP STATUS                          ║
╚════════════════════════════════════════════════════════════════════════════════╝${colors.reset}\n`);
}

function checkSetupStatus() {
  log(`${colors.bold}Setup Status:${colors.reset}\n`);

  // Check package installation
  try {
    const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    log('✅ Neon MCP server package installed', 'green');
    log(`   @neondatabase/mcp-server-neon in dependencies`, 'dim');
  } catch {
    log('❌ Package.json not found or corrupted', 'red');
  }

  // Check MCP configuration
  try {
    const mcpConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'mcp-config.json'), 'utf8'));
    if (mcpConfig.mcpServers && mcpConfig.mcpServers.neon) {
      log('✅ MCP configuration updated', 'green');
      log('   Neon server configured in mcp-config.json', 'dim');
    } else {
      log('❌ MCP configuration missing Neon server', 'red');
    }
  } catch {
    log('❌ MCP configuration file not found', 'red');
  }

  // Check environment variables
  const neonApiKey = process.env.NEON_API_KEY;
  const neonProjectId = process.env.NEON_PROJECT_ID;

  if (!neonApiKey || neonApiKey === 'your_neon_api_key_here') {
    log('⚠️  NEON_API_KEY not configured', 'yellow');
    log('   Environment variable needs to be set', 'dim');
  } else {
    log('✅ NEON_API_KEY configured', 'green');
    log(`   Key: ${neonApiKey.substring(0, 8)}...${neonApiKey.substring(neonApiKey.length - 4)}`, 'dim');
  }

  if (!neonProjectId || neonProjectId === 'your_neon_project_id_here') {
    log('⚠️  NEON_PROJECT_ID not configured', 'yellow');
    log('   Environment variable needs to be set', 'dim');
  } else {
    log('✅ NEON_PROJECT_ID configured', 'green');
    log(`   Project ID: ${neonProjectId}`, 'dim');
  }

  // Check documentation
  if (fs.existsSync(path.join(__dirname, '..', 'NEON-SETUP.md'))) {
    log('✅ Setup documentation available', 'green');
    log('   NEON-SETUP.md created', 'dim');
  }
}

function showNextSteps() {
  const neonApiKey = process.env.NEON_API_KEY;
  const neonProjectId = process.env.NEON_PROJECT_ID;
  const needsCredentials = !neonApiKey || neonApiKey === 'your_neon_api_key_here' ||
                          !neonProjectId || neonProjectId === 'your_neon_project_id_here';

  log(`\n${colors.bold}Next Steps:${colors.reset}\n`);

  if (needsCredentials) {
    log('📋 TO COMPLETE SETUP:', 'yellow');
    log('');
    log('1. Create a Neon account at https://neon.tech', 'blue');
    log('2. Create a new project for MAGI development', 'blue');
    log('3. Get your API key from Account Settings > API Keys', 'blue');
    log('4. Update .env.local with your credentials:', 'blue');
    log('   NEON_API_KEY=neon_api_key_your_actual_key_here', 'dim');
    log('   NEON_PROJECT_ID=your_project_id_from_console', 'dim');
    log('');
    log('5. Test the setup:', 'blue');
    log('   npm run mcp:test:neon', 'dim');
    log('');
  } else {
    log('🎉 SETUP COMPLETE! You can now:', 'green');
    log('');
    log('1. Use Claude Code to create a development branch:', 'blue');
    log('   "Create a new branch called \'development\' in my MAGI project"', 'dim');
    log('');
    log('2. Get the connection string for the new branch:', 'blue');
    log('   "Get the connection string for the development branch"', 'dim');
    log('');
    log('3. Update your DATABASE_URL in .env.local', 'blue');
    log('');
    log('4. Run database migrations:', 'blue');
    log('   npm run db:migrate', 'dim');
    log('');
  }

  log('📚 AVAILABLE COMMANDS:', 'blue');
  log('   npm run mcp:neon          - Start Neon MCP server', 'dim');
  log('   npm run mcp:test:neon     - Test Neon MCP setup', 'dim');
  log('   npm run db:migrate        - Run database migrations', 'dim');
  log('   npm run db:studio         - Open Prisma Studio', 'dim');
  log('');

  log('📖 DOCUMENTATION:', 'blue');
  log('   NEON-SETUP.md             - Detailed setup guide', 'dim');
  log('   https://neon.tech/docs    - Neon documentation', 'dim');
  log('   https://modelcontextprotocol.io - MCP documentation', 'dim');
}

function showAvailableTools() {
  log(`\n${colors.bold}Available Neon MCP Tools:${colors.reset}\n`);

  const tools = [
    { name: 'list_projects', desc: 'List all Neon projects in your account' },
    { name: 'create_project', desc: 'Create a new Neon project' },
    { name: 'create_branch', desc: 'Create a new database branch' },
    { name: 'list_branches', desc: 'List branches in a project' },
    { name: 'delete_branch', desc: 'Delete a database branch' },
    { name: 'reset_from_parent', desc: 'Reset branch from parent state' },
    { name: 'get_connection_string', desc: 'Get connection string for a branch' },
    { name: 'run_query', desc: 'Execute SQL queries on database' },
    { name: 'list_slow_queries', desc: 'Monitor database performance' },
    { name: 'prepare_database_migration', desc: 'Prepare schema migrations' },
    { name: 'complete_database_migration', desc: 'Complete migrations' },
    { name: 'list_branch_computes', desc: 'List compute endpoints' }
  ];

  tools.forEach(tool => {
    log(`• ${tool.name}`, 'green');
    log(`  ${tool.desc}`, 'dim');
  });

  log(`\n${colors.dim}These tools will be available through Claude Code once your credentials are configured.${colors.reset}`);
}

// Main execution
logHeader();
checkSetupStatus();
showNextSteps();
showAvailableTools();

log(`\n${colors.bold}${colors.blue}For support, see NEON-SETUP.md or create an issue in the repository.${colors.reset}\n`);