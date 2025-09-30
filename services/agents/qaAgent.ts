/**
 * Quality Assurance Agent
 *
 * Specializes in testing and quality assurance:
 * - Test case generation and execution
 * - Code quality analysis
 * - Security testing
 * - Performance testing
 * - Accessibility testing
 * - Automated testing pipeline setup
 */

import { z } from 'zod';
import { BaseAgent } from './baseAgent';
import {
  AgentContext,
  AgentResult,
  Artifact,
  DEFAULT_AGENT_CONFIGS,
} from './types';

// Input validation schema
const QAInputSchema = z.object({
  operation: z.enum(['test-generation', 'quality-analysis', 'security-scan', 'performance-test', 'accessibility-audit', 'e2e-setup']),
  testType: z.enum(['unit', 'integration', 'e2e', 'security', 'performance', 'accessibility']).optional(),
  framework: z.enum(['vitest', 'jest', 'playwright', 'cypress', 'selenium']).optional(),
  codeToTest: z.string().optional(),
  requirements: z.array(z.string()).optional(),
  coverage: z.object({
    target: z.number().min(0).max(100).optional(),
    exclude: z.array(z.string()).optional(),
  }).optional(),
  securityLevel: z.enum(['standard', 'strict', 'enterprise']).optional(),
  performanceTargets: z.object({
    responseTime: z.number().optional(),
    throughput: z.number().optional(),
    errorRate: z.number().optional(),
  }).optional(),
  existingTests: z.string().optional(),
});

export class QAAgent extends BaseAgent {
  public readonly name = 'QAAgent';
  public readonly version = '1.0.0';
  public readonly capabilities = [
    'unit-test-generation',
    'integration-test-creation',
    'e2e-test-automation',
    'security-testing',
    'performance-testing',
    'accessibility-auditing',
    'code-quality-analysis',
    'test-coverage-analysis',
  ];

  constructor() {
    super(DEFAULT_AGENT_CONFIGS.QAAgent);
  }

