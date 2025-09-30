/**
 * Comprehensive tests for custom templates system
 * Tests template creation, learning, routing, and feedback integration
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { customTemplatesService } from '@/services/templates/custom';
import { templateRouter } from '@/services/templates/router';
import { templateFeedbackIntegration } from '@/services/templates/feedback-integration';
import { prisma } from '@/lib/prisma';

// Mock Prisma
jest.mock('@/lib/prisma', () => ({
  prisma: {
    customTemplate: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    project: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    projectCorrection: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    templateUpdateQueue: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

// Mock auth
jest.mock('@clerk/nextjs/server', () => ({
  getAuth: jest.fn(() => ({ userId: 'test-user-id' })),
}));

// Mock tracing
jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn({})),
  addSpanAttributes: jest.fn(),
  SPAN_ATTRIBUTES: {
    USER_ID: 'user.id',
    PROJECT_ID: 'project.id',
    OPERATION_TYPE: 'operation.type',
  },
}));

describe('Custom Templates System', () => {
  const mockUserId = 'test-user-id';
  const mockProjectId = 'test-project-id';
  const mockTemplateId = 'test-template-id';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('CustomTemplatesService', () => {
    describe('createTemplate', () => {
      test('should create a new custom template', async () => {
        const templateInput = {
          userId: mockUserId,
          name: 'Test Template',
          description: 'A test template',
          manifest: {
            version: '1.0.0',
            name: 'Test Template',
            files: {
              'index.js': 'console.log("Hello, world!");',
            },
            dependencies: {},
            variables: [],
          },
          category: 'Frontend',
          tags: ['react', 'javascript'],
          isPublic: false,
        };

        const mockTemplate = {
          id: mockTemplateId,
          ...templateInput,
          usageCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };

        (prisma.customTemplate.create as jest.Mock).mockResolvedValue(mockTemplate);

        const result = await customTemplatesService.createTemplate(templateInput);

        expect(prisma.customTemplate.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            userId: mockUserId,
            name: 'Test Template',
            description: 'A test template',
            category: 'Frontend',
            tags: ['react', 'javascript'],
            isPublic: false,
          }),
        });

        expect(result).toEqual(mockTemplate);
      });

      test('should validate required fields', async () => {
        const invalidInput = {
          userId: mockUserId,
          // Missing name and manifest
          description: 'Invalid template',
        };

        await expect(customTemplatesService.createTemplate(invalidInput as any))
          .rejects.toThrow('Template name is required');
      });
    });

    describe('getTemplate', () => {
      test('should retrieve template with access control', async () => {
        const mockTemplate = {
          id: mockTemplateId,
          userId: mockUserId,
          name: 'Test Template',
          isPublic: false,
          manifest: { version: '1.0.0' },
        };

        (prisma.customTemplate.findUnique as jest.Mock).mockResolvedValue(mockTemplate);

        const result = await customTemplatesService.getTemplate(mockTemplateId, mockUserId);

        expect(prisma.customTemplate.findUnique).toHaveBeenCalledWith({
          where: { id: mockTemplateId },
          include: expect.any(Object),
        });

        expect(result).toEqual(mockTemplate);
      });

      test('should deny access to private template for different user', async () => {
        const mockTemplate = {
          id: mockTemplateId,
          userId: 'different-user',
          name: 'Private Template',
          isPublic: false,
        };

        (prisma.customTemplate.findUnique as jest.Mock).mockResolvedValue(mockTemplate);

        await expect(customTemplatesService.getTemplate(mockTemplateId, mockUserId))
          .rejects.toThrow('Access denied');
      });
    });

    describe('learnFromCorrections', () => {
      test('should update template with learning data', async () => {
        const mockTemplate = {
          id: mockTemplateId,
          userId: mockUserId,
          manifest: {
            version: '1.0.0',
            learningData: {
              sourceCorrections: [],
              userFeedback: [],
              usagePatterns: {},
            },
          },
        };

        const learningInput = {
          templateId: mockTemplateId,
          corrections: [
            {
              filePath: 'index.js',
              originalContent: 'console.log("hello");',
              correctedContent: 'console.log("Hello, world!");',
              correctionType: 'style' as const,
              confidence: 0.9,
            },
          ],
          feedback: {
            rating: 4,
            comment: 'Good template',
          },
        };

        (prisma.customTemplate.findUnique as jest.Mock).mockResolvedValue(mockTemplate);
        (prisma.customTemplate.update as jest.Mock).mockResolvedValue({
          ...mockTemplate,
          manifest: {
            ...mockTemplate.manifest,
            learningData: {
              sourceCorrections: [
                {
                  originalContent: 'console.log("hello");',
                  correctedContent: 'console.log("Hello, world!");',
                  correctionType: 'style',
                  frequency: 1,
                },
              ],
              userFeedback: [
                {
                  rating: 4,
                  comment: 'Good template',
                  timestamp: expect.any(String),
                },
              ],
              usagePatterns: {},
            },
          },
        });

        const result = await customTemplatesService.learnFromCorrections(learningInput);

        expect(prisma.customTemplate.update).toHaveBeenCalledWith({
          where: { id: mockTemplateId },
          data: {
            manifest: expect.objectContaining({
              learningData: expect.objectContaining({
                sourceCorrections: expect.arrayContaining([
                  expect.objectContaining({
                    correctionType: 'style',
                    frequency: 1,
                  }),
                ]),
              }),
            }),
          },
        });

        expect(result.manifest.learningData.sourceCorrections).toHaveLength(1);
      });
    });
  });

  describe('TemplateRouter', () => {
    describe('findBestTemplate', () => {
      test('should prioritize user templates over system templates', async () => {
        const request = {
          userId: mockUserId,
          projectType: 'web-app',
          requirements: ['react', 'typescript'],
          context: {},
        };

        const mockUserTemplates = [
          {
            id: 'user-template-1',
            userId: mockUserId,
            name: 'User React Template',
            category: 'Frontend',
            tags: ['react', 'typescript'],
            usageCount: 5,
            isPublic: false,
          },
        ];

        const mockSystemTemplates = [
          {
            id: 'system-template-1',
            name: 'System React Template',
            category: 'Frontend',
            tags: ['react'],
            usageCount: 100,
            isPublic: true,
          },
        ];

        (customTemplatesService.listTemplates as jest.Mock)
          .mockResolvedValueOnce({ templates: mockUserTemplates, total: 1, hasMore: false })
          .mockResolvedValueOnce({ templates: mockSystemTemplates, total: 1, hasMore: false });

        const result = await templateRouter.findBestTemplate(request);

        expect(result).toEqual(
          expect.objectContaining({
            template: expect.objectContaining({
              id: 'user-template-1',
              source: 'user',
            }),
          })
        );
      });

      test('should calculate template scores correctly', async () => {
        const request = {
          userId: mockUserId,
          projectType: 'web-app',
          requirements: ['react', 'typescript', 'api'],
          context: {},
        };

        const mockTemplates = [
          {
            id: 'template-1',
            name: 'React Template',
            category: 'Frontend',
            tags: ['react', 'typescript'],
            usageCount: 10,
            isPublic: true,
          },
          {
            id: 'template-2',
            name: 'Full Stack Template',
            category: 'Full Stack',
            tags: ['react', 'typescript', 'api', 'database'],
            usageCount: 5,
            isPublic: true,
          },
        ];

        (customTemplatesService.listTemplates as jest.Mock)
          .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
          .mockResolvedValueOnce({ templates: mockTemplates, total: 2, hasMore: false });

        const result = await templateRouter.findBestTemplate(request);

        // Template 2 should score higher due to better requirement matching
        expect(result?.template.id).toBe('template-2');
        expect(result?.score).toBeGreaterThan(0.5);
      });
    });
  });

  describe('TemplateFeedbackIntegration', () => {
    describe('recordProjectCorrection', () => {
      test('should record correction and trigger learning evaluation', async () => {
        const correction = {
          projectId: mockProjectId,
          userId: mockUserId,
          filePath: 'components/Button.tsx',
          originalContent: '<button>Click me</button>',
          correctedContent: '<button type="button">Click me</button>',
          correctionType: 'security' as const,
          confidence: 0.95,
          description: 'Added explicit button type for security',
        };

        (prisma.projectCorrection.create as jest.Mock).mockResolvedValue({
          id: 'correction-id',
          ...correction,
        });

        (customTemplatesService.listTemplates as jest.Mock).mockResolvedValue({
          templates: [],
          total: 0,
          hasMore: false,
        });

        await templateFeedbackIntegration.recordProjectCorrection(correction);

        expect(prisma.projectCorrection.create).toHaveBeenCalledWith({
          data: expect.objectContaining({
            projectId: mockProjectId,
            userId: mockUserId,
            correctionType: 'security',
            confidence: 0.95,
          }),
        });
      });
    });

    describe('processProjectCorrections', () => {
      test('should generate template candidates from corrections', async () => {
        const corrections = [
          {
            projectId: mockProjectId,
            userId: mockUserId,
            filePath: 'components/Button.tsx',
            originalContent: '<button>Click</button>',
            correctedContent: '<button type="button">Click</button>',
            correctionType: 'security' as const,
            confidence: 0.9,
          },
          {
            projectId: mockProjectId,
            userId: mockUserId,
            filePath: 'components/Form.tsx',
            originalContent: '<form>',
            correctedContent: '<form noValidate>',
            correctionType: 'security' as const,
            confidence: 0.8,
          },
          {
            projectId: mockProjectId,
            userId: mockUserId,
            filePath: 'utils/api.js',
            originalContent: 'fetch(url)',
            correctedContent: 'fetch(url, { credentials: "same-origin" })',
            correctionType: 'security' as const,
            confidence: 0.85,
          },
        ];

        const mockProject = {
          id: mockProjectId,
          name: 'Security-Enhanced App',
          category: 'web-app',
          metadata: { framework: 'react' },
        };

        (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);

        const result = await templateFeedbackIntegration.processProjectCorrections(corrections);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(
          expect.objectContaining({
            suggestedName: 'Security-Enhanced App Template',
            priority: 'high', // Security corrections = high priority
            confidence: expect.any(Number),
            corrections: corrections,
          })
        );
      });

      test('should auto-create high-confidence templates', async () => {
        const highConfidenceCorrections = [
          {
            projectId: mockProjectId,
            userId: mockUserId,
            filePath: 'index.ts',
            originalContent: 'any',
            correctedContent: 'string',
            correctionType: 'syntax' as const,
            confidence: 0.95,
          },
        ];

        const mockProject = {
          id: mockProjectId,
          name: 'TypeScript App',
          files: [
            {
              path: 'index.ts',
              content: 'const name: string = "test";',
            },
          ],
        };

        (prisma.project.findUnique as jest.Mock).mockResolvedValue(mockProject);
        (customTemplatesService.createTemplate as jest.Mock).mockResolvedValue({
          id: 'auto-created-template',
        });

        const result = await templateFeedbackIntegration.processProjectCorrections(
          highConfidenceCorrections
        );

        expect(customTemplatesService.createTemplate).toHaveBeenCalled();
        expect(result[0].confidence).toBeGreaterThan(0.9);
      });
    });

    describe('getLearningSuggestions', () => {
      test('should provide personalized learning suggestions', async () => {
        const mockCorrections = [
          {
            projectId: 'project-1',
            userId: mockUserId,
            filePath: 'components/Header.tsx',
            correctionType: 'style',
            confidence: 0.8,
            createdAt: new Date(),
          },
          {
            projectId: 'project-2',
            userId: mockUserId,
            filePath: 'pages/index.tsx',
            correctionType: 'optimization',
            confidence: 0.9,
            createdAt: new Date(),
          },
        ];

        (prisma.projectCorrection.findMany as jest.Mock).mockResolvedValue(mockCorrections);
        (templateFeedbackIntegration.processProjectCorrections as jest.Mock).mockResolvedValue([
          {
            suggestedName: 'Optimized React Template',
            priority: 'medium',
            confidence: 0.75,
          },
        ]);

        const result = await templateFeedbackIntegration.getLearningSuggestions(mockUserId, 5);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(
          expect.objectContaining({
            suggestedName: 'Optimized React Template',
            priority: 'medium',
          })
        );
      });
    });
  });

  describe('End-to-End Template Workflow', () => {
    test('should complete full template lifecycle', async () => {
      // 1. Create a template
      const templateInput = {
        userId: mockUserId,
        name: 'React Component Template',
        description: 'Template for React components',
        manifest: {
          version: '1.0.0',
          name: 'React Component Template',
          files: {
            'Component.tsx': `import React from 'react';

interface Props {
  title: string;
}

export const Component: React.FC<Props> = ({ title }) => {
  return <div>{title}</div>;
};`,
          },
          dependencies: {
            react: '^18.0.0',
            '@types/react': '^18.0.0',
          },
          variables: [
            {
              name: 'componentName',
              type: 'string',
              description: 'Name of the component',
              required: true,
            },
          ],
        },
        category: 'Frontend',
        tags: ['react', 'typescript', 'component'],
        isPublic: false,
      };

      const mockTemplate = {
        id: mockTemplateId,
        ...templateInput,
        usageCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      (prisma.customTemplate.create as jest.Mock).mockResolvedValue(mockTemplate);

      const createdTemplate = await customTemplatesService.createTemplate(templateInput);
      expect(createdTemplate.id).toBe(mockTemplateId);

      // 2. Use template in router
      const templateRequest = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react', 'typescript'],
        context: {},
      };

      (customTemplatesService.listTemplates as jest.Mock).mockResolvedValue({
        templates: [mockTemplate],
        total: 1,
        hasMore: false,
      });

      const routerResult = await templateRouter.findBestTemplate(templateRequest);
      expect(routerResult?.template.id).toBe(mockTemplateId);

      // 3. Record corrections and learn
      const correction = {
        projectId: mockProjectId,
        userId: mockUserId,
        filePath: 'Component.tsx',
        originalContent: 'export const Component',
        correctedContent: 'export const MyComponent',
        correctionType: 'style' as const,
        confidence: 0.8,
      };

      (prisma.projectCorrection.create as jest.Mock).mockResolvedValue(correction);
      await templateFeedbackIntegration.recordProjectCorrection(correction);

      // 4. Apply learning to template
      const learningInput = {
        templateId: mockTemplateId,
        corrections: [
          {
            filePath: 'Component.tsx',
            originalContent: 'export const Component',
            correctedContent: 'export const MyComponent',
            correctionType: 'style' as const,
            confidence: 0.8,
          },
        ],
      };

      (prisma.customTemplate.findUnique as jest.Mock).mockResolvedValue(mockTemplate);
      (prisma.customTemplate.update as jest.Mock).mockResolvedValue({
        ...mockTemplate,
        manifest: {
          ...mockTemplate.manifest,
          learningData: {
            sourceCorrections: [
              {
                originalContent: 'export const Component',
                correctedContent: 'export const MyComponent',
                correctionType: 'style',
                frequency: 1,
              },
            ],
            userFeedback: [],
            usagePatterns: {},
          },
        },
      });

      const learnedTemplate = await customTemplatesService.learnFromCorrections(learningInput);
      expect(learnedTemplate.manifest.learningData.sourceCorrections).toHaveLength(1);

      // Verify all components worked together
      expect(prisma.customTemplate.create).toHaveBeenCalled();
      expect(prisma.projectCorrection.create).toHaveBeenCalled();
      expect(prisma.customTemplate.update).toHaveBeenCalled();
    });
  });
});