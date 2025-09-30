/**
 * UI Hints System Tests
 *
 * Tests smart UI hints generation based on project classification and context
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { uiHintsService } from '@/services/ui/hints';
import { ProjectCategory } from '@/services/orch/classifier';
import { prisma } from '@/lib/db';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    project: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    workspaceMember: {
      count: vi.fn(),
    },
  },
}));

// Mock workspace manager
vi.mock('@/services/workspace/manager', () => ({
  workspaceManager: {
    checkAccess: vi.fn(),
  },
}));

// Mock project classifier
vi.mock('@/services/orch/classifier', () => ({
  projectClassifier: {
    classifyProjectIntent: vi.fn(),
    storeClassificationResult: vi.fn(),
  },
  ProjectCategory: {
    WEB_APP: 'web_app',
    E_COMMERCE: 'e_commerce',
    API_SERVICE: 'api_service',
    MOBILE_APP: 'mobile_app',
    ML_MODEL: 'ml_model',
    UNKNOWN: 'unknown',
  },
}));

describe('UI Hints System', () => {
  const mockProject = {
    id: 'project-1',
    workspaceId: 'workspace-1',
    name: 'Test Project',
    description: 'A React web application for e-commerce',
    category: ProjectCategory.E_COMMERCE,
    workspace: {
      id: 'workspace-1',
      name: 'Test Workspace',
    },
  };

  const mockContext = {
    projectId: 'project-1',
    userId: 'user-1',
    currentFile: '/src/components/ProductCard.tsx',
    projectStage: 'development' as const,
    recentActivity: ['file_edited', 'comment_added'],
    stackInfo: {
      frameworks: ['React', 'Next.js'],
      languages: ['TypeScript'],
      dependencies: ['stripe', 'tailwindcss'],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock project access
    (prisma.project.findUnique as any).mockResolvedValue(mockProject);

    // Mock workspace access
    const { workspaceManager } = require('@/services/workspace/manager');
    workspaceManager.checkAccess.mockResolvedValue(true);

    // Mock workspace member count
    (prisma.workspaceMember.count as any).mockResolvedValue(3);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Project-Specific Hints', () => {
    it('should generate e-commerce specific hints', async () => {
      const hints = await uiHintsService.getProjectHints(mockContext);

      // Should contain e-commerce security hint
      const securityHint = hints.find(h => h.id === 'ecommerce-security');
      expect(securityHint).toBeDefined();
      expect(securityHint?.type).toBe('warning');
      expect(securityHint?.title).toBe('Security Best Practices');
      expect(securityHint?.priority).toBe('high');
      expect(securityHint?.dismissible).toBe(false);
    });

    it('should generate web app performance hints', async () => {
      const webAppProject = {
        ...mockProject,
        category: ProjectCategory.WEB_APP,
      };

      (prisma.project.findUnique as any).mockResolvedValue(webAppProject);

      const hints = await uiHintsService.getProjectHints(mockContext);

      const performanceHint = hints.find(h => h.id === 'web-app-performance');
      expect(performanceHint).toBeDefined();
      expect(performanceHint?.title).toBe('Optimize Web Performance');
      expect(performanceHint?.action?.label).toBe('Add Performance Monitoring');
    });

    it('should generate API service documentation hints', async () => {
      const apiProject = {
        ...mockProject,
        category: ProjectCategory.API_SERVICE,
      };

      (prisma.project.findUnique as any).mockResolvedValue(apiProject);

      const hints = await uiHintsService.getProjectHints(mockContext);

      const docHint = hints.find(h => h.id === 'api-documentation');
      expect(docHint).toBeDefined();
      expect(docHint?.title).toBe('API Documentation');
      expect(docHint?.action?.data?.template).toBe('openapi-docs');
    });

    it('should generate ML model specific hints', async () => {
      const mlProject = {
        ...mockProject,
        category: ProjectCategory.ML_MODEL,
      };

      (prisma.project.findUnique as any).mockResolvedValue(mlProject);

      const hints = await uiHintsService.getProjectHints(mockContext);

      const validationHint = hints.find(h => h.id === 'ml-data-validation');
      expect(validationHint).toBeDefined();
      expect(validationHint?.type).toBe('warning');
      expect(validationHint?.category).toBe('data-quality');
    });
  });

  describe('Stage-Specific Hints', () => {
    it('should show setup hints for new projects', async () => {
      const setupContext = {
        ...mockContext,
        projectStage: 'setup' as const,
      };

      const hints = await uiHintsService.getProjectHints(setupContext);

      const setupHint = hints.find(h => h.id === 'setup-environment');
      expect(setupHint).toBeDefined();
      expect(setupHint?.priority).toBe('high');
      expect(setupHint?.position).toBe('modal');
      expect(setupHint?.dismissible).toBe(false);
    });

    it('should show development tools hints during development', async () => {
      const devContext = {
        ...mockContext,
        projectStage: 'development' as const,
      };

      const hints = await uiHintsService.getProjectHints(devContext);

      const qualityHint = hints.find(h => h.id === 'code-quality');
      expect(qualityHint).toBeDefined();
      expect(qualityHint?.title).toBe('Code Quality Tools');
      expect(qualityHint?.action?.data?.template).toBe('quality-tools');
    });

    it('should show deployment checklist for deployment stage', async () => {
      const deployContext = {
        ...mockContext,
        projectStage: 'deployment' as const,
      };

      const hints = await uiHintsService.getProjectHints(deployContext);

      const deployHint = hints.find(h => h.id === 'deployment-checklist');
      expect(deployHint).toBeDefined();
      expect(deployHint?.type).toBe('warning');
      expect(deployHint?.priority).toBe('high');
      expect(deployHint?.position).toBe('header');
    });

    it('should show testing hints during testing stage', async () => {
      const testContext = {
        ...mockContext,
        projectStage: 'testing' as const,
      };

      const hints = await uiHintsService.getProjectHints(testContext);

      const testHint = hints.find(h => h.id === 'test-coverage');
      expect(testHint).toBeDefined();
      expect(testHint?.category).toBe('testing');
      expect(testHint?.position).toBe('footer');
    });
  });

  describe('File-Specific Hints', () => {
    it('should show React hints for TSX files', async () => {
      const reactContext = {
        ...mockContext,
        currentFile: '/src/components/Button.tsx',
      };

      const hints = await uiHintsService.getProjectHints(reactContext);

      const reactHint = hints.find(h => h.id === 'react-best-practices');
      expect(reactHint).toBeDefined();
      expect(reactHint?.conditions?.fileTypes).toContain('.tsx');
      expect(reactHint?.position).toBe('editor');
    });

    it('should show Python ML hints for Python files in ML projects', async () => {
      const mlProject = {
        ...mockProject,
        category: ProjectCategory.ML_MODEL,
      };

      (prisma.project.findUnique as any).mockResolvedValue(mlProject);

      const pythonContext = {
        ...mockContext,
        currentFile: '/src/model/train.py',
      };

      const hints = await uiHintsService.getProjectHints(pythonContext);

      const pythonHint = hints.find(h => h.id === 'python-ml-hints');
      expect(pythonHint).toBeDefined();
      expect(pythonHint?.title).toBe('ML Development Tips');
      expect(pythonHint?.category).toBe('code-quality');
    });

    it('should show SQL optimization hints for SQL files', async () => {
      const sqlContext = {
        ...mockContext,
        currentFile: '/database/migrations/001_create_users.sql',
      };

      const hints = await uiHintsService.getProjectHints(sqlContext);

      const sqlHint = hints.find(h => h.id === 'sql-optimization');
      expect(sqlHint).toBeDefined();
      expect(sqlHint?.conditions?.fileTypes).toContain('.sql');
    });
  });

  describe('Collaborative Hints', () => {
    it('should show collaboration hints for multi-member workspaces', async () => {
      (prisma.workspaceMember.count as any).mockResolvedValue(5); // Multiple members

      const hints = await uiHintsService.getProjectHints(mockContext);

      const collabHint = hints.find(h => h.id === 'collaboration-setup');
      expect(collabHint).toBeDefined();
      expect(collabHint?.title).toBe('Team Collaboration');
      expect(collabHint?.metadata.memberCount).toBe(5);
    });

    it('should not show collaboration hints for single-member workspaces', async () => {
      (prisma.workspaceMember.count as any).mockResolvedValue(1); // Single member

      const hints = await uiHintsService.getProjectHints(mockContext);

      const collabHint = hints.find(h => h.id === 'collaboration-setup');
      expect(collabHint).toBeUndefined();
    });
  });

  describe('Dynamic Classification', () => {
    it('should classify project and generate hints when no category exists', async () => {
      const unclassifiedProject = {
        ...mockProject,
        category: null,
        description: 'A mobile app for fitness tracking',
      };

      (prisma.project.findUnique as any).mockResolvedValue(unclassifiedProject);

      const { projectClassifier } = require('@/services/orch/classifier');
      projectClassifier.classifyProjectIntent.mockResolvedValue({
        category: ProjectCategory.MOBILE_APP,
        confidence: 0.85,
        method: 'llm',
        reasoning: 'Detected mobile app keywords',
        keywords: ['mobile', 'app', 'fitness'],
        alternatives: [],
      });

      const hints = await uiHintsService.getProjectHints(mockContext);

      expect(projectClassifier.classifyProjectIntent).toHaveBeenCalledWith(
        'A mobile app for fitness tracking',
        'project-1'
      );

      expect(projectClassifier.storeClassificationResult).toHaveBeenCalled();

      // Should contain mobile-specific hints
      const mobileHint = hints.find(h => h.id === 'mobile-responsive');
      expect(mobileHint).toBeDefined();
    });
  });

  describe('Hint Filtering and Prioritization', () => {
    it('should filter hints by conditions', async () => {
      const context = {
        ...mockContext,
        currentFile: '/src/styles.css', // Not a React file
        projectStage: 'development' as const,
      };

      const hints = await uiHintsService.getProjectHints(context);

      // React-specific hints should be filtered out for CSS files
      const reactHint = hints.find(h => h.id === 'react-best-practices');
      expect(reactHint).toBeUndefined();
    });

    it('should prioritize high priority hints first', async () => {
      const hints = await uiHintsService.getProjectHints(mockContext);

      const highPriorityHints = hints.filter(h => h.priority === 'high');
      const mediumPriorityHints = hints.filter(h => h.priority === 'medium');

      if (highPriorityHints.length > 0 && mediumPriorityHints.length > 0) {
        const firstHighIndex = hints.findIndex(h => h.priority === 'high');
        const firstMediumIndex = hints.findIndex(h => h.priority === 'medium');

        expect(firstHighIndex).toBeLessThan(firstMediumIndex);
      }
    });

    it('should limit the number of hints to avoid UI clutter', async () => {
      const hints = await uiHintsService.getProjectHints(mockContext);

      expect(hints.length).toBeLessThanOrEqual(8);
    });
  });

  describe('Hint Dismissal', () => {
    it('should dismiss hint and store preference', async () => {
      const existingProject = {
        ...mockProject,
        metadata: {},
      };

      (prisma.project.findUnique as any).mockResolvedValue(existingProject);
      (prisma.project.update as any).mockResolvedValue({
        ...existingProject,
        metadata: {
          dismissedHints: {
            'user-1': {
              'security-hint-1': new Date().toISOString(),
            },
          },
        },
      });

      await uiHintsService.dismissHint('security-hint-1', 'user-1', 'project-1');

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: 'project-1' },
        data: {
          metadata: {
            dismissedHints: {
              'user-1': {
                'security-hint-1': expect.any(String),
              },
            },
          },
        },
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle project not found gracefully', async () => {
      (prisma.project.findUnique as any).mockResolvedValue(null);

      await expect(uiHintsService.getProjectHints(mockContext))
        .rejects.toThrow('Project not found');
    });

    it('should handle access denied gracefully', async () => {
      const { workspaceManager } = require('@/services/workspace/manager');
      workspaceManager.checkAccess.mockRejectedValue(new Error('Access denied'));

      await expect(uiHintsService.getProjectHints(mockContext))
        .rejects.toThrow('Access denied');
    });

    it('should return empty hints array on classification failure', async () => {
      const { projectClassifier } = require('@/services/orch/classifier');
      projectClassifier.classifyProjectIntent.mockRejectedValue(new Error('Classification failed'));

      const unclassifiedProject = {
        ...mockProject,
        category: null,
      };

      (prisma.project.findUnique as any).mockResolvedValue(unclassifiedProject);

      const hints = await uiHintsService.getProjectHints(mockContext);

      // Should still return some hints even if classification fails
      expect(Array.isArray(hints)).toBe(true);
    });
  });

  describe('Performance Considerations', () => {
    it('should cache classification results', async () => {
      const project = {
        ...mockProject,
        category: ProjectCategory.WEB_APP, // Already classified
      };

      (prisma.project.findUnique as any).mockResolvedValue(project);

      const { projectClassifier } = require('@/services/orch/classifier');

      await uiHintsService.getProjectHints(mockContext);

      // Should not call classifier if category already exists
      expect(projectClassifier.classifyProjectIntent).not.toHaveBeenCalled();
    });

    it('should handle large context efficiently', async () => {
      const largeContext = {
        ...mockContext,
        recentActivity: new Array(1000).fill('activity'),
        stackInfo: {
          frameworks: new Array(50).fill('framework'),
          languages: new Array(20).fill('language'),
          dependencies: new Array(200).fill('dependency'),
        },
      };

      const startTime = Date.now();
      const hints = await uiHintsService.getProjectHints(largeContext);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
      expect(Array.isArray(hints)).toBe(true);
    });
  });
});