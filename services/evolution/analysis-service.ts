import { PrismaClient } from '@prisma/client';
import { trace } from '@opentelemetry/api';
import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';

const tracer = trace.getTracer('analysis-service');

export interface CodeAnalysisResult {
  id: string;
  analyzedAt: Date;
  analysisType: 'performance' | 'security' | 'style' | 'complexity' | 'maintainability';
  findings: CodeFinding[];
  metrics: CodeMetrics;
  suggestions: RefactorSuggestion[];
  confidence: number;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata: Record<string, any>;
}

export interface CodeFinding {
  id: string;
  type: 'performance_issue' | 'security_vulnerability' | 'style_violation' | 'code_smell' | 'duplication';
  file: string;
  line: number;
  column?: number;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  effort: 'trivial' | 'easy' | 'moderate' | 'hard' | 'expert';
  tags: string[];
  context: {
    beforeCode: string;
    afterCode?: string;
    surroundingCode: string;
  };
  references: string[];
  fixable: boolean;
}

export interface CodeMetrics {
  linesOfCode: number;
  cyclomaticComplexity: number;
  maintainabilityIndex: number;
  technicalDebt: number;
  testCoverage: number;
  duplicatedLines: number;
  securityScore: number;
  performanceScore: number;
  codeQualityScore: number;
}

export interface RefactorSuggestion {
  id: string;
  type: 'extract_method' | 'reduce_complexity' | 'optimize_query' | 'security_fix' | 'style_improvement';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  files: string[];
  estimatedImpact: {
    performance: number;
    security: number;
    maintainability: number;
    readability: number;
  };
  automationLevel: 'manual' | 'assisted' | 'automatic';
  implementation: {
    changes: FileChange[];
    tests: string[];
    rollbackPlan: string;
  };
  confidence: number;
  reasoning: string;
}

export interface FileChange {
  file: string;
  operation: 'create' | 'update' | 'delete' | 'rename';
  oldContent?: string;
  newContent?: string;
  oldPath?: string;
  newPath?: string;
}

export class CodeAnalysisService {
  private prisma: PrismaClient;
  private analysisQueue: Set<string> = new Set();

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async startBackgroundAnalysis(): Promise<void> {
    return tracer.startActiveSpan('startBackgroundAnalysis', async (span) => {
      try {
        span.addEvent('Starting continuous code analysis');

        setInterval(async () => {
          try {
            await this.performFullCodebaseAnalysis();
          } catch (error) {
            console.error('Background analysis error:', error);
            span.recordException(error as Error);
          }
        }, 30 * 60 * 1000); // Every 30 minutes

        await this.performFullCodebaseAnalysis();

        span.addEvent('Background analysis started');
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async performFullCodebaseAnalysis(): Promise<CodeAnalysisResult[]> {
    return tracer.startActiveSpan('performFullCodebaseAnalysis', async (span) => {
      try {
        const results: CodeAnalysisResult[] = [];

        const performanceAnalysis = await this.analyzePerformance();
        const securityAnalysis = await this.analyzeSecurity();
        const styleAnalysis = await this.analyzeStyle();
        const complexityAnalysis = await this.analyzeComplexity();

        results.push(performanceAnalysis, securityAnalysis, styleAnalysis, complexityAnalysis);

        for (const result of results) {
          await this.storeAnalysisResult(result);
        }

        span.setAttributes({
          analysisCount: results.length,
          totalFindings: results.reduce((sum, r) => sum + r.findings.length, 0),
          totalSuggestions: results.reduce((sum, r) => sum + r.suggestions.length, 0),
        });

        return results;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async analyzePerformance(): Promise<CodeAnalysisResult> {
    const files = await this.getCodeFiles();
    const findings: CodeFinding[] = [];
    const suggestions: RefactorSuggestion[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');

      // Analyze for performance issues
      const performanceIssues = await this.detectPerformanceIssues(file, content);
      findings.push(...performanceIssues);

      // Generate performance optimization suggestions
      const perfSuggestions = await this.generatePerformanceSuggestions(file, content, performanceIssues);
      suggestions.push(...perfSuggestions);
    }

    const metrics = await this.calculatePerformanceMetrics(files);

    return {
      id: `perf-${Date.now()}`,
      analyzedAt: new Date(),
      analysisType: 'performance',
      findings,
      metrics,
      suggestions,
      confidence: this.calculateConfidence(findings, suggestions),
      severity: this.determineSeverity(findings),
      metadata: {
        filesAnalyzed: files.length,
        analysisVersion: '1.0.0',
      },
    };
  }

  private async analyzeSecurity(): Promise<CodeAnalysisResult> {
    const files = await this.getCodeFiles();
    const findings: CodeFinding[] = [];
    const suggestions: RefactorSuggestion[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');

      // Analyze for security vulnerabilities
      const securityIssues = await this.detectSecurityVulnerabilities(file, content);
      findings.push(...securityIssues);

      // Generate security fix suggestions
      const secSuggestions = await this.generateSecuritySuggestions(file, content, securityIssues);
      suggestions.push(...secSuggestions);
    }

    const metrics = await this.calculateSecurityMetrics(files);

    return {
      id: `sec-${Date.now()}`,
      analyzedAt: new Date(),
      analysisType: 'security',
      findings,
      metrics,
      suggestions,
      confidence: this.calculateConfidence(findings, suggestions),
      severity: this.determineSeverity(findings),
      metadata: {
        filesAnalyzed: files.length,
        securityScanVersion: '2.1.0',
      },
    };
  }

  private async analyzeStyle(): Promise<CodeAnalysisResult> {
    const files = await this.getCodeFiles();
    const findings: CodeFinding[] = [];
    const suggestions: RefactorSuggestion[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');

      // Analyze for style violations
      const styleIssues = await this.detectStyleViolations(file, content);
      findings.push(...styleIssues);

      // Generate style improvement suggestions
      const styleSuggestions = await this.generateStyleSuggestions(file, content, styleIssues);
      suggestions.push(...styleSuggestions);
    }

    const metrics = await this.calculateStyleMetrics(files);

    return {
      id: `style-${Date.now()}`,
      analyzedAt: new Date(),
      analysisType: 'style',
      findings,
      metrics,
      suggestions,
      confidence: this.calculateConfidence(findings, suggestions),
      severity: this.determineSeverity(findings),
      metadata: {
        filesAnalyzed: files.length,
        eslintVersion: '8.0.0',
      },
    };
  }

  private async analyzeComplexity(): Promise<CodeAnalysisResult> {
    const files = await this.getCodeFiles();
    const findings: CodeFinding[] = [];
    const suggestions: RefactorSuggestion[] = [];

    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');

      // Analyze for complexity issues
      const complexityIssues = await this.detectComplexityIssues(file, content);
      findings.push(...complexityIssues);

      // Generate refactoring suggestions
      const refactorSuggestions = await this.generateComplexitySuggestions(file, content, complexityIssues);
      suggestions.push(...refactorSuggestions);
    }

    const metrics = await this.calculateComplexityMetrics(files);

    return {
      id: `complex-${Date.now()}`,
      analyzedAt: new Date(),
      analysisType: 'complexity',
      findings,
      metrics,
      suggestions,
      confidence: this.calculateConfidence(findings, suggestions),
      severity: this.determineSeverity(findings),
      metadata: {
        filesAnalyzed: files.length,
        complexityThreshold: 10,
      },
    };
  }

  private async getCodeFiles(): Promise<string[]> {
    const patterns = [
      'app/**/*.{ts,tsx,js,jsx}',
      'services/**/*.{ts,tsx,js,jsx}',
      'components/**/*.{ts,tsx,js,jsx}',
      'lib/**/*.{ts,tsx,js,jsx}',
      'plugins/**/*.{ts,tsx,js,jsx}',
    ];

    const files: string[] = [];
    for (const pattern of patterns) {
      const matches = await glob(pattern, { ignore: ['node_modules/**', '.next/**', 'dist/**'] });
      files.push(...matches);
    }

    return [...new Set(files)];
  }

  private async detectPerformanceIssues(file: string, content: string): Promise<CodeFinding[]> {
    const findings: CodeFinding[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Detect inefficient loops
      if (line.includes('for') && line.includes('length') && !line.includes('cached')) {
        findings.push({
          id: `perf-${file}-${index}`,
          type: 'performance_issue',
          file,
          line: index + 1,
          description: 'Potential inefficient loop: consider caching array length',
          impact: 'medium',
          effort: 'easy',
          tags: ['performance', 'loop', 'optimization'],
          context: {
            beforeCode: line,
            surroundingCode: lines.slice(Math.max(0, index - 2), index + 3).join('\n'),
          },
          references: ['https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Loops_and_iteration'],
          fixable: true,
        });
      }

      // Detect synchronous database calls
      if (line.includes('prisma') && !line.includes('await') && line.includes('.find')) {
        findings.push({
          id: `perf-db-${file}-${index}`,
          type: 'performance_issue',
          file,
          line: index + 1,
          description: 'Synchronous database call detected: use async/await',
          impact: 'high',
          effort: 'easy',
          tags: ['performance', 'database', 'async'],
          context: {
            beforeCode: line,
            surroundingCode: lines.slice(Math.max(0, index - 2), index + 3).join('\n'),
          },
          references: ['https://www.prisma.io/docs/concepts/components/prisma-client/async-await'],
          fixable: true,
        });
      }

      // Detect large bundle imports
      if (line.includes('import') && (line.includes('lodash') || line.includes('moment'))) {
        findings.push({
          id: `perf-bundle-${file}-${index}`,
          type: 'performance_issue',
          file,
          line: index + 1,
          description: 'Large library import: consider tree-shaking or alternatives',
          impact: 'medium',
          effort: 'moderate',
          tags: ['performance', 'bundle', 'import'],
          context: {
            beforeCode: line,
            surroundingCode: lines.slice(Math.max(0, index - 2), index + 3).join('\n'),
          },
          references: ['https://webpack.js.org/guides/tree-shaking/'],
          fixable: true,
        });
      }
    });

    return findings;
  }

  private async detectSecurityVulnerabilities(file: string, content: string): Promise<CodeFinding[]> {
    const findings: CodeFinding[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Detect potential SQL injection
      if (line.includes('prisma.$queryRaw') && line.includes('${')) {
        findings.push({
          id: `sec-sql-${file}-${index}`,
          type: 'security_vulnerability',
          file,
          line: index + 1,
          description: 'Potential SQL injection: use parameterized queries',
          impact: 'critical',
          effort: 'easy',
          tags: ['security', 'sql-injection', 'database'],
          context: {
            beforeCode: line,
            surroundingCode: lines.slice(Math.max(0, index - 2), index + 3).join('\n'),
          },
          references: ['https://www.prisma.io/docs/concepts/components/prisma-client/raw-database-access'],
          fixable: true,
        });
      }

      // Detect hardcoded secrets
      if (line.includes('password') && (line.includes('=') || line.includes(':'))) {
        const value = line.split(/[=:]/)[1]?.trim();
        if (value && !value.includes('process.env') && !value.includes('config')) {
          findings.push({
            id: `sec-secret-${file}-${index}`,
            type: 'security_vulnerability',
            file,
            line: index + 1,
            description: 'Hardcoded secret detected: use environment variables',
            impact: 'high',
            effort: 'easy',
            tags: ['security', 'secrets', 'environment'],
            context: {
              beforeCode: line.replace(value, '***'),
              surroundingCode: lines.slice(Math.max(0, index - 2), index + 3).join('\n'),
            },
            references: ['https://12factor.net/config'],
            fixable: true,
          });
        }
      }

      // Detect unsafe eval usage
      if (line.includes('eval(') || line.includes('Function(')) {
        findings.push({
          id: `sec-eval-${file}-${index}`,
          type: 'security_vulnerability',
          file,
          line: index + 1,
          description: 'Unsafe eval usage: potential code injection vulnerability',
          impact: 'critical',
          effort: 'moderate',
          tags: ['security', 'code-injection', 'eval'],
          context: {
            beforeCode: line,
            surroundingCode: lines.slice(Math.max(0, index - 2), index + 3).join('\n'),
          },
          references: ['https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/eval'],
          fixable: false,
        });
      }
    });

    return findings;
  }

  private async detectStyleViolations(file: string, content: string): Promise<CodeFinding[]> {
    const findings: CodeFinding[] = [];
    const lines = content.split('\n');

    lines.forEach((line, index) => {
      // Detect inconsistent naming
      if (line.includes('function') || line.includes('const') || line.includes('let')) {
        const varMatch = line.match(/(?:function|const|let)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/);
        if (varMatch) {
          const name = varMatch[1];
          if (name.includes('_') && name.toLowerCase() !== name) {
            findings.push({
              id: `style-naming-${file}-${index}`,
              type: 'style_violation',
              file,
              line: index + 1,
              description: 'Inconsistent naming convention: use camelCase',
              impact: 'low',
              effort: 'trivial',
              tags: ['style', 'naming', 'consistency'],
              context: {
                beforeCode: line,
                afterCode: line.replace(name, this.toCamelCase(name)),
                surroundingCode: lines.slice(Math.max(0, index - 1), index + 2).join('\n'),
              },
              references: ['https://google.github.io/styleguide/jsguide.html#naming'],
              fixable: true,
            });
          }
        }
      }

      // Detect missing semicolons
      if (line.trim() && !line.trim().endsWith(';') && !line.trim().endsWith('{') &&
          !line.trim().endsWith('}') && !line.includes('//') && !line.includes('/*')) {
        findings.push({
          id: `style-semicolon-${file}-${index}`,
          type: 'style_violation',
          file,
          line: index + 1,
          description: 'Missing semicolon',
          impact: 'low',
          effort: 'trivial',
          tags: ['style', 'semicolon', 'syntax'],
          context: {
            beforeCode: line,
            afterCode: line + ';',
            surroundingCode: lines.slice(Math.max(0, index - 1), index + 2).join('\n'),
          },
          references: ['https://standardjs.com/rules.html#semicolons'],
          fixable: true,
        });
      }
    });

    return findings;
  }

  private async detectComplexityIssues(file: string, content: string): Promise<CodeFinding[]> {
    const findings: CodeFinding[] = [];
    const lines = content.split('\n');

    // Detect high cyclomatic complexity
    let currentFunction = '';
    let branchingCount = 0;
    let functionStart = 0;

    lines.forEach((line, index) => {
      if (line.includes('function') || line.includes('=>')) {
        if (currentFunction && branchingCount > 10) {
          findings.push({
            id: `complex-cyclomatic-${file}-${functionStart}`,
            type: 'code_smell',
            file,
            line: functionStart + 1,
            description: `High cyclomatic complexity (${branchingCount}): consider refactoring`,
            impact: 'medium',
            effort: 'moderate',
            tags: ['complexity', 'maintainability', 'refactoring'],
            context: {
              beforeCode: lines[functionStart],
              surroundingCode: lines.slice(functionStart, Math.min(index, functionStart + 10)).join('\n'),
            },
            references: ['https://en.wikipedia.org/wiki/Cyclomatic_complexity'],
            fixable: false,
          });
        }

        currentFunction = line.trim();
        functionStart = index;
        branchingCount = 1;
      }

      if (line.includes('if') || line.includes('for') || line.includes('while') ||
          line.includes('switch') || line.includes('catch')) {
        branchingCount++;
      }
    });

    // Detect long functions
    const functionLines = this.extractFunctions(content);
    functionLines.forEach(func => {
      if (func.lineCount > 50) {
        findings.push({
          id: `complex-long-${file}-${func.startLine}`,
          type: 'code_smell',
          file,
          line: func.startLine,
          description: `Long function (${func.lineCount} lines): consider splitting`,
          impact: 'medium',
          effort: 'moderate',
          tags: ['complexity', 'function-length', 'maintainability'],
          context: {
            beforeCode: func.name,
            surroundingCode: lines.slice(func.startLine - 1, Math.min(func.startLine + 5, lines.length)).join('\n'),
          },
          references: ['https://refactoring.guru/smells/long-method'],
          fixable: false,
        });
      }
    });

    return findings;
  }

  private async generatePerformanceSuggestions(
    file: string,
    content: string,
    findings: CodeFinding[]
  ): Promise<RefactorSuggestion[]> {
    const suggestions: RefactorSuggestion[] = [];

    const performanceFindings = findings.filter(f => f.type === 'performance_issue');

    if (performanceFindings.length > 0) {
      suggestions.push({
        id: `perf-opt-${file}-${Date.now()}`,
        type: 'optimize_query',
        priority: 'medium',
        title: 'Optimize Performance Issues',
        description: `Fix ${performanceFindings.length} performance issues in ${file}`,
        files: [file],
        estimatedImpact: {
          performance: 0.7,
          security: 0.1,
          maintainability: 0.3,
          readability: 0.2,
        },
        automationLevel: 'assisted',
        implementation: {
          changes: performanceFindings.map(f => ({
            file: f.file,
            operation: 'update' as const,
            oldContent: f.context.beforeCode,
            newContent: f.context.afterCode || this.generatePerformanceFix(f),
          })),
          tests: [`__tests__/performance/${path.basename(file, path.extname(file))}.test.ts`],
          rollbackPlan: 'Revert file changes and run existing tests',
        },
        confidence: 0.8,
        reasoning: 'Performance optimizations based on common patterns and best practices',
      });
    }

    return suggestions;
  }

  private async generateSecuritySuggestions(
    file: string,
    content: string,
    findings: CodeFinding[]
  ): Promise<RefactorSuggestion[]> {
    const suggestions: RefactorSuggestion[] = [];

    const criticalFindings = findings.filter(f => f.impact === 'critical');

    if (criticalFindings.length > 0) {
      suggestions.push({
        id: `sec-fix-${file}-${Date.now()}`,
        type: 'security_fix',
        priority: 'critical',
        title: 'Fix Critical Security Vulnerabilities',
        description: `Address ${criticalFindings.length} critical security issues in ${file}`,
        files: [file],
        estimatedImpact: {
          performance: 0.1,
          security: 0.9,
          maintainability: 0.2,
          readability: 0.1,
        },
        automationLevel: 'assisted',
        implementation: {
          changes: criticalFindings.map(f => ({
            file: f.file,
            operation: 'update' as const,
            oldContent: f.context.beforeCode,
            newContent: this.generateSecurityFix(f),
          })),
          tests: [`__tests__/security/${path.basename(file, path.extname(file))}.test.ts`],
          rollbackPlan: 'Revert changes and conduct security review',
        },
        confidence: 0.95,
        reasoning: 'Critical security fixes to prevent potential vulnerabilities',
      });
    }

    return suggestions;
  }

  private async generateStyleSuggestions(
    file: string,
    content: string,
    findings: CodeFinding[]
  ): Promise<RefactorSuggestion[]> {
    const suggestions: RefactorSuggestion[] = [];

    const styleFindings = findings.filter(f => f.type === 'style_violation');

    if (styleFindings.length > 5) {
      suggestions.push({
        id: `style-fix-${file}-${Date.now()}`,
        type: 'style_improvement',
        priority: 'low',
        title: 'Fix Code Style Issues',
        description: `Address ${styleFindings.length} style violations in ${file}`,
        files: [file],
        estimatedImpact: {
          performance: 0.0,
          security: 0.0,
          maintainability: 0.4,
          readability: 0.8,
        },
        automationLevel: 'automatic',
        implementation: {
          changes: [{
            file,
            operation: 'update' as const,
            oldContent: content,
            newContent: this.applyStyleFixes(content, styleFindings),
          }],
          tests: [],
          rollbackPlan: 'Revert formatting changes',
        },
        confidence: 0.99,
        reasoning: 'Automated style fixes to improve code readability and consistency',
      });
    }

    return suggestions;
  }

  private async generateComplexitySuggestions(
    file: string,
    content: string,
    findings: CodeFinding[]
  ): Promise<RefactorSuggestion[]> {
    const suggestions: RefactorSuggestion[] = [];

    const complexityFindings = findings.filter(f => f.tags.includes('complexity'));

    if (complexityFindings.length > 0) {
      suggestions.push({
        id: `complex-refactor-${file}-${Date.now()}`,
        type: 'reduce_complexity',
        priority: 'medium',
        title: 'Reduce Code Complexity',
        description: `Refactor ${complexityFindings.length} complex functions in ${file}`,
        files: [file],
        estimatedImpact: {
          performance: 0.2,
          security: 0.1,
          maintainability: 0.8,
          readability: 0.7,
        },
        automationLevel: 'manual',
        implementation: {
          changes: [{
            file,
            operation: 'update' as const,
            oldContent: content,
            newContent: content, // Manual refactoring required
          }],
          tests: [`__tests__/refactor/${path.basename(file, path.extname(file))}.test.ts`],
          rollbackPlan: 'Comprehensive testing and gradual rollback if issues arise',
        },
        confidence: 0.6,
        reasoning: 'Complex functions should be broken down for better maintainability',
      });
    }

    return suggestions;
  }

  private async calculatePerformanceMetrics(files: string[]): Promise<CodeMetrics> {
    // Simplified metrics calculation
    return {
      linesOfCode: files.length * 50, // Approximation
      cyclomaticComplexity: 8.5,
      maintainabilityIndex: 75,
      technicalDebt: 2.5,
      testCoverage: 85,
      duplicatedLines: 120,
      securityScore: 92,
      performanceScore: 78,
      codeQualityScore: 82,
    };
  }

  private async calculateSecurityMetrics(files: string[]): Promise<CodeMetrics> {
    return {
      linesOfCode: files.length * 50,
      cyclomaticComplexity: 8.5,
      maintainabilityIndex: 75,
      technicalDebt: 2.5,
      testCoverage: 85,
      duplicatedLines: 120,
      securityScore: 88,
      performanceScore: 78,
      codeQualityScore: 82,
    };
  }

  private async calculateStyleMetrics(files: string[]): Promise<CodeMetrics> {
    return {
      linesOfCode: files.length * 50,
      cyclomaticComplexity: 8.5,
      maintainabilityIndex: 75,
      technicalDebt: 2.5,
      testCoverage: 85,
      duplicatedLines: 120,
      securityScore: 92,
      performanceScore: 78,
      codeQualityScore: 85,
    };
  }

  private async calculateComplexityMetrics(files: string[]): Promise<CodeMetrics> {
    return {
      linesOfCode: files.length * 50,
      cyclomaticComplexity: 12.2,
      maintainabilityIndex: 68,
      technicalDebt: 3.8,
      testCoverage: 85,
      duplicatedLines: 120,
      securityScore: 92,
      performanceScore: 78,
      codeQualityScore: 75,
    };
  }

  private calculateConfidence(findings: CodeFinding[], suggestions: RefactorSuggestion[]): number {
    const fixableFindings = findings.filter(f => f.fixable).length;
    const totalFindings = findings.length;
    const automatedSuggestions = suggestions.filter(s => s.automationLevel === 'automatic').length;
    const totalSuggestions = suggestions.length;

    if (totalFindings === 0) return 1.0;

    const fixableRatio = fixableFindings / totalFindings;
    const automationRatio = totalSuggestions > 0 ? automatedSuggestions / totalSuggestions : 0;

    return (fixableRatio * 0.6 + automationRatio * 0.4);
  }

  private determineSeverity(findings: CodeFinding[]): 'low' | 'medium' | 'high' | 'critical' {
    const criticalCount = findings.filter(f => f.impact === 'critical').length;
    const highCount = findings.filter(f => f.impact === 'high').length;

    if (criticalCount > 0) return 'critical';
    if (highCount > 2) return 'high';
    if (findings.length > 10) return 'medium';
    return 'low';
  }

  private toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  private extractFunctions(content: string): Array<{ name: string; startLine: number; lineCount: number }> {
    const lines = content.split('\n');
    const functions: Array<{ name: string; startLine: number; lineCount: number }> = [];

    let currentFunction: { name: string; startLine: number } | null = null;
    let braceCount = 0;

    lines.forEach((line, index) => {
      if (line.includes('function') || line.includes('=>')) {
        if (currentFunction && braceCount === 0) {
          functions.push({
            ...currentFunction,
            lineCount: index - currentFunction.startLine,
          });
        }

        currentFunction = {
          name: line.trim(),
          startLine: index + 1,
        };
        braceCount = 0;
      }

      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;

      if (currentFunction && braceCount === 0 && line.includes('}')) {
        functions.push({
          ...currentFunction,
          lineCount: index - currentFunction.startLine + 1,
        });
        currentFunction = null;
      }
    });

    return functions;
  }

  private generatePerformanceFix(finding: CodeFinding): string {
    if (finding.description.includes('loop')) {
      return finding.context.beforeCode.replace('for (let i = 0; i < array.length; i++)', 'for (let i = 0, len = array.length; i < len; i++)');
    }
    if (finding.description.includes('database')) {
      return 'await ' + finding.context.beforeCode;
    }
    return finding.context.beforeCode;
  }

  private generateSecurityFix(finding: CodeFinding): string {
    if (finding.description.includes('SQL injection')) {
      return finding.context.beforeCode.replace('$queryRaw`', '$queryRaw(Prisma.sql`');
    }
    if (finding.description.includes('secret')) {
      return finding.context.beforeCode.replace(/=.*/, '= process.env.SECRET_KEY');
    }
    return finding.context.beforeCode;
  }

  private applyStyleFixes(content: string, findings: CodeFinding[]): string {
    let fixedContent = content;

    findings.forEach(finding => {
      if (finding.context.afterCode) {
        fixedContent = fixedContent.replace(finding.context.beforeCode, finding.context.afterCode);
      }
    });

    return fixedContent;
  }

  private async storeAnalysisResult(result: CodeAnalysisResult): Promise<void> {
    await this.prisma.codeAnalysisResult.create({
      data: {
        analysisType: result.analysisType,
        findings: result.findings as any,
        metrics: result.metrics as any,
        suggestions: result.suggestions as any,
        confidence: result.confidence,
        severity: result.severity,
        metadata: result.metadata as any,
        analyzedAt: result.analyzedAt,
      },
    });
  }

  async getLatestAnalysisResults(limit: number = 10): Promise<CodeAnalysisResult[]> {
    const results = await this.prisma.codeAnalysisResult.findMany({
      orderBy: { analyzedAt: 'desc' },
      take: limit,
    });

    return results as CodeAnalysisResult[];
  }

  async getAnalysisHistory(analysisType?: string): Promise<CodeAnalysisResult[]> {
    const results = await this.prisma.codeAnalysisResult.findMany({
      where: analysisType ? { analysisType } : undefined,
      orderBy: { analyzedAt: 'desc' },
    });

    return results as CodeAnalysisResult[];
  }
}