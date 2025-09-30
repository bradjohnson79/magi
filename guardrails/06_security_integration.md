# Magi Guardrail — Security Standards & DevOps Integration

## Security Tool Stack

Magi integrates multiple security scanning tools with strict but practical quality gates:

### Primary Security Tools

- **Semgrep**: Static analysis for security vulnerabilities, code quality, and AI-specific risks
- **Serena**: Advanced security scanning with AI/LLM-specific vulnerability detection
- **Playwright**: End-to-end testing with security-focused test scenarios
- **Context7 MCP**: Secure AI model communication and context management

## Quality Gates & Thresholds

### CI/CD Failure Conditions

- **HIGH severity findings** from Semgrep → **FAIL CI**
- **HIGH severity findings** from Serena → **FAIL CI**
- **Any Playwright test failure** → **FAIL CI**
- **Pre-commit hook failures** → **BLOCK commit**

### Warning Conditions (Non-blocking)

- **MEDIUM severity findings** → **WARN in PR comments**
- **LOW severity findings** → **LOG for monitoring**
- **Context7 MCP health issues** → **WARN in deployment logs**

### Production Deployment Gates

- **Zero HIGH severity findings** required for production deployment
- **Fresh security scan** on every production deployment
- **Health check validation** post-deployment

## Security Scanning Configuration

### Semgrep Rules (.semgrep.yml)

- **Standard rulesets**: `p/ci`, `p/owasp-top-ten`, `p/javascript`, `p/typescript`
- **AI-specific rules**: `p/ai/llm-security` for prompt injection detection
- **Mandatory custom rules**:
  - **Hardcoded secret detection**: Block any hardcoded API keys, tokens, or credentials
  - **child_process.exec blocking**: Prevent all `child_process.exec()` calls unless allowlisted
  - **eval() and new Function() blocking**: Prevent dynamic code execution
  - **SQL injection prevention**: Block unsafe template literals in database queries
  - **Prompt injection patterns**: Detect potential AI prompt injection vulnerabilities
  - **Model output validation**: Ensure all AI outputs are scanned before logging

### Serena Configuration (serena/serena.yml)

- **Policy profile**: `strict` for production, `standard` for staging
- **AI security checks**: LLM vulnerabilities, prompt injection, data leakage
- **Privacy checks**: PII exposure, cross-tenant data leakage
- **Custom rules**: Magi-specific security patterns

### Pre-commit Hooks (.pre-commit-config.yaml)

- **ESLint** with auto-fix
- **Prettier** for code formatting
- **TypeScript** type checking
- **Semgrep** with error-level findings blocking commits
- **Secret detection** for hardcoded credentials
- **Prisma schema validation**
- **AI security pattern detection**

## Developer Workflow

### Local Development

```bash
# Run all security checks locally
pnpm security:check

# Individual tool runs
pnpm scan:semgrep
pnpm scan:serena
pnpm test:e2e

# Check MCP endpoint health
pnpm mcp:check
pnpm mcp:health

# Run pre-commit hooks manually
pnpm precommit
```

### Pre-commit Process

1. **Code formatting** (Prettier, ESLint auto-fix)
2. **Type checking** (TypeScript)
3. **Security scanning** (Semgrep error-level only)
4. **Secret detection** (API keys, tokens)
5. **Schema validation** (Prisma)
6. **AI security checks** (prompt injection patterns)

### CI/CD Process

1. **Parallel security scans** (Semgrep + Serena)
2. **E2E testing** with security scenarios
3. **Dependency audit** for known vulnerabilities
4. **Build verification** with security headers
5. **Pre-deployment security gate**
6. **Post-deployment health validation**

## Core Security Requirements

### Secret Management

- **NO SECRETS IN CODE**: All secrets must be stored in environment variables or GitHub Secrets
- **Environment-based configuration**: Use `.env` files for local development
- **GitHub Secrets**: Use repository secrets for CI/CD pipelines
- **Secret detection**: Pre-commit hooks must block any hardcoded secrets
- **Model output scanning**: ALL AI model outputs must be scanned for secrets before logging

