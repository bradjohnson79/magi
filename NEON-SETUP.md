# Neon Database Setup Guide for MAGI Development

## Overview

This guide will help you set up Neon as the development database for the MAGI project, including MCP (Model Context Protocol) integration for AI-powered database management.

## Prerequisites

- Node.js >= 18.0.0
- Existing MAGI project setup
- Neon account (sign up at https://neon.tech)

## Setup Steps

### 1. Neon Account Setup

1. **Create a Neon Account**
   - Visit https://neon.tech and sign up
   - Verify your email address

2. **Create a New Project**
   - In the Neon Console, click "Create Project"
   - Choose a name (e.g., "magi-development")
   - Select your preferred region
   - Note down the Project ID from the URL or settings

3. **Get API Key**
   - Go to Account Settings > API Keys
   - Click "Create API Key"
   - Give it a name (e.g., "MAGI MCP Development")
   - Copy the API key (starts with `neon_api_key_`)

4. **Get Database Credentials**
   - In your project dashboard, click on "Connection Details"
   - Copy the connection string
   - Note the database name, username, and host

### 2. Environment Configuration

Update your environment files with the Neon credentials:

#### `.env.local` (for local development)
```bash
# Neon Database Configuration for Development
NEON_API_KEY=neon_api_key_your_actual_key_here
NEON_PROJECT_ID=your_project_id_from_neon_console
NEON_DATABASE_NAME=neondb
NEON_USERNAME=neondb_owner

# Update DATABASE_URL for production use
# DATABASE_URL=postgresql://username:password@host/database?sslmode=require
```

#### `.env` (update for production)
Replace the DATABASE_URL with your Neon connection string when ready for production.

### 3. MCP Server Configuration

The MCP configuration has been updated in `mcp-config.json` to include the Neon MCP server:

```json
{
  "mcpServers": {
    "neon": {
      "command": "npx",
      "args": ["-y", "@neondatabase/mcp-server-neon"],
      "env": {
        "NEON_API_KEY": "${NEON_API_KEY}"
      }
    }
  }
}
```

### 4. Available Neon MCP Tools

Once configured, the following tools will be available through MCP:

**Project Management:**
- `list_projects` - List all Neon projects
- `create_project` - Create a new Neon project
- `delete_project` - Delete a project

**Branch Management:**
- `create_branch` - Create a new database branch
- `list_branches` - List branches in a project
- `delete_branch` - Delete a branch
- `reset_from_parent` - Reset branch from parent state

**Database Operations:**
- `get_connection_string` - Get connection string for a branch
- `run_query` - Execute SQL queries
- `list_slow_queries` - Monitor database performance

**Migrations:**
- `prepare_database_migration` - Prepare schema migrations
- `complete_database_migration` - Complete migrations

**Compute Management:**
- `list_branch_computes` - List compute endpoints

### 5. Creating a Development Branch

You can create a development branch using the Neon MCP tools:

1. **List existing projects:**
   ```
   Ask Claude Code: "List my Neon projects"
   ```

2. **Create a development branch:**
   ```
   Ask Claude Code: "Create a new branch called 'development' in my MAGI project"
   ```

3. **Get the connection string:**
   ```
   Ask Claude Code: "Get the connection string for the development branch"
   ```

### 6. Database Migration

Once you have a development branch:

1. **Update DATABASE_URL** in your environment to point to the development branch
2. **Run Prisma migrations:**
   ```bash
   npx prisma migrate dev --name init
   ```
3. **Generate Prisma client:**
   ```bash
   npx prisma generate
   ```

### 7. Testing the Setup

Test your Neon MCP integration:

```bash
# Test MCP server startup
npm run mcp:test

# Test database connection
npx prisma db pull
```

## Available NPM Scripts

Add these scripts to your `package.json`:

```json
{
  "scripts": {
    "neon:test": "npx @neondatabase/mcp-server-neon",
    "db:migrate:dev": "npx prisma migrate dev",
    "db:generate": "npx prisma generate",
    "db:studio": "npx prisma studio"
  }
}
```

## Branch Management Strategy

Recommended branching strategy for development:

1. **main** - Production database branch
2. **staging** - Staging environment branch
3. **development** - Main development branch
4. **feature-branches** - Individual feature development
5. **test-branches** - Temporary testing branches

## Security Considerations

⚠️ **Important Security Notes:**

1. **Never commit API keys** to version control
2. **Use environment variables** for all credentials
3. **Review MCP actions** before execution in production
4. **Use separate projects** for different environments
5. **Regularly rotate API keys**

## Troubleshooting

### Common Issues:

1. **API Key Invalid**
   - Verify the key is correct and active
   - Check the key hasn't expired

2. **Project Not Found**
   - Verify the PROJECT_ID is correct
   - Ensure you have access to the project

3. **Connection Refused**
   - Check if your IP is allowed (Neon allows all by default)
   - Verify the connection string format

4. **MCP Server Not Starting**
   - Check Node.js version (>= 18.0.0)
   - Verify all environment variables are set
   - Check the MCP configuration syntax

### Getting Help:

- Neon Documentation: https://neon.tech/docs
- MCP Documentation: https://modelcontextprotocol.io
- MAGI Project Issues: Create an issue in the repository

## Next Steps

After completing this setup:

1. Create your development database schema
2. Set up automated testing with separate test branches
3. Configure CI/CD pipelines with branch-per-PR strategy
4. Implement database backup and recovery procedures
5. Set up monitoring and alerting for database performance

---

**Setup completed!** Your MAGI project now has Neon database integration with MCP support for AI-powered database management.