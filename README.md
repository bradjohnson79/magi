# Magi Platform

AI-powered application builder with intelligent orchestration and self-evolution capabilities.

## Features

- 🤖 **AI Matrix Orchestration** - Multiple specialized AI agents working together
- 💬 **Conversational Interface** - Natural language to application generation
- 👀 **Live Preview** - Real-time code preview and editing
- 🔄 **Version Control** - Snapshot and restore functionality
- 🔐 **Team Collaboration** - Multi-user support with role-based access
- 📊 **Self-Evolution** - Learning from feedback and improving over time

## Architecture

Magi follows the architecture principles defined in `/guardrails`:
- Automation-first design
- Phased development (MVP → Scale → Enterprise)
- Database abstraction for multi-provider support
- Modular, forward-compatible APIs

## Tech Stack

- **Frontend**: Next.js 15 (App Router), TypeScript, Tailwind CSS
- **Backend**: Next.js API Routes, Prisma ORM
- **Database**: Neon Postgres (with support for PlanetScale, Aurora, CockroachDB)
- **Authentication**: Clerk
- **AI**: OpenAI GPT-4, Anthropic Claude
- **Testing**: Playwright, Jest
- **Deployment**: Vercel (initially), Kubernetes (enterprise)

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL database (Neon recommended)
- Clerk account for authentication
- OpenAI API key

### Installation

1. Clone the repository:
```bash
git clone https://github.com/your-org/magi-online.git
cd magi-online/magi-app
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env.local
# Edit .env.local with your credentials
```

4. Set up the database:
```bash
npm run db:setup
```

5. Run the development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Development

### Project Structure

```
magi-app/
├── app/              # Next.js App Router pages and API routes
├── components/       # React components
├── lib/              # Utility libraries and database client
├── services/         # Business logic and AI agents
├── guardrails/       # Architecture principles and guidelines
├── prisma/           # Database schema and migrations
└── tests/            # E2E and unit tests
```

### Available Scripts

**Development:**
- `pnpm dev` - Start development server
- `pnpm build` - Build for production
- `pnpm clean` - Clean build artifacts

**Testing:**
- `pnpm test` - Run unit tests
- `pnpm test:watch` - Run unit tests in watch mode
- `pnpm test:e2e` - Run Playwright E2E tests
- `pnpm test:e2e:ui` - Run E2E tests with UI
- `pnpm test:e2e:debug` - Debug E2E tests

**Security Scanning:**
- `pnpm scan:semgrep` - Run Semgrep security scan
- `pnpm scan:serena` - Run Serena security scan
- `pnpm scan:all` - Run all security scans
- `pnpm security:check` - Complete security check

**Database:**
- `pnpm db:generate` - Generate Prisma client
- `pnpm db:migrate` - Run database migrations
- `pnpm db:push` - Push schema changes
- `pnpm db:seed` - Seed database with sample data
- `pnpm db:setup` - Complete database setup
- `pnpm db:studio` - Open Prisma Studio

**MCP & Integration:**
- `pnpm mcp:check` - Check Context7 MCP endpoints
- `pnpm mcp:health` - Health check MCP services

**Code Quality:**
- `pnpm lint` - Run ESLint
- `pnpm lint:fix` - Fix ESLint issues
- `pnpm typecheck` - Run TypeScript checks
- `pnpm precommit` - Run pre-commit hooks

### Database Management

The project uses Prisma ORM for database management:

```bash
# Generate Prisma client
npm run db:generate

# Create and apply migrations
npm run db:migrate

# Push schema changes (development)
npm run db:push

# Seed the database
npm run db:seed
```

### Testing

Run unit tests:
```bash
npm test
```

Run E2E tests:
```bash
npm run test:e2e
```

Run E2E tests with UI:
```bash
pnpm test:e2e:ui
```

## Security Integration

Magi includes comprehensive security scanning and protection:

### Security Tools

- **Semgrep**: Static analysis for security vulnerabilities and code quality
- **Serena**: Advanced security scanning with AI/LLM-specific checks
- **Playwright**: Security-focused E2E testing
- **Context7 MCP**: Secure AI model communication

### Local Security Setup

1. **Install security tools**:
```bash
# Install Semgrep
pip install semgrep

# Install pre-commit hooks
pip install pre-commit
pre-commit install

# Verify installations
pnpm security:install
```

2. **Run security scans**:
```bash
# Run all security checks
pnpm security:check

# Individual scans
pnpm scan:semgrep
pnpm scan:serena

# Check MCP endpoints
pnpm mcp:check
```

### Quality Gates

**CI Failures (Blocking):**
- HIGH severity findings from Semgrep or Serena
- Any Playwright test failures
- Pre-commit hook violations

**Warnings (Non-blocking):**
- MEDIUM severity security findings
- MCP endpoint health issues

### Pre-commit Hooks

The repository includes comprehensive pre-commit hooks:

- Code formatting (Prettier, ESLint)
- TypeScript type checking
- Security scanning (Semgrep)
- Secret detection
- Database schema validation
- AI security pattern detection

### Security Configuration Files

- `.semgrep.yml` - Security scanning rules
- `serena/serena.yml` - Advanced security configuration
- `.pre-commit-config.yaml` - Pre-commit hook setup
- `mcp/clients/context7.json` - MCP client configuration

### Expected Pass/Fail Criteria

**Development Environment:**
- Zero HIGH severity security findings required
- MEDIUM findings logged as warnings
- All E2E tests must pass
- Pre-commit hooks must succeed

**Production Deployment:**
- Comprehensive security scan before deployment
- Zero HIGH severity findings
- Post-deployment health validation
- Automatic rollback on security failures

## API Documentation

### Core Endpoints

- `POST /api/v1/intent` - Process natural language intent
- `POST /api/v1/execute` - Execute task graph
- `GET /api/v1/jobs/:id` - Get job status
- `GET /api/v1/models` - List available AI models
- `POST /api/v1/feedback` - Submit feedback
- `GET/POST /api/v1/restore` - Manage snapshots

## Deployment

### Vercel (Recommended for MVP)

1. Install Vercel CLI:
```bash
npm i -g vercel
```

2. Deploy:
```bash
vercel --prod
```

### Docker

```bash
docker build -t magi-app .
docker run -p 3000:3000 magi-app
```

## Contributing

Please read the architecture guidelines in `/guardrails` before contributing.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

Proprietary - All rights reserved

## Support

For issues and questions, please file an issue on GitHub or contact the development team.
