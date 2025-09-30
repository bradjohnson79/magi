# Magi Guardrail — Testing Standards & Requirements

## Testing Philosophy

Magi employs a comprehensive testing strategy that ensures quality, security, and reliability through automated testing at multiple levels. Our testing approach prioritizes critical user flows and maintains high coverage standards.

## Testing Stack

### Core Testing Tools

- **Playwright**: End-to-end testing for critical user flows and security scenarios
- **Vitest**: Unit and integration testing with fast execution
- **Jest**: Legacy unit tests and specialized testing scenarios
- **Testing Library**: Component testing utilities for React components
- **MSW (Mock Service Worker)**: API mocking for reliable test environments

## Critical User Flow Requirements

### Playwright E2E Testing (Mandatory)

Playwright tests are **required** for all critical user flows. These tests must pass before any production deployment.

#### Required Test Scenarios

1. **Authentication Flow**
   ```typescript
   // Required test coverage:
   - User registration with email verification
   - User login with valid credentials
   - Login failure with invalid credentials
   - Password reset flow
   - Session persistence across browser restarts
   - Multi-factor authentication (if enabled)
   - Logout and session cleanup
   ```

2. **Project Creation & Management**
   ```typescript
   // Required test coverage:
   - Create new project with valid inputs
   - Project creation validation errors
   - Project listing and navigation
   - Project deletion with confirmation
   - Project sharing and permissions
   - Project settings modification
   ```

3. **Preview & Live Updates**
   ```typescript
   // Required test coverage:
   - Real-time preview updates during editing
   - Preview rendering with different screen sizes
   - Error handling in preview mode
   - Preview URL sharing and access
   - Version comparison and rollback
   - Live collaboration features
   ```

#### Security-Focused E2E Tests

- **XSS prevention**: Verify user inputs are properly sanitized
- **CSRF protection**: Test form submissions with CSRF tokens
- **Authentication bypass**: Attempt to access protected routes without auth
- **Role-based access**: Verify permission boundaries are enforced
- **Input validation**: Test boundary conditions and injection attempts

### Test Configuration & Reliability

#### Playwright Configuration

```typescript
// playwright.config.ts requirements
export default defineConfig({
  // Parallel execution for faster CI
  workers: process.env.CI ? 2 : undefined,

  // Retry strategy with trace collection
  retries: process.env.CI ? 2 : 0,

  // Trace on first retry for debugging
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  // Projects for different browsers
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
```

#### Trace Collection & CI Integration

- **Trace on first retry**: Automatically collect traces when tests fail initially
- **CI failure uploads**: Upload traces, screenshots, and videos on CI failures
- **Artifact retention**: Maintain test artifacts for 30 days for debugging
- **Test reporting**: Generate detailed HTML reports for all test runs

```bash
# CI commands for trace handling
pnpm test:e2e --reporter=html
pnpm playwright show-report  # For local debugging
```

## Unit Testing Standards

### Coverage Requirements

- **Minimum coverage gate**: 70% line coverage for all new code
- **Critical paths**: 90%+ coverage for authentication, security, and payment flows
- **Utility functions**: 100% coverage for pure functions and utilities
- **API routes**: 85%+ coverage for all API endpoints

### Coverage Configuration

```typescript
// vitest.config.ts coverage settings
export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70,
        },
        // Critical modules require higher coverage
        'src/lib/auth/*': { lines: 90 },
        'src/lib/security/*': { lines: 90 },
        'src/api/v1/*': { lines: 85 },
      },
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/types/*',
      ],
    },
  },
});
```

### Unit Test Requirements

#### API Route Testing

```typescript
// All API routes must have comprehensive tests
describe('API Route: /api/v1/intent', () => {
  it('should handle valid requests', async () => {
    // Test happy path
  });

  it('should validate authentication', async () => {
    // Test unauthorized access
  });

  it('should validate input parameters', async () => {
    // Test input validation
  });

  it('should handle database errors', async () => {
    // Test error scenarios
  });

  it('should redact sensitive data in logs', async () => {
    // Test security measures
  });
});
```

