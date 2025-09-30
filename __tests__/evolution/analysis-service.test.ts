import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { CodeAnalysisService } from '@/services/evolution/analysis-service';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';
import * as fs from 'fs/promises';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

vi.mock('fs/promises');
vi.mock('glob', () => ({
  glob: vi.fn(),
}));

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;
const mockFs = vi.mocked(fs);

describe('CodeAnalysisService', () => {
  let analysisService: CodeAnalysisService;

  beforeEach(() => {
    analysisService = new CodeAnalysisService(mockPrisma);
    vi.clearAllMocks();
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('Performance Analysis', () => {
    it('should detect inefficient loops', async () => {
      const mockFiles = ['test.ts'];
      const mockContent = `
        for (let i = 0; i < array.length; i++) {
          doSomething(array[i]);
        }
      `;

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(mockFiles),
      }));

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-1',
        analysisType: 'performance',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.8,
        severity: 'medium',
        metadata: {},
        analyzedAt: new Date(),
      });

      const result = await (analysisService as any).analyzePerformance();

      expect(result.analysisType).toBe('performance');
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'performance_issue',
            description: expect.stringContaining('inefficient loop'),
          }),
        ])
      );
    });

    it('should detect synchronous database calls', async () => {
      const mockFiles = ['database.ts'];
      const mockContent = `
        const users = prisma.user.findMany();
      `;

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(mockFiles),
      }));

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-2',
        analysisType: 'performance',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.9,
        severity: 'high',
        metadata: {},
        analyzedAt: new Date(),
      });

      const result = await (analysisService as any).analyzePerformance();

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'performance_issue',
            description: expect.stringContaining('database call'),
            impact: 'high',
          }),
        ])
      );
    });

    it('should detect large bundle imports', async () => {
      const mockFiles = ['imports.ts'];
      const mockContent = `
        import _ from 'lodash';
        import moment from 'moment';
      `;

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(mockFiles),
      }));

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-3',
        analysisType: 'performance',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.85,
        severity: 'medium',
        metadata: {},
        analyzedAt: new Date(),
      });

      const result = await (analysisService as any).analyzePerformance();

      expect(result.findings).toHaveLength(2);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'performance_issue',
            description: expect.stringContaining('Large library import'),
            tags: expect.arrayContaining(['bundle']),
          }),
        ])
      );
    });
  });

  describe('Security Analysis', () => {
    it('should detect potential SQL injection', async () => {
      const mockFiles = ['vulnerable.ts'];
      const mockContent = `
        const result = prisma.$queryRaw\`SELECT * FROM users WHERE id = \${userId}\`;
      `;

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(mockFiles),
      }));

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-4',
        analysisType: 'security',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.95,
        severity: 'critical',
        metadata: {},
        analyzedAt: new Date(),
      });

      const result = await (analysisService as any).analyzeSecurity();

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'security_vulnerability',
            description: expect.stringContaining('SQL injection'),
            impact: 'critical',
          }),
        ])
      );
    });

    it('should detect hardcoded secrets', async () => {
      const mockFiles = ['secrets.ts'];
      const mockContent = `
        const password = "hardcoded123";
        const apiKey: "sk-1234567890";
      `;

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(mockFiles),
      }));

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-5',
        analysisType: 'security',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.9,
        severity: 'high',
        metadata: {},
        analyzedAt: new Date(),
      });

      const result = await (analysisService as any).analyzeSecurity();

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'security_vulnerability',
            description: expect.stringContaining('Hardcoded secret'),
            tags: expect.arrayContaining(['secrets']),
          }),
        ])
      );
    });

    it('should detect unsafe eval usage', async () => {
      const mockFiles = ['eval.ts'];
      const mockContent = `
        const result = eval(userInput);
        const fn = new Function('return ' + code);
      `;

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(mockFiles),
      }));

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-6',
        analysisType: 'security',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.98,
        severity: 'critical',
        metadata: {},
        analyzedAt: new Date(),
      });

      const result = await (analysisService as any).analyzeSecurity();

      expect(result.findings).toHaveLength(2);
      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'security_vulnerability',
            description: expect.stringContaining('eval usage'),
            impact: 'critical',
            fixable: false,
          }),
        ])
      );
    });
  });

  describe('Style Analysis', () => {
    it('should detect inconsistent naming conventions', async () => {
      const mockFiles = ['style.ts'];
      const mockContent = `
        function get_user_data() {}
        const user_name = "test";
      `;

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(mockFiles),
      }));

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-7',
        analysisType: 'style',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.99,
        severity: 'low',
        metadata: {},
        analyzedAt: new Date(),
      });

      const result = await (analysisService as any).analyzeStyle();

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'style_violation',
            description: expect.stringContaining('naming convention'),
            effort: 'trivial',
            fixable: true,
          }),
        ])
      );
    });
  });

  describe('Complexity Analysis', () => {
    it('should detect high cyclomatic complexity', async () => {
      const mockFiles = ['complex.ts'];
      const mockContent = `
        function complexFunction() {
          if (condition1) {
            if (condition2) {
              for (let i = 0; i < 10; i++) {
                if (condition3) {
                  while (condition4) {
                    switch (value) {
                      case 1:
                        if (condition5) {
                          // many nested conditions
                        }
                        break;
                    }
                  }
                }
              }
            }
          }
        }
      `;

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(mockFiles),
      }));

      mockFs.readFile.mockResolvedValue(mockContent);
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-8',
        analysisType: 'complexity',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.7,
        severity: 'medium',
        metadata: {},
        analyzedAt: new Date(),
      });

      const result = await (analysisService as any).analyzeComplexity();

      expect(result.findings).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'code_smell',
            description: expect.stringContaining('cyclomatic complexity'),
            tags: expect.arrayContaining(['complexity']),
          }),
        ])
      );
    });
  });

  describe('Suggestion Generation', () => {
    it('should generate performance optimization suggestions', async () => {
      const findings = [
        {
          id: 'finding-1',
          type: 'performance_issue' as const,
          file: 'test.ts',
          line: 1,
          description: 'Inefficient loop',
          impact: 'medium' as const,
          effort: 'easy' as const,
          tags: ['performance'],
          context: {
            beforeCode: 'for (let i = 0; i < array.length; i++)',
            surroundingCode: '',
          },
          references: [],
          fixable: true,
        },
      ];

      const suggestions = await (analysisService as any).generatePerformanceSuggestions(
        'test.ts',
        'test content',
        findings
      );

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toEqual(
        expect.objectContaining({
          type: 'optimize_query',
          priority: 'medium',
          automationLevel: 'assisted',
          estimatedImpact: expect.objectContaining({
            performance: 0.7,
          }),
        })
      );
    });

    it('should generate security fix suggestions', async () => {
      const findings = [
        {
          id: 'finding-2',
          type: 'security_vulnerability' as const,
          file: 'vulnerable.ts',
          line: 1,
          description: 'SQL injection vulnerability',
          impact: 'critical' as const,
          effort: 'easy' as const,
          tags: ['security'],
          context: {
            beforeCode: 'prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`',
            surroundingCode: '',
          },
          references: [],
          fixable: true,
        },
      ];

      const suggestions = await (analysisService as any).generateSecuritySuggestions(
        'vulnerable.ts',
        'vulnerable content',
        findings
      );

      expect(suggestions).toHaveLength(1);
      expect(suggestions[0]).toEqual(
        expect.objectContaining({
          type: 'security_fix',
          priority: 'critical',
          estimatedImpact: expect.objectContaining({
            security: 0.9,
          }),
        })
      );
    });
  });

  describe('Analysis Storage', () => {
    it('should store analysis results in database', async () => {
      const mockResult = {
        id: 'analysis-1',
        analyzedAt: new Date(),
        analysisType: 'performance' as const,
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.8,
        severity: 'medium' as const,
        metadata: {},
      };

      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'stored-analysis-1',
        analysisType: 'performance',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.8,
        severity: 'medium',
        metadata: {},
        analyzedAt: new Date(),
      });

      await (analysisService as any).storeAnalysisResult(mockResult);

      expect(mockPrisma.codeAnalysisResult.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          analysisType: 'performance',
          confidence: 0.8,
          severity: 'medium',
        }),
      });
    });

    it('should retrieve latest analysis results', async () => {
      const mockResults = [
        {
          id: 'analysis-1',
          analysisType: 'performance',
          analyzedAt: new Date(),
          findings: [],
          metrics: {},
          suggestions: [],
          confidence: 0.8,
          severity: 'medium',
          metadata: {},
        },
      ];

      mockPrisma.codeAnalysisResult.findMany.mockResolvedValue(mockResults);

      const results = await analysisService.getLatestAnalysisResults(5);

      expect(results).toEqual(mockResults);
      expect(mockPrisma.codeAnalysisResult.findMany).toHaveBeenCalledWith({
        orderBy: { analyzedAt: 'desc' },
        take: 5,
      });
    });
  });

  describe('Full Codebase Analysis', () => {
    it('should perform complete analysis and return all results', async () => {
      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue(['test1.ts', 'test2.ts']),
      }));

      mockFs.readFile.mockResolvedValue('test content');
      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'analysis-complete',
        analysisType: 'performance',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.8,
        severity: 'low',
        metadata: {},
        analyzedAt: new Date(),
      });

      const results = await analysisService.performFullCodebaseAnalysis();

      expect(results).toHaveLength(4); // performance, security, style, complexity
      expect(mockPrisma.codeAnalysisResult.create).toHaveBeenCalledTimes(4);
    });

    it('should handle analysis errors gracefully', async () => {
      vi.doMock('glob', () => ({
        glob: vi.fn().mockRejectedValue(new Error('File system error')),
      }));

      await expect(analysisService.performFullCodebaseAnalysis()).rejects.toThrow('File system error');
    });
  });

  describe('Background Analysis', () => {
    it('should start background analysis process', async () => {
      const setIntervalSpy = vi.spyOn(global, 'setInterval');

      vi.doMock('glob', () => ({
        glob: vi.fn().mockResolvedValue([]),
      }));

      mockPrisma.codeAnalysisResult.create.mockResolvedValue({
        id: 'background-analysis',
        analysisType: 'performance',
        findings: [],
        metrics: {},
        suggestions: [],
        confidence: 0.8,
        severity: 'low',
        metadata: {},
        analyzedAt: new Date(),
      });

      await analysisService.startBackgroundAnalysis();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        30 * 60 * 1000 // 30 minutes
      );

      setIntervalSpy.mockRestore();
    });
  });
});