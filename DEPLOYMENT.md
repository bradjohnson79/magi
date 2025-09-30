# Magi Deployment Guide

This guide covers the complete CI/CD setup and deployment process for the Magi platform.

## Overview

The Magi platform uses a modern CI/CD pipeline with:
- **GitHub Actions** for automated testing and deployment
- **Vercel** for hosting and deployment
- **Neon Postgres** for database hosting
- **pnpm** for dependency management

## Environments

- **Development**: Local development environment
- **Staging**: `develop` branch → staging.magi.dev
- **Production**: `main` branch → magi.dev

## Required Secrets

Configure these secrets in your GitHub repository settings:

### Database
- `DATABASE_URL_STAGING` - Neon staging database URL
- `DATABASE_URL_PROD` - Neon production database URL

### Authentication (Clerk)
- `CLERK_SECRET_KEY` - Production Clerk secret key
- `CLERK_SECRET_KEY_STAGING` - Staging Clerk secret key
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Production Clerk publishable key
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY_STAGING` - Staging Clerk publishable key

### AI Services
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key (optional)

### Payment (Stripe)
- `STRIPE_SECRET_KEY` - Stripe secret key
- `STRIPE_WEBHOOK_SECRET` - Stripe webhook secret
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` - Stripe publishable key

### Monitoring
- `SENTRY_DSN` - Sentry DSN for error tracking
- `SENTRY_DSN_STAGING` - Sentry DSN for staging
- `SENTRY_AUTH_TOKEN` - Sentry auth token for releases
- `SENTRY_ORG` - Sentry organization slug

### Infrastructure
- `VERCEL_TOKEN` - Vercel deployment token
- `VERCEL_ORG_ID` - Vercel organization ID
- `VERCEL_PROJECT_ID` - Vercel project ID
- `AWS_ACCESS_KEY_ID` - AWS access key for S3
- `AWS_SECRET_ACCESS_KEY` - AWS secret key for S3
- `S3_BUCKET` - S3 bucket name for snapshots

### Application
- `NEXT_PUBLIC_APP_URL` - Public application URL

## Workflows

### 1. CI Pipeline (`ci.yml`)

**Triggers**: Pull requests to `main` or `develop`

**Steps**:
1. Lint and type checking
2. Unit tests
3. E2E tests with Playwright
4. Security audit
5. Build verification

**Requirements**: All checks must pass before merge.

### 2. Staging Deployment (`deploy-staging.yml`)

**Triggers**: Push to `develop` branch

**Steps**:
1. Run database migrations on staging
2. Deploy to Vercel staging environment
3. Run smoke tests
4. Update deployment status

**Environment**: `staging`

### 3. Production Deployment (`deploy-prod.yml`)

**Triggers**:
- Push to `main` branch
- Release creation

**Steps**:
1. Run database migrations on production
2. Deploy to Vercel production environment
3. Comprehensive smoke tests
4. Update Sentry deployment
5. Automatic rollback on failure

**Environment**: `production`

### 4. Manual Database Migration (`db-migrate.yml`)

**Triggers**: Manual workflow dispatch

**Options**:
- Environment: `production` or `staging`
- Migration type: `push`, `migrate`, or `reset`
- Production confirmation required

## Setup Instructions

### 1. Initial Repository Setup

1. **Clone and setup**:
```bash
git clone https://github.com/your-org/magi-online.git
cd magi-online/magi-app
pnpm install
```

2. **Environment setup**:
```bash
cp .env.example .env.local
# Configure all required environment variables
```

3. **Database setup**:
```bash
pnpm db:setup
```

### 2. Vercel Setup

1. **Install Vercel CLI**:
```bash
npm i -g vercel
```

2. **Link project**:
```bash
vercel link
```

3. **Configure environment variables** in Vercel dashboard:
   - Go to Project Settings → Environment Variables
   - Add all required variables for each environment

### 3. GitHub Actions Setup

1. **Add repository secrets** (Settings → Secrets and variables → Actions)

