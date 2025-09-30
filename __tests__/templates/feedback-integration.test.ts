/**
 * Tests for Template Feedback Integration System
 * Tests correction recording, learning suggestions, and template candidate generation
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { templateFeedbackIntegration } from '@/services/templates/feedback-integration';
import { customTemplatesService } from '@/services/templates/custom';
import { prisma } from '@/lib/prisma';

// Mock dependencies
jest.mock('@/lib/prisma');
jest.mock('@/services/templates/custom');
jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn({})),
  addSpanAttributes: jest.fn(),
  SPAN_ATTRIBUTES: {
    USER_ID: 'user.id',
    PROJECT_ID: 'project.id',
    OPERATION_TYPE: 'operation.type',
  },
}));

describe('TemplateFeedbackIntegration', () => {
  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('correction pattern analysis', () => {
    test('should identify security-focused correction patterns', async () => {
      const securityCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'components/Form.tsx',
          originalContent: '<form onSubmit={handleSubmit}>',
          correctedContent: '<form onSubmit={handleSubmit} noValidate>',
          correctionType: 'security' as const,
          confidence: 0.9,
        },
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'components/Button.tsx',
          originalContent: '<button onClick={onClick}>',
          correctedContent: '<button type="button" onClick={onClick}>',
          correctionType: 'security' as const,
          confidence: 0.95,
        },
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'utils/api.ts',
          originalContent: 'fetch(url)',
          correctedContent: 'fetch(url, { credentials: "same-origin" })',
          correctionType: 'security' as const,
          confidence: 0.85,
        },
      ];

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: mockProjectId,
        name: 'Secure Web App',
        category: 'web-app',
        metadata: { framework: 'react' },
      });

      const candidates = await templateFeedbackIntegration.processProjectCorrections(
        securityCorrections
      );

      expect(candidates).toHaveLength(1);
      expect(candidates[0]).toEqual(
        expect.objectContaining({
          priority: 'high', // Security corrections should be high priority
          category: 'Frontend',
          tags: expect.arrayContaining(['security']),
          corrections: securityCorrections,
        })
      );
    });

    test('should identify optimization patterns', async () => {
      const optimizationCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'components/List.tsx',
          originalContent: 'items.map(item => <Item key={item.id} item={item} />)',
          correctedContent: 'useMemo(() => items.map(item => <Item key={item.id} item={item} />), [items])',
          correctionType: 'optimization' as const,
          confidence: 0.8,
        },
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'hooks/useData.ts',
          originalContent: 'useEffect(() => { fetchData(); }, [])',
          correctedContent: 'useEffect(() => { fetchData(); }, [dependencies])',
          correctionType: 'optimization' as const,
          confidence: 0.9,
        },
      ];

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: mockProjectId,
        name: 'Performance App',
        category: 'web-app',
        metadata: { framework: 'react' },
      });

      const candidates = await templateFeedbackIntegration.processProjectCorrections(
        optimizationCorrections
      );

      expect(candidates[0]).toEqual(
        expect.objectContaining({
          priority: 'medium',
          tags: expect.arrayContaining(['performance']),
        })
      );
    });

    test('should handle mixed correction types', async () => {
      const mixedCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'index.ts',
          originalContent: 'let value: any = getValue();',
          correctedContent: 'const value: string = getValue();',
          correctionType: 'syntax' as const,
          confidence: 0.95,
        },
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'styles.css',
          originalContent: 'color: #000000;',
          correctedContent: 'color: var(--text-primary);',
          correctionType: 'style' as const,
          confidence: 0.7,
        },
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'auth.ts',
          originalContent: 'localStorage.setItem("token", token)',
          correctedContent: 'sessionStorage.setItem("token", token)',
          correctionType: 'security' as const,
          confidence: 0.9,
        },
      ];

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: mockProjectId,
        name: 'Mixed Improvements App',
        category: 'web-app',
      });

      const candidates = await templateFeedbackIntegration.processProjectCorrections(
        mixedCorrections
      );

      expect(candidates[0]).toEqual(
        expect.objectContaining({
          priority: 'high', // Security correction present
          corrections: mixedCorrections,
        })
      );
    });
  });

  describe('template relevance calculation', () => {
    test('should match templates by category and tags', async () => {
      const correction = {
        projectId: mockProjectId,
        userId: mockUserId,
        filePath: 'components/Button.tsx',
        originalContent: '<button>',
        correctedContent: '<button type="button">',
        correctionType: 'security' as const,
        confidence: 0.9,
      };

      const mockRelatedTemplates = [
        {
          id: 'template-1',
          category: 'Frontend',
          tags: ['react', 'security', 'components'],
          manifest: {
            files: {
              'Button.tsx': 'button component',
              'Form.tsx': 'form component',
            },
          },
        },
        {
          id: 'template-2',
          category: 'Backend',
          tags: ['api', 'node'],
          manifest: {
            files: {
              'server.js': 'server code',
            },
          },
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock).mockResolvedValue({
        templates: mockRelatedTemplates,
        total: 2,
        hasMore: false,
      });

      (customTemplatesService.learnFromCorrections as jest.Mock).mockResolvedValue({});

      await templateFeedbackIntegration.recordProjectCorrection(correction);

      expect(customTemplatesService.learnFromCorrections).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'template-1', // Should match the Frontend template
        })
      );
    });

    test('should consider file pattern similarity', async () => {
      const correction = {
        projectId: mockProjectId,
        userId: mockUserId,
        filePath: 'utils/validation.ts',
        originalContent: 'export function validate',
        correctedContent: 'export const validate',
        correctionType: 'style' as const,
        confidence: 0.8,
      };

      const mockTemplates = [
        {
          id: 'template-1',
          category: 'General',
          tags: ['utils'],
          manifest: {
            files: {
              'utils/helpers.ts': 'utility functions',
              'utils/validation.ts': 'validation functions',
            },
          },
        },
        {
          id: 'template-2',
          category: 'Frontend',
          tags: ['components'],
          manifest: {
            files: {
              'components/Button.tsx': 'button component',
            },
          },
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock).mockResolvedValue({
        templates: mockTemplates,
        total: 2,
        hasMore: false,
      });

      (customTemplatesService.learnFromCorrections as jest.Mock).mockResolvedValue({});

      await templateFeedbackIntegration.recordProjectCorrection(correction);

      expect(customTemplatesService.learnFromCorrections).toHaveBeenCalledWith(
        expect.objectContaining({
          templateId: 'template-1', // Should match the template with similar file patterns
        })
      );
    });
  });

  describe('learning suggestions prioritization', () => {
    test('should prioritize high-confidence security corrections', async () => {
      const mockCorrections = [
        {
          projectId: 'project-1',
          userId: mockUserId,
          filePath: 'auth.ts',
          originalContent: 'eval(userInput)',
          correctedContent: 'JSON.parse(userInput)',
          correctionType: 'security',
          confidence: 0.98,
          createdAt: new Date(),
        },
        {
          projectId: 'project-2',
          userId: mockUserId,
          filePath: 'styles.css',
          originalContent: 'margin: 10px',
          correctedContent: 'margin: 0.625rem',
          correctionType: 'style',
          confidence: 0.6,
          createdAt: new Date(),
        },
      ];

      (prisma.projectCorrection.findMany as jest.Mock).mockResolvedValue(mockCorrections);

      // Mock the process corrections to return appropriate priorities
      jest.spyOn(templateFeedbackIntegration, 'processProjectCorrections')
        .mockResolvedValue([
          {
            userId: mockUserId,
            projectId: 'project-1',
            suggestedName: 'Security-Hardened Template',
            description: 'Template with security improvements',
            priority: 'high',
            confidence: 0.98,
            corrections: [mockCorrections[0]],
            tags: ['security'],
          },
          {
            userId: mockUserId,
            projectId: 'project-2',
            suggestedName: 'Style-Enhanced Template',
            description: 'Template with style improvements',
            priority: 'low',
            confidence: 0.6,
            corrections: [mockCorrections[1]],
            tags: ['style'],
          },
        ]);

      const suggestions = await templateFeedbackIntegration.getLearningSuggestions(mockUserId, 10);

      expect(suggestions).toHaveLength(2);
      expect(suggestions[0]).toEqual(
        expect.objectContaining({
          priority: 'high',
          confidence: 0.98,
          suggestedName: 'Security-Hardened Template',
        })
      );
      expect(suggestions[1]).toEqual(
        expect.objectContaining({
          priority: 'low',
          confidence: 0.6,
        })
      );
    });

    test('should filter suggestions by minimum correction threshold', async () => {
      const fewCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'index.ts',
          originalContent: 'console.log',
          correctedContent: 'logger.info',
          correctionType: 'style',
          confidence: 0.8,
          createdAt: new Date(),
        },
      ];

      (prisma.projectCorrection.findMany as jest.Mock).mockResolvedValue(fewCorrections);

      const suggestions = await templateFeedbackIntegration.getLearningSuggestions(mockUserId, 10);

      // Should not generate suggestions with fewer than minimum corrections
      expect(suggestions).toHaveLength(0);
    });
  });

  describe('auto-template creation', () => {
    test('should auto-create templates for high-confidence corrections', async () => {
      const highConfidenceCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'types.ts',
          originalContent: 'interface User { name: any }',
          correctedContent: 'interface User { name: string }',
          correctionType: 'syntax' as const,
          confidence: 0.95,
        },
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'api.ts',
          originalContent: 'function getUser(): any',
          correctedContent: 'function getUser(): Promise<User>',
          correctionType: 'syntax' as const,
          confidence: 0.92,
        },
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'utils.ts',
          originalContent: 'export const helper = (x: any) => x',
          correctedContent: 'export const helper = <T>(x: T): T => x',
          correctionType: 'syntax' as const,
          confidence: 0.94,
        },
      ];

      const mockProject = {
        id: mockProjectId,
        name: 'TypeScript Fixes',
        files: [
          { path: 'types.ts', content: 'interface User { name: string }' },
          { path: 'api.ts', content: 'function getUser(): Promise<User> {}' },
          { path: 'utils.ts', content: 'export const helper = <T>(x: T): T => x' },
        ],
        metadata: { dependencies: { typescript: '^4.9.0' } },
      };

      (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);
      (customTemplatesService.createTemplate as jest.Mock).mockResolvedValue({
        id: 'auto-created-template-id',
        name: 'TypeScript Fixes Template',
      });

      const candidates = await templateFeedbackIntegration.processProjectCorrections(
        highConfidenceCorrections
      );

      // High confidence should trigger auto-creation
      expect(customTemplatesService.createTemplate).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: mockUserId,
          name: 'TypeScript Fixes Template',
          sourceProjectId: mockProjectId,
        })
      );

      expect(candidates[0].confidence).toBeGreaterThan(0.9);
    });

    test('should not auto-create templates for low-confidence corrections', async () => {
      const lowConfidenceCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'styles.css',
          originalContent: 'color: blue',
          correctedContent: 'color: #0066cc',
          correctionType: 'style' as const,
          confidence: 0.5,
        },
      ];

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: mockProjectId,
        name: 'Style Changes',
      });

      await templateFeedbackIntegration.processProjectCorrections(lowConfidenceCorrections);

      expect(customTemplatesService.createTemplate).not.toHaveBeenCalled();
    });
  });

  describe('correction queuing and batching', () => {
    test('should queue template updates for batch processing', async () => {
      const correction = {
        projectId: mockProjectId,
        userId: mockUserId,
        filePath: 'component.tsx',
        originalContent: 'useState()',
        correctedContent: 'useState<string>()',
        correctionType: 'syntax' as const,
        confidence: 0.85,
      };

      const mockTemplate = {
        id: 'existing-template',
        category: 'Frontend',
        tags: ['react', 'typescript'],
        manifest: { files: { 'component.tsx': 'existing content' } },
      };

      (prisma.projectCorrection.create as jest.Mock).mockResolvedValue(correction);
      (customTemplatesService.listTemplates as jest.Mock).mockResolvedValue({
        templates: [mockTemplate],
        total: 1,
        hasMore: false,
      });
      (prisma.templateUpdateQueue.create as jest.Mock).mockResolvedValue({
        id: 'queue-entry-id',
      });

      await templateFeedbackIntegration.recordProjectCorrection(correction);

      expect(prisma.templateUpdateQueue.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          templateId: 'existing-template',
          correctionData: expect.objectContaining({
            correctionType: 'syntax',
            confidence: 0.85,
          }),
          priority: 'medium',
        }),
      });
    });
  });

  describe('category and tag inference', () => {
    test('should infer category from file patterns', async () => {
      const frontendCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'components/Header.tsx',
          originalContent: 'export default Header',
          correctedContent: 'export { Header as default }',
          correctionType: 'style' as const,
          confidence: 0.8,
        },
      ];

      const backendCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'server/routes.js',
          originalContent: 'app.get',
          correctedContent: 'app.get',
          correctionType: 'style' as const,
          confidence: 0.8,
        },
      ];

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: mockProjectId,
        name: 'Test Project',
      });

      const frontendCandidates = await templateFeedbackIntegration.processProjectCorrections(
        frontendCorrections
      );
      const backendCandidates = await templateFeedbackIntegration.processProjectCorrections(
        backendCorrections
      );

      expect(frontendCandidates[0].category).toBe('Frontend');
      expect(backendCandidates[0].category).toBe('Backend');
    });

    test('should generate appropriate tags from corrections', async () => {
      const typeScriptCorrections = [
        {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'utils/helpers.ts',
          originalContent: 'function helper(x: any)',
          correctedContent: 'function helper<T>(x: T)',
          correctionType: 'syntax' as const,
          confidence: 0.9,
        },
      ];

      (prisma.project.findUnique as jest.Mock).mockResolvedValue({
        id: mockProjectId,
        name: 'TypeScript Project',
        metadata: { framework: 'react' },
      });

      const candidates = await templateFeedbackIntegration.processProjectCorrections(
        typeScriptCorrections
      );

      expect(candidates[0].tags).toEqual(
        expect.arrayContaining(['typescript', 'react'])
      );
    });
  });
});