#### Component Testing

```typescript
// React components must test user interactions
describe('Component: ProjectCard', () => {
  it('should render project information', () => {
    // Test rendering
  });

  it('should handle click events', () => {
    // Test user interactions
  });

  it('should show loading states', () => {
    // Test async states
  });

  it('should handle error states', () => {
    // Test error handling
  });
});
```

## CI/CD Integration

### Test Execution Pipeline

```yaml
# .github/workflows/ci.yml
test:
  runs-on: ubuntu-latest
  steps:
    - name: Run unit tests with coverage
      run: pnpm test:coverage

    - name: Check coverage thresholds
      run: pnpm coverage:check

    - name: Run E2E tests
      run: pnpm test:e2e

    - name: Upload test artifacts
      if: failure()
      uses: actions/upload-artifact@v3
      with:
        name: playwright-report
        path: playwright-report/
```

### Failure Handling

- **Unit test failures**: Block deployment immediately
- **E2E test failures**: Block deployment with trace upload
- **Coverage failures**: Block merge until thresholds are met
- **Flaky test handling**: Automatic retry with trace collection

## Testing Best Practices

### Test Organization

```
tests/
├── unit/                 # Unit tests
│   ├── components/       # React component tests
│   ├── lib/             # Utility function tests
│   ├── api/             # API route tests
│   └── services/        # Service layer tests
├── integration/          # Integration tests
│   ├── database/        # Database integration tests
│   └── external/        # External service tests
└── e2e/                 # End-to-end tests
    ├── auth/            # Authentication flows
    ├── projects/        # Project management flows
    └── collaboration/   # Real-time collaboration
```

### Test Data Management

- **Test fixtures**: Use consistent test data across all tests
- **Database seeding**: Automated test data setup and teardown
- **Mock services**: Mock external dependencies for reliable tests
- **Environment isolation**: Separate test databases and services

```typescript
// Test fixture example
export const testUsers = {
  validUser: {
    email: 'test@example.com',
    password: 'SecurePassword123!',
    name: 'Test User',
  },
  adminUser: {
    email: 'admin@example.com',
    password: 'AdminPassword123!',
    name: 'Admin User',
    role: 'admin',
  },
};
```

### Performance Testing

- **Load testing**: Simulate concurrent users for critical flows
- **Performance budgets**: Monitor and alert on performance regressions
- **Memory leak detection**: Test for memory leaks in long-running scenarios
- **API response times**: Verify API performance under load

## Security Testing Integration

### Automated Security Tests

- **Input sanitization**: Test all user inputs for XSS and injection
- **Authentication bypass**: Attempt to circumvent authentication
- **Authorization checks**: Verify role-based access controls
- **Data exposure**: Test for sensitive data leaks in responses

### Manual Security Testing

- **Penetration testing**: Regular manual security assessments
- **Code review**: Security-focused code reviews for all changes
- **Dependency audits**: Regular audits of third-party dependencies
- **Compliance validation**: Ensure tests meet compliance requirements

## Quality Gates

### Pre-merge Requirements

- ✅ All unit tests pass with 70%+ coverage
- ✅ All E2E tests pass for critical flows
- ✅ Security tests pass
- ✅ Performance budgets met
- ✅ No HIGH severity security findings

### Production Deployment Gates

- ✅ Full test suite passes on target environment
- ✅ Performance regression tests pass
- ✅ Security scan results clean
- ✅ Database migration tests successful

## Monitoring & Alerting

### Test Monitoring

- **Test execution time**: Monitor and alert on slow tests
- **Flaky test detection**: Identify and fix unreliable tests
- **Coverage trends**: Track coverage changes over time
- **Test failure analysis**: Automated categorization of failures

### Reporting

- **Daily test reports**: Summary of test health and coverage
- **Weekly trends**: Analysis of test suite improvements
- **Failure root cause**: Detailed analysis of test failures
- **Performance metrics**: Test execution performance tracking

This testing strategy ensures that Magi maintains high quality and reliability while enabling rapid development and deployment.