  /**
   * Validate inputs specific to QA operations
   */
  async validateInputs(inputs: Record<string, any>): Promise<{ valid: boolean; errors: string[] }> {
    try {
      QAInputSchema.parse(inputs);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
        };
      }
      return {
        valid: false,
        errors: ['Unknown validation error'],
      };
    }
  }

  /**
   * Execute QA operation
   */
  protected async executeInternal(context: AgentContext): Promise<Omit<AgentResult, 'logs' | 'metrics'>> {
    this.validateContext(context);

    const {
      operation,
      testType,
      framework,
      codeToTest,
      requirements,
      coverage,
      securityLevel,
      performanceTargets,
      existingTests
    } = context.inputs;

    this.log('info', `Executing QA ${operation}`, {
      testType,
      framework,
      securityLevel
    });

    // Note: Snapshots usually not needed for QA operations (read-only analysis)
    // But we'll create one for security scans and performance tests that might modify configs

    let snapshotId: string | null = null;
    if (['security-scan', 'performance-test'].includes(operation)) {
      snapshotId = await this.createSnapshot(context, `Before QA ${operation}`);
    }

    try {
      let result;

      switch (operation) {
        case 'test-generation':
          result = await this.generateTests(testType, framework, codeToTest, requirements, coverage);
          break;
        case 'quality-analysis':
          result = await this.analyzeCodeQuality(codeToTest, requirements);
          break;
        case 'security-scan':
          result = await this.performSecurityScan(codeToTest, securityLevel);
          break;
        case 'performance-test':
          result = await this.setupPerformanceTests(codeToTest, performanceTargets, framework);
          break;
        case 'accessibility-audit':
          result = await this.performAccessibilityAudit(codeToTest, requirements);
          break;
        case 'e2e-setup':
          result = await this.setupE2ETests(framework, requirements);
          break;
        default:
          throw new Error(`Unsupported QA operation: ${operation}`);
      }

      this.log('info', `QA ${operation} completed successfully`, {
        artifactsGenerated: result.artifacts?.length || 0,
      });

      return {
        success: true,
        ...result,
        snapshotId,
      };

    } catch (error) {
      this.log('error', `QA ${operation} failed`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Generate comprehensive tests
   */
  private async generateTests(
    testType: string = 'unit',
    framework: string = 'vitest',
    codeToTest: string,
    requirements: string[] = [],
    coverage: any = {}
  ): Promise<any> {
    this.log('debug', 'Generating tests', { testType, framework, targetCoverage: coverage.target });

    const prompt = this.createTestGenerationPrompt(testType, framework, codeToTest, requirements, coverage);

    const result = await this.callModel(prompt, {
      maxTokens: 8192,
      temperature: 0.2, // Slightly higher for test creativity
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const testSuite = this.parseTestResponse(result.response);

    const artifacts: Artifact[] = [];

    // Generate test files
    for (const testFile of testSuite.files) {
      artifacts.push({
        id: `test-${testFile.name}-${Date.now()}`,
        type: 'test',
        name: testFile.filename,
        content: testFile.content,
        path: testFile.path,
        metadata: {
          testType,
          framework,
          coverage: testFile.coverage,
          testCount: testFile.testCount,
        },
      });
    }

    // Generate test configuration
    artifacts.push({
      id: `test-config-${Date.now()}`,
      type: 'config',
      name: `${framework}.config.ts`,
      content: this.generateTestConfig(framework, coverage),
      path: `${framework}.config.ts`,
      metadata: {
        type: 'test-configuration',
        framework,
      },
    });

    // Generate test utilities if needed
    if (testSuite.utilities) {
      artifacts.push({
        id: `test-utils-${Date.now()}`,
        type: 'code',
        name: 'test-utils.ts',
        content: testSuite.utilities,
        path: 'tests/utils/test-utils.ts',
        metadata: {
          type: 'test-utilities',
          framework,
        },
      });
    }

    return {
      outputs: {
        testSuite,
        framework,
        testType,
        coverage: testSuite.estimatedCoverage,
        testCount: testSuite.totalTests,
      },
      artifacts,
    };
  }

  /**
   * Analyze code quality
   */
  private async analyzeCodeQuality(codeToTest: string, requirements: string[] = []): Promise<any> {
    this.log('debug', 'Analyzing code quality');

    const prompt = this.createQualityAnalysisPrompt(codeToTest, requirements);

    const result = await this.callModel(prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const analysis = this.parseQualityResponse(result.response);

    const artifacts: Artifact[] = [
      {
        id: `quality-report-${Date.now()}`,
        type: 'documentation',
        name: 'code-quality-report.md',
        content: this.generateQualityReport(analysis),
        path: 'docs/quality-report.md',
        metadata: {
          type: 'quality-analysis',
          score: analysis.overallScore,
          timestamp: new Date().toISOString(),
        },
      },
    ];

    // Generate fixes if critical issues found
    if (analysis.criticalIssues.length > 0) {
      artifacts.push({
        id: `quality-fixes-${Date.now()}`,
        type: 'code',
        name: 'quality-fixes.ts',
        content: this.generateQualityFixes(analysis.criticalIssues),
        path: 'scripts/quality-fixes.ts',
        metadata: {
          type: 'quality-fixes',
          issueCount: analysis.criticalIssues.length,
        },
      });
    }

    return {
      outputs: {
        analysis,
        score: analysis.overallScore,
        issues: analysis.issues,
        recommendations: analysis.recommendations,
      },
      artifacts,
    };
  }

  /**
   * Perform security scan
   */
  private async performSecurityScan(codeToTest: string, securityLevel: string = 'standard'): Promise<any> {
    this.log('debug', 'Performing security scan', { securityLevel });

    const prompt = this.createSecurityScanPrompt(codeToTest, securityLevel);

    const result = await this.callModel(prompt, {
      maxTokens: 5120,
      temperature: 0.0, // Very deterministic for security
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const securityResults = this.parseSecurityResponse(result.response);

    const artifacts: Artifact[] = [
      {
        id: `security-report-${Date.now()}`,
        type: 'documentation',
        name: 'security-scan-report.md',
        content: this.generateSecurityReport(securityResults),
        path: 'docs/security-scan-report.md',
        metadata: {
          type: 'security-scan',
          securityLevel,
          vulnerabilityCount: securityResults.vulnerabilities.length,
          timestamp: new Date().toISOString(),
        },
      },
    ];

    // Generate security test cases
    if (securityResults.testCases.length > 0) {
      artifacts.push({
        id: `security-tests-${Date.now()}`,
        type: 'test',
        name: 'security.test.ts',
        content: this.generateSecurityTests(securityResults.testCases),
        path: 'tests/security/security.test.ts',
        metadata: {
          type: 'security-tests',
          testCount: securityResults.testCases.length,
        },
      });
    }

    return {
      outputs: {
        securityResults,
        vulnerabilities: securityResults.vulnerabilities,
        recommendations: securityResults.recommendations,
        riskLevel: securityResults.riskLevel,
      },
      artifacts,
    };
  }

  /**
   * Setup performance tests
   */
  private async setupPerformanceTests(
    codeToTest: string,
    performanceTargets: any = {},
    framework: string = 'playwright'
  ): Promise<any> {
    this.log('debug', 'Setting up performance tests', { framework, targets: performanceTargets });

    const prompt = this.createPerformanceTestPrompt(codeToTest, performanceTargets, framework);

    const result = await this.callModel(prompt, {
      maxTokens: 6144,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const performanceTests = this.parsePerformanceResponse(result.response);

    const artifacts: Artifact[] = [
      {
        id: `perf-tests-${Date.now()}`,
        type: 'test',
        name: 'performance.test.ts',
        content: performanceTests.testCode,
        path: 'tests/performance/performance.test.ts',
        metadata: {
          type: 'performance-tests',
          framework,
          targets: performanceTargets,
        },
      },
      {
        id: `perf-config-${Date.now()}`,
        type: 'config',
        name: 'performance.config.ts',
        content: this.generatePerformanceConfig(framework, performanceTargets),
        path: 'tests/performance/performance.config.ts',
        metadata: {
          type: 'performance-configuration',
          framework,
        },
      },
    ];

    return {
      outputs: {
        performanceTests,
        targets: performanceTargets,
        framework,
        testCount: performanceTests.testCount,
      },
      artifacts,
    };
  }

  /**
   * Perform accessibility audit
   */
  private async performAccessibilityAudit(codeToTest: string, requirements: string[] = []): Promise<any> {
    this.log('debug', 'Performing accessibility audit');

    const prompt = this.createAccessibilityAuditPrompt(codeToTest, requirements);

    const result = await this.callModel(prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const accessibilityResults = this.parseAccessibilityResponse(result.response);

    const artifacts: Artifact[] = [
      {
        id: `a11y-report-${Date.now()}`,
        type: 'documentation',
        name: 'accessibility-audit.md',
        content: this.generateAccessibilityReport(accessibilityResults),
        path: 'docs/accessibility-audit.md',
        metadata: {
          type: 'accessibility-audit',
          score: accessibilityResults.score,
          timestamp: new Date().toISOString(),
        },
      },
    ];

    // Generate accessibility tests
    if (accessibilityResults.testCases.length > 0) {
      artifacts.push({
        id: `a11y-tests-${Date.now()}`,
        type: 'test',
        name: 'accessibility.test.ts',
        content: this.generateAccessibilityTests(accessibilityResults.testCases),
        path: 'tests/accessibility/accessibility.test.ts',
        metadata: {
          type: 'accessibility-tests',
          testCount: accessibilityResults.testCases.length,
        },
      });
    }

    return {
      outputs: {
        accessibilityResults,
        score: accessibilityResults.score,
        violations: accessibilityResults.violations,
        recommendations: accessibilityResults.recommendations,
      },
      artifacts,
    };
  }

  /**
   * Setup E2E testing framework
   */
  private async setupE2ETests(framework: string = 'playwright', requirements: string[] = []): Promise<any> {
    this.log('debug', 'Setting up E2E tests', { framework });

    const prompt = this.createE2ESetupPrompt(framework, requirements);

    const result = await this.callModel(prompt, {
      maxTokens: 6144,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const e2eSetup = this.parseE2EResponse(result.response);

    const artifacts: Artifact[] = [
      {
        id: `e2e-config-${Date.now()}`,
        type: 'config',
        name: `${framework}.config.ts`,
        content: e2eSetup.config,
        path: `${framework}.config.ts`,
        metadata: {
          type: 'e2e-configuration',
          framework,
        },
      },
    ];

    // Generate example E2E tests
    for (const testFile of e2eSetup.exampleTests) {
      artifacts.push({
        id: `e2e-example-${testFile.name}-${Date.now()}`,
        type: 'test',
        name: testFile.filename,
        content: testFile.content,
        path: `tests/e2e/${testFile.filename}`,
        metadata: {
          type: 'e2e-test',
          framework,
          flow: testFile.name,
        },
      });
    }

    return {
      outputs: {
        e2eSetup,
        framework,
        configuration: e2eSetup.config,
        exampleTests: e2eSetup.exampleTests,
      },
      artifacts,
    };
  }

  /**
   * Create prompts for different QA operations
   */
  private createTestGenerationPrompt(testType: string, framework: string, codeToTest: string, requirements: string[], coverage: any): string {
    return `Generate comprehensive ${testType} tests using ${framework} for the following code:

CODE TO TEST:
${codeToTest}

REQUIREMENTS:
${requirements.map(r => `- ${r}`).join('\n')}

TARGET COVERAGE: ${coverage.target || 80}%

Generate tests that:
1. Cover all public methods and functions
2. Test edge cases and error conditions
3. Include positive and negative test scenarios
4. Mock external dependencies appropriately
5. Follow ${framework} best practices
6. Include descriptive test names and comments
7. Achieve the target coverage percentage

Return the complete test files with proper imports and setup.`;
  }

  private createQualityAnalysisPrompt(codeToTest: string, requirements: string[]): string {
    return `Analyze the code quality of the following code:

CODE:
${codeToTest}

REQUIREMENTS:
${requirements.map(r => `- ${r}`).join('\n')}

Analyze for:
1. Code maintainability and readability
2. Performance issues and optimizations
3. Security vulnerabilities
4. Best practice violations
5. Code duplication and complexity
6. Error handling adequacy
7. Type safety and documentation
8. Architectural concerns

Provide specific recommendations for improvements with examples.`;
  }

  private createSecurityScanPrompt(codeToTest: string, securityLevel: string): string {
    return `Perform a comprehensive security scan of the following code:

CODE:
${codeToTest}

SECURITY LEVEL: ${securityLevel}

Scan for:
1. Input validation vulnerabilities
2. Authentication and authorization issues
3. Data exposure and privacy concerns
4. Injection vulnerabilities (SQL, XSS, etc.)
5. Cryptographic weaknesses
6. Configuration security issues
7. Dependency vulnerabilities
8. Business logic flaws

Provide detailed findings with severity levels and remediation steps.`;
  }

  private createPerformanceTestPrompt(codeToTest: string, targets: any, framework: string): string {
    return `Create performance tests for the following code using ${framework}:

CODE:
${codeToTest}

PERFORMANCE TARGETS:
- Response Time: ${targets.responseTime || 'Not specified'}
- Throughput: ${targets.throughput || 'Not specified'}
- Error Rate: ${targets.errorRate || 'Not specified'}

Generate performance tests that:
1. Measure response times under various loads
2. Test throughput and concurrent user scenarios
3. Monitor resource usage (CPU, memory)
4. Identify performance bottlenecks
5. Validate against specified targets
6. Include load, stress, and spike testing

Return complete test suite with configuration.`;
  }

  private createAccessibilityAuditPrompt(codeToTest: string, requirements: string[]): string {
    return `Perform an accessibility audit of the following code:

CODE:
${codeToTest}

REQUIREMENTS:
${requirements.map(r => `- ${r}`).join('\n')}

Check for:
1. WCAG 2.1 compliance (A, AA, AAA)
2. Keyboard navigation support
3. Screen reader compatibility
4. Color contrast and visual accessibility
5. Form accessibility
6. ARIA labels and attributes
7. Focus management
8. Semantic HTML usage

Provide specific violations and remediation steps.`;
  }

  private createE2ESetupPrompt(framework: string, requirements: string[]): string {
    return `Set up end-to-end testing with ${framework}:

REQUIREMENTS:
${requirements.map(r => `- ${r}`).join('\n')}

Create a complete E2E testing setup that includes:
1. Framework configuration
2. Test environment setup
3. Page object patterns
4. Common utilities and helpers
5. Example test files for critical flows
6. CI/CD integration
7. Reporting and artifacts
8. Best practices documentation

Include examples for authentication, forms, navigation, and error scenarios.`;
  }

  /**
   * Parse AI responses
   */
  private parseTestResponse(response: string): any {
    return {
      files: [],
      utilities: '',
      totalTests: 0,
      estimatedCoverage: 0,
    };
  }

  private parseQualityResponse(response: string): any {
    return {
      overallScore: 0,
      issues: [],
      criticalIssues: [],
      recommendations: [],
    };
  }

  private parseSecurityResponse(response: string): any {
    return {
      vulnerabilities: [],
      recommendations: [],
      testCases: [],
      riskLevel: 'low',
    };
  }

  private parsePerformanceResponse(response: string): any {
    return {
      testCode: '',
      testCount: 0,
    };
  }

  private parseAccessibilityResponse(response: string): any {
    return {
      score: 0,
      violations: [],
      recommendations: [],
      testCases: [],
    };
  }

  private parseE2EResponse(response: string): any {
    return {
      config: '',
      exampleTests: [],
    };
  }

  /**
   * Generate configuration and utility files
   */
  private generateTestConfig(framework: string, coverage: any): string {
    return `// ${framework} configuration
export default {
  testMatch: ['**/*.test.{ts,tsx}'],
  coverage: {
    target: ${coverage.target || 80},
    exclude: ${JSON.stringify(coverage.exclude || [], null, 2)},
  },
};`;
  }

  private generatePerformanceConfig(framework: string, targets: any): string {
    return `// Performance testing configuration
export const performanceConfig = {
  framework: '${framework}',
  targets: ${JSON.stringify(targets, null, 2)},
};`;
  }

  /**
   * Generate reports
   */
  private generateQualityReport(analysis: any): string {
    return `# Code Quality Report

Generated: ${new Date().toISOString()}
Overall Score: ${analysis.overallScore}/100

## Issues Found

## Recommendations
`;
  }

  private generateSecurityReport(results: any): string {
    return `# Security Scan Report

Generated: ${new Date().toISOString()}
Risk Level: ${results.riskLevel}

## Vulnerabilities

## Recommendations
`;
  }

  private generateAccessibilityReport(results: any): string {
    return `# Accessibility Audit Report

Generated: ${new Date().toISOString()}
Score: ${results.score}/100

## Violations

## Recommendations
`;
  }

  /**
   * Generate test files
   */
  private generateQualityFixes(issues: any[]): string {
    return `// Automated quality fixes
// This script addresses critical quality issues

${issues.map(issue => `// Fix for: ${issue.description}`).join('\n')}
`;
  }

  private generateSecurityTests(testCases: any[]): string {
    return `// Security test cases
import { describe, it, expect } from 'vitest';

describe('Security Tests', () => {
  ${testCases.map(test => `
  it('${test.name}', async () => {
    // Test implementation for ${test.name}
  });`).join('\n')}
});`;
  }

  private generateAccessibilityTests(testCases: any[]): string {
    return `// Accessibility test cases
import { describe, it, expect } from 'vitest';

describe('Accessibility Tests', () => {
  ${testCases.map(test => `
  it('${test.name}', async () => {
    // Test implementation for ${test.name}
  });`).join('\n')}
});`;
  }
}