2. **Create environment protection rules**:
   - Go to Settings → Environments
   - Create `staging` and `production` environments
   - Add protection rules for production (required reviewers, etc.)

### 4. Branch Protection

Configure branch protection rules:

**For `main` branch**:
- Require pull request reviews
- Require status checks to pass
- Require branches to be up to date
- Include administrators

**For `develop` branch**:
- Require status checks to pass
- Require branches to be up to date

## Deployment Process

### Development to Staging

1. **Create feature branch**:
```bash
git checkout -b feature/your-feature
# Make changes
git push origin feature/your-feature
```

2. **Create PR to develop**:
   - CI pipeline runs automatically
   - Review and merge

3. **Automatic staging deployment**:
   - Push to `develop` triggers staging deployment
   - Smoke tests run automatically

### Staging to Production

1. **Create PR from develop to main**:
   - Additional review required
   - CI pipeline runs

2. **Merge to main**:
   - Production deployment triggers automatically
   - Comprehensive smoke tests run
   - Automatic rollback on failure

### Hotfix Process

1. **Create hotfix branch from main**:
```bash
git checkout main
git pull origin main
git checkout -b hotfix/critical-fix
```

2. **Make fix and test**:
```bash
# Make changes
pnpm test
pnpm test:e2e
```

3. **Deploy via PR**:
   - Create PR to main
   - Emergency review and merge
   - Production deployment runs

### Manual Database Migration

For schema changes that require manual migration:

1. **Go to Actions tab** in GitHub
2. **Select "Database Migration (Manual)"**
3. **Click "Run workflow"**
4. **Configure options**:
   - Environment: `staging` or `production`
   - Migration type: `push`, `migrate`, or `reset`
   - For production: type "CONFIRM" in confirmation field
5. **Run workflow**

## Monitoring and Alerts

### Health Checks

- **Endpoint**: `/api/health`
- **Monitors**: Database connection, API status, build version
- **Frequency**: Every deployment, continuous monitoring

### Error Tracking

- **Sentry integration** for error tracking
- **Automatic release tracking**
- **Performance monitoring**

### Deployment Notifications

- **GitHub PR comments** with deployment status
- **Slack notifications** (configure webhook in workflow)
- **Email alerts** for production failures

## Troubleshooting

### Failed Deployment

1. **Check workflow logs** in GitHub Actions
2. **Review error messages** in deployment step
3. **Check health endpoint** manually
4. **Verify environment variables**

### Database Migration Issues

1. **Check database connection**
2. **Verify migration files**
3. **Run migration locally first**
4. **Use staging environment for testing**

### Rollback Process

**Automatic rollback** (production only):
- Triggered on deployment failure
- Reverts to previous successful deployment

**Manual rollback**:
```bash
# Via Vercel CLI
vercel --prod --rollback

# Via Vercel dashboard
# Go to Deployments → Select previous version → Promote to Production
```

## Security Considerations

### Secrets Management

- **Never commit secrets** to repository
- **Use GitHub Actions secrets** for CI/CD
- **Rotate secrets regularly**
- **Use least privilege principle**

### Database Security

- **Use connection pooling**
- **Enable SSL/TLS**
- **Regular backups**
- **Access logging**

### Deployment Security

- **Require code reviews**
- **Use environment protection**
- **Enable audit logging**
- **Monitor deployment activities**

## Performance Optimization

### Build Performance

- **pnpm for faster installs**
- **Turbopack for faster builds**
- **Cached dependencies**
- **Parallel test execution**

### Runtime Performance

- **Vercel edge functions**
- **Database connection pooling**
- **CDN for static assets**
- **Image optimization**

## Maintenance

### Regular Tasks

- **Update dependencies** monthly
- **Review and rotate secrets** quarterly
- **Database maintenance** (backups, cleanup)
- **Performance monitoring** and optimization

### Disaster Recovery

- **Database backups** (automated daily)
- **Code repository backups**
- **Documentation updates**
- **Incident response procedures**