### Code Execution Security

- **child_process.exec restrictions**: Block all `child_process.exec()` calls unless on approved allowlist
- **Allowlisted commands only**: Maintain strict allowlist of permitted shell commands
- **Input sanitization**: All user inputs to shell commands must be sanitized
- **Audit logging**: Log all shell command executions with full context

### Security Scanning Requirements

- **Semgrep + Serena mandatory**: Both tools must pass with zero HIGH severity findings
- **Blocking CI failures**: Any HIGH severity finding immediately fails CI/CD
- **Pre-deployment gates**: Fresh security scans required before every production deployment
- **No exceptions policy**: HIGH severity findings cannot be overridden

## AI-Specific Security Measures

### Prompt Injection Protection

- **Static analysis** for injection patterns in code
- **Runtime filtering** of user inputs to AI models
- **Context isolation** between user sessions
- **Model output sanitization** and secret scanning

### Data Privacy & Leakage Prevention

- **Secret redaction** in ALL model run logs using `redactSecretsFromObject()`
- **PII detection** in prompts and responses
- **Cross-tenant isolation** validation
- **Data retention policy** enforcement
- **Output validation** before any logging or storage

### Model Security

- **Authentication** for all model API calls
- **Rate limiting** and abuse prevention
- **Model access logging** with provenance tracking
- **Response validation** and mandatory secret scanning

## Integration Points

### Context7 MCP Integration

- **Health monitoring** of MCP endpoints
- **Tool availability verification**
- **Request/response logging** with sensitive data redaction
- **Fallback mechanisms** for service outages

### Telemetry & Monitoring

- **Security scan results** logged to `telemetry_events`
- **Model run security metrics** tracked
- **Failed security checks** aggregated for analysis
- **Real-time alerting** for critical security events

## Compliance & Governance

### Security Standards

- **OWASP Top 10** coverage for web applications
- **OWASP AI Security Top 10** for AI-specific risks
- **CWE mapping** for vulnerability classification
- **SOC2 compliance** requirements

### Audit Trail

- **All security scans** logged with timestamps
- **Policy violations** tracked and reported
- **Remediation actions** documented
- **Security training** completion tracked

### Data Protection

- **Secrets never logged** in plain text - use `redactSecretsFromObject()` for all outputs
- **PII automatically redacted** from logs
- **Model outputs scanned** before any logging or storage
- **Environment-based secrets** only - no hardcoded credentials
- **GitHub Secrets** for CI/CD pipelines
- **Data retention policies** enforced
- **Right to deletion** implemented

## Continuous Improvement

### Self-Evolution Integration

- **Security scan results** feed into model improvement
- **False positive reduction** through feedback loops
- **New vulnerability pattern detection**
- **Automated security policy updates**

### Metrics & KPIs

- **Mean time to fix** security issues
- **False positive rate** for security tools
- **Security scan coverage** percentage
- **Critical vulnerability exposure time**

## Emergency Procedures

### Security Incident Response

1. **Immediate deployment halt** for critical findings
2. **Automated rollback** for production issues
3. **Security team notification** for high-severity events
4. **Incident tracking** and post-mortem analysis

### Tool Failures

- **Graceful degradation** when security tools are unavailable
- **Manual approval gates** for critical deployments
- **Alternative scanning methods** as fallbacks
- **Service restoration procedures**

## Tool Installation & Setup

### Prerequisites

```bash
# Install security tools
pip install semgrep
npm install -g @playwright/test

# Install pre-commit
pip install pre-commit
pre-commit install

# Verify installations
pnpm security:install
```

### Configuration Files

- `.semgrep.yml` - Semgrep security rules
- `serena/serena.yml` - Serena scan configuration
- `.pre-commit-config.yaml` - Pre-commit hook configuration
- `mcp/clients/context7.json` - Context7 MCP client settings
- `playwright.config.ts` - E2E test configuration

This security integration ensures that Magi maintains the highest security standards while enabling rapid, secure development and deployment.