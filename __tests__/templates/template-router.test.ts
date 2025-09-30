/**
 * Tests for Template Router System
 * Tests intelligent template selection, scoring, and user precedence
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { templateRouter } from '@/services/templates/router';
import { customTemplatesService } from '@/services/templates/custom';

// Mock dependencies
jest.mock('@/services/templates/custom');
jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn({})),
  addSpanAttributes: jest.fn(),
  SPAN_ATTRIBUTES: {
    USER_ID: 'user.id',
    OPERATION_TYPE: 'operation.type',
  },
}));

describe('TemplateRouter', () => {
  const mockUserId = 'user-123';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('template scoring algorithm', () => {
    test('should score exact category matches highest', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react', 'typescript'],
        context: {},
      };

      const templates = [
        {
          id: 'template-1',
          name: 'Frontend Template',
          category: 'Frontend',
          tags: ['react', 'typescript'],
          usageCount: 10,
          isPublic: true,
        },
        {
          id: 'template-2',
          name: 'Backend Template',
          category: 'Backend',
          tags: ['node', 'typescript'],
          usageCount: 20,
          isPublic: true,
        },
        {
          id: 'template-3',
          name: 'Full Stack Template',
          category: 'Full Stack',
          tags: ['react', 'node', 'typescript'],
          usageCount: 5,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false }) // User templates
        .mockResolvedValueOnce({ templates, total: 3, hasMore: false }); // System templates

      const result = await templateRouter.findBestTemplate(request);

      // Frontend template should score highest for web-app project
      expect(result?.template.id).toBe('template-1');
      expect(result?.score).toBeGreaterThan(0.8);
    });

    test('should score tag matches appropriately', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'api',
        requirements: ['node', 'express', 'mongodb'],
        context: {},
      };

      const templates = [
        {
          id: 'template-1',
          name: 'Node API Template',
          category: 'Backend',
          tags: ['node', 'express', 'mongodb'],
          usageCount: 15,
          isPublic: true,
        },
        {
          id: 'template-2',
          name: 'Basic Node Template',
          category: 'Backend',
          tags: ['node'],
          usageCount: 25,
          isPublic: true,
        },
        {
          id: 'template-3',
          name: 'Python API Template',
          category: 'Backend',
          tags: ['python', 'fastapi', 'mongodb'],
          usageCount: 10,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates, total: 3, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      // Template with all matching tags should score highest
      expect(result?.template.id).toBe('template-1');
      expect(result?.score).toBeGreaterThan(0.9);
    });

    test('should consider usage count in scoring', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {},
      };

      const templates = [
        {
          id: 'template-1',
          name: 'Popular React Template',
          category: 'Frontend',
          tags: ['react'],
          usageCount: 1000,
          isPublic: true,
        },
        {
          id: 'template-2',
          name: 'New React Template',
          category: 'Frontend',
          tags: ['react'],
          usageCount: 5,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates, total: 2, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      // Popular template should score higher
      expect(result?.template.id).toBe('template-1');
    });

    test('should handle partial tag matches', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react', 'typescript', 'tailwind', 'nextjs'],
        context: {},
      };

      const templates = [
        {
          id: 'template-1',
          name: 'React TypeScript Template',
          category: 'Frontend',
          tags: ['react', 'typescript'],
          usageCount: 20,
          isPublic: true,
        },
        {
          id: 'template-2',
          name: 'Next.js Template',
          category: 'Frontend',
          tags: ['nextjs', 'react', 'typescript', 'tailwind'],
          usageCount: 15,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates, total: 2, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      // Template with more matching tags should score higher
      expect(result?.template.id).toBe('template-2');
    });
  });

  describe('user template precedence', () => {
    test('should prioritize user templates over system templates', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {},
      };

      const userTemplates = [
        {
          id: 'user-template-1',
          name: 'My React Template',
          category: 'Frontend',
          tags: ['react'],
          usageCount: 2,
          userId: mockUserId,
          isPublic: false,
        },
      ];

      const systemTemplates = [
        {
          id: 'system-template-1',
          name: 'Popular React Template',
          category: 'Frontend',
          tags: ['react'],
          usageCount: 500,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: userTemplates, total: 1, hasMore: false })
        .mockResolvedValueOnce({ templates: systemTemplates, total: 1, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      expect(result?.template.id).toBe('user-template-1');
      expect(result?.template.source).toBe('user');
    });

    test('should fall back to system templates when user templates score poorly', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'api',
        requirements: ['node', 'express'],
        context: {},
      };

      const userTemplates = [
        {
          id: 'user-template-1',
          name: 'My Frontend Template',
          category: 'Frontend',
          tags: ['react', 'vue'],
          usageCount: 1,
          userId: mockUserId,
          isPublic: false,
        },
      ];

      const systemTemplates = [
        {
          id: 'system-template-1',
          name: 'Node API Template',
          category: 'Backend',
          tags: ['node', 'express'],
          usageCount: 100,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: userTemplates, total: 1, hasMore: false })
        .mockResolvedValueOnce({ templates: systemTemplates, total: 1, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      // System template should be chosen due to better match
      expect(result?.template.id).toBe('system-template-1');
      expect(result?.template.source).toBe('system');
    });

    test('should apply user preference boost correctly', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {},
      };

      const userTemplates = [
        {
          id: 'user-template-1',
          name: 'My Decent Template',
          category: 'General', // Not perfect category match
          tags: ['react'],
          usageCount: 1,
          userId: mockUserId,
          isPublic: false,
        },
      ];

      const systemTemplates = [
        {
          id: 'system-template-1',
          name: 'Perfect System Template',
          category: 'Frontend', // Perfect category match
          tags: ['react'],
          usageCount: 100,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: userTemplates, total: 1, hasMore: false })
        .mockResolvedValueOnce({ templates: systemTemplates, total: 1, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      // User template should win due to preference boost
      expect(result?.template.id).toBe('user-template-1');
    });
  });

  describe('learning-based recommendations', () => {
    test('should include learning insights in recommendations', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react', 'typescript'],
        context: {},
      };

      const templates = [
        {
          id: 'template-1',
          name: 'Basic React Template',
          category: 'Frontend',
          tags: ['react'],
          usageCount: 50,
          isPublic: true,
          manifest: {
            learningData: {
              sourceCorrections: [
                { correctionType: 'syntax', frequency: 10 },
                { correctionType: 'security', frequency: 5 },
              ],
              userFeedback: [{ rating: 4.5 }],
            },
          },
        },
        {
          id: 'template-2',
          name: 'TypeScript React Template',
          category: 'Frontend',
          tags: ['react', 'typescript'],
          usageCount: 30,
          isPublic: true,
          manifest: {
            learningData: {
              sourceCorrections: [
                { correctionType: 'style', frequency: 2 },
              ],
              userFeedback: [{ rating: 4.8 }],
            },
          },
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates, total: 2, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      expect(result).toEqual(
        expect.objectContaining({
          template: expect.objectContaining({
            id: 'template-2', // Better tag match + better learning data
          }),
          learningInsights: expect.objectContaining({
            averageRating: 4.8,
            totalCorrections: 2,
            qualityScore: expect.any(Number),
          }),
        })
      );
    });

    test('should provide alternative recommendations', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {},
      };

      const templates = [
        {
          id: 'template-1',
          name: 'React Template A',
          category: 'Frontend',
          tags: ['react'],
          usageCount: 100,
          isPublic: true,
        },
        {
          id: 'template-2',
          name: 'React Template B',
          category: 'Frontend',
          tags: ['react', 'typescript'],
          usageCount: 80,
          isPublic: true,
        },
        {
          id: 'template-3',
          name: 'React Template C',
          category: 'Frontend',
          tags: ['react', 'tailwind'],
          usageCount: 60,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates, total: 3, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      expect(result?.alternatives).toHaveLength(2);
      expect(result?.alternatives?.[0]).toEqual(
        expect.objectContaining({
          template: expect.objectContaining({
            id: expect.stringMatching(/template-[23]/),
          }),
          score: expect.any(Number),
          reason: expect.any(String),
        })
      );
    });
  });

  describe('context-aware routing', () => {
    test('should consider project context in routing decisions', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {
          teamSize: 'large',
          deadline: 'urgent',
          complexity: 'high',
        },
      };

      const templates = [
        {
          id: 'template-1',
          name: 'Simple React Template',
          category: 'Frontend',
          tags: ['react', 'simple'],
          usageCount: 100,
          isPublic: true,
          metadata: {
            complexity: 'low',
            setupTime: 'fast',
          },
        },
        {
          id: 'template-2',
          name: 'Enterprise React Template',
          category: 'Frontend',
          tags: ['react', 'enterprise', 'scalable'],
          usageCount: 50,
          isPublic: true,
          metadata: {
            complexity: 'high',
            setupTime: 'slow',
            teamSize: 'large',
          },
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates, total: 2, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      // Enterprise template should be chosen for large team context
      expect(result?.template.id).toBe('template-2');
      expect(result?.contextMatch?.teamSize).toBe('match');
    });

    test('should handle missing context gracefully', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {}, // Empty context
      };

      const templates = [
        {
          id: 'template-1',
          name: 'React Template',
          category: 'Frontend',
          tags: ['react'],
          usageCount: 50,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates, total: 1, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      expect(result?.template.id).toBe('template-1');
      expect(result?.contextMatch).toEqual({});
    });
  });

  describe('error handling and edge cases', () => {
    test('should handle no matching templates', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'quantum-computing',
        requirements: ['quantum-circuits'],
        context: {},
      };

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      expect(result).toBeNull();
    });

    test('should handle templates with invalid data', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {},
      };

      const templates = [
        {
          id: 'template-1',
          name: 'Valid Template',
          category: 'Frontend',
          tags: ['react'],
          usageCount: 10,
          isPublic: true,
        },
        {
          id: 'template-2',
          name: 'Invalid Template',
          // Missing required fields
          usageCount: 20,
          isPublic: true,
        },
      ];

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates, total: 2, hasMore: false });

      const result = await templateRouter.findBestTemplate(request);

      // Should return valid template and ignore invalid one
      expect(result?.template.id).toBe('template-1');
    });

    test('should handle service errors gracefully', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {},
      };

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockRejectedValueOnce(new Error('Database connection failed'));

      const result = await templateRouter.findBestTemplate(request);

      expect(result).toBeNull();
    });
  });

  describe('performance and caching', () => {
    test('should limit template search results for performance', async () => {
      const request = {
        userId: mockUserId,
        projectType: 'web-app',
        requirements: ['react'],
        context: {},
      };

      (customTemplatesService.listTemplates as jest.Mock)
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false })
        .mockResolvedValueOnce({ templates: [], total: 0, hasMore: false });

      await templateRouter.findBestTemplate(request);

      // Should limit results for performance
      expect(customTemplatesService.listTemplates).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50, // Performance limit
        })
      );
    });
  });
});