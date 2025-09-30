/**
 * Feedback System Tests
 *
 * Tests for the AI Matrix intuition layer feedback and learning system.
 * Validates correction recording, metrics updates, and learning insights.
 */

import { FeedbackManager, StackCorrection } from '../../services/orch/feedback';
import { ProjectCategory } from '../../services/orch/classifier';
import { RecommendedStack } from '../../services/orch/recommender';
import { prisma } from '../../lib/prisma';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    feedback: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    modelRun: {
      findUnique: jest.fn(),
    },
    modelMetrics: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    project: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
  },
}));

describe('FeedbackManager', () => {
  let feedbackManager: FeedbackManager;
  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';
  const mockModelRunId = 'run-789';

  beforeEach(() => {
    feedbackManager = FeedbackManager.getInstance();
    jest.clearAllMocks();
  });

  describe('Stack Correction Recording', () => {
    const mockOriginalStack: RecommendedStack = {
      database: {
        primary: 'PostgreSQL',
        alternatives: ['MySQL'],
        reasoning: 'Scalable relational database',
      },
      auth: {
        provider: 'NextAuth.js',
        alternatives: ['Auth0'],
        reasoning: 'Integrated authentication',
      },
      frontend: {
        framework: 'Next.js',
        alternatives: ['React'],
        language: 'TypeScript',
        styling: 'Tailwind CSS',
        reasoning: 'Full-stack React framework',
      },
      hosting: {
        platform: 'Vercel',
        alternatives: ['Netlify'],
        reasoning: 'Optimized for Next.js',
      },
      extras: {
        reasoning: 'Standard web app stack',
      },
      complexity: 'moderate',
      timeEstimate: '4-6 weeks',
      confidence: 0.8,
      reasoning: 'Well-suited for web applications',
    };

    const mockCorrectedStack = {
      database: {
        primary: 'MongoDB',
        alternatives: ['PostgreSQL'],
        reasoning: 'Better for flexible schema',
      },
      frontend: {
        framework: 'React',
        alternatives: ['Next.js'],
        language: 'TypeScript',
        styling: 'Material-UI',
        reasoning: 'Team preference for React',
      },
    };

    beforeEach(() => {
      // Mock model run lookup
      (prisma.modelRun.findUnique as jest.Mock).mockResolvedValue({
        id: mockModelRunId,
        model: { id: 'classifier-v1' },
      });

      // Mock existing model metrics
      (prisma.modelMetrics.findUnique as jest.Mock).mockResolvedValue({
        correctionRate: 0.1,
        totalRuns: 100,
      });
    });

    it('should record stack corrections successfully', async () => {
      const correction: StackCorrection = {
        originalCategory: ProjectCategory.WEB_APP,
        originalStack: mockOriginalStack,
        correctedStack: mockCorrectedStack,
        reason: 'Team prefers React and MongoDB',
        confidence: 0.9,
      };

      await feedbackManager.recordStackCorrection(
        mockUserId,
        mockProjectId,
        mockModelRunId,
        correction
      );

      expect(prisma.feedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          modelRunId: mockModelRunId,
          userId: mockUserId,
          rating: expect.any(Number),
          comment: 'Team prefers React and MongoDB',
          correction: expect.objectContaining({
            type: 'stack_correction',
            originalCategory: ProjectCategory.WEB_APP,
            correctedStack: mockCorrectedStack,
          }),
        }),
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          action: 'system.stack_correction_recorded',
          resource: 'feedback',
        }),
      });
    });

    it('should calculate correction confidence correctly', async () => {
      const minorCorrection: StackCorrection = {
        originalCategory: ProjectCategory.WEB_APP,
        originalStack: mockOriginalStack,
        correctedStack: { database: { primary: 'MySQL' } },
        confidence: 0.8,
      };

      const majorCorrection: StackCorrection = {
        originalCategory: ProjectCategory.WEB_APP,
        originalStack: mockOriginalStack,
        correctedStack: {
          database: { primary: 'MySQL' },
          frontend: { framework: 'Vue.js' },
          auth: { provider: 'Auth0' },
          hosting: { platform: 'AWS' },
        },
        confidence: 0.2,
      };

      await feedbackManager.recordStackCorrection(
        mockUserId,
        mockProjectId,
        mockModelRunId,
        minorCorrection
      );

      await feedbackManager.recordStackCorrection(
        mockUserId,
        mockProjectId,
        mockModelRunId,
        majorCorrection
      );

      // Should calculate different ratings based on correction extent
      const calls = (prisma.feedback.create as jest.Mock).mock.calls;
      const minorRating = calls[0][0].data.rating;
      const majorRating = calls[1][0].data.rating;

      expect(minorRating).toBeGreaterThan(majorRating);
    });

    it('should update model metrics after correction', async () => {
      const correction: StackCorrection = {
        originalCategory: ProjectCategory.WEB_APP,
        originalStack: mockOriginalStack,
        correctedStack: mockCorrectedStack,
        confidence: 0.9,
      };

      await feedbackManager.recordStackCorrection(
        mockUserId,
        mockProjectId,
        mockModelRunId,
        correction
      );

      expect(prisma.modelMetrics.update).toHaveBeenCalledWith({
        where: {
          modelId_window: {
            modelId: 'classifier-v1',
            window: expect.any(String),
          },
        },
        data: expect.objectContaining({
          correctionRate: expect.any(Number),
          totalRuns: 101,
        }),
      });
    });
  });

  describe('Category Correction Recording', () => {
    it('should record category corrections', async () => {
      await feedbackManager.recordCategoryCorrection(
        mockUserId,
        mockProjectId,
        ProjectCategory.WEB_APP,
        ProjectCategory.E_COMMERCE,
        0.9,
        'Actually an e-commerce project'
      );

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: mockProjectId },
        data: {
          category: ProjectCategory.E_COMMERCE,
          metadata: expect.objectContaining({
            categoryCorrection: expect.objectContaining({
              originalCategory: ProjectCategory.WEB_APP,
              correctedBy: mockUserId,
              reason: 'Actually an e-commerce project',
            }),
          }),
        },
      });

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: mockUserId,
          action: 'user.project_category_corrected',
          resource: 'project',
        }),
      });
    });
  });

  describe('Feedback Metrics', () => {
    beforeEach(() => {
      (prisma.modelMetrics.findUnique as jest.Mock).mockResolvedValue({
        modelId: 'classifier-v1',
        window: '2024-01',
        totalRuns: 1000,
        correctionRate: 0.15,
        successRate: 0.85,
        avgConfidence: 0.82,
      });
    });

    it('should retrieve feedback metrics', async () => {
      const metrics = await feedbackManager.getFeedbackMetrics('classifier-v1', '2024-01');

      expect(metrics).toEqual({
        modelId: 'classifier-v1',
        window: '2024-01',
        totalRecommendations: 1000,
        userCorrections: 150,
        correctionRate: 0.15,
        categoryAccuracy: 0.85,
        stackAccuracy: 0.80,
        avgUserSatisfaction: 4.2,
      });
    });

    it('should return null for non-existent metrics', async () => {
      (prisma.modelMetrics.findUnique as jest.Mock).mockResolvedValue(null);

      const metrics = await feedbackManager.getFeedbackMetrics('non-existent-model');

      expect(metrics).toBeNull();
    });
  });

  describe('Learning Insights', () => {
    beforeEach(() => {
      // Mock feedback data for insights
      (prisma.feedback.findMany as jest.Mock).mockResolvedValue([
        {
          correction: {
            type: 'stack_correction',
            originalCategory: ProjectCategory.WEB_APP,
            correctedCategory: ProjectCategory.E_COMMERCE,
          },
          modelRun: {
            model: { id: 'classifier-v1' },
          },
        },
        {
          correction: {
            type: 'stack_correction',
            originalCategory: ProjectCategory.WEB_APP,
            correctedCategory: ProjectCategory.E_COMMERCE,
          },
          modelRun: {
            model: { id: 'classifier-v1' },
          },
        },
        {
          correction: {
            type: 'stack_correction',
            originalCategory: ProjectCategory.BLOG_PLATFORM,
            correctedCategory: ProjectCategory.CMS,
          },
          modelRun: {
            model: { id: 'classifier-v1' },
          },
        },
      ]);

      // Mock accuracy trends
      (prisma.modelMetrics.findMany as jest.Mock).mockResolvedValue([
        { window: '2024-01', correctionRate: 0.15, totalRuns: 1000 },
        { window: '2024-02', correctionRate: 0.12, totalRuns: 1200 },
        { window: '2024-03', correctionRate: 0.10, totalRuns: 1500 },
      ]);
    });

    it('should generate learning insights', async () => {
      const insights = await feedbackManager.getLearningInsights('2024-01');

      expect(insights).toEqual({
        commonCorrections: expect.arrayContaining([
          expect.objectContaining({
            originalCategory: ProjectCategory.WEB_APP,
            correctedCategory: ProjectCategory.E_COMMERCE,
            frequency: 2,
            pattern: 'web_app → e_commerce',
          }),
        ]),
        improvementSuggestions: expect.arrayContaining([
          expect.stringContaining('refining classification rules'),
        ]),
        accuracyTrends: expect.arrayContaining([
          expect.objectContaining({
            window: '2024-01',
            accuracy: 0.85,
            corrections: 150,
          }),
        ]),
      });
    });

    it('should identify common correction patterns', async () => {
      const insights = await feedbackManager.getLearningInsights();

      const webAppToEcommerce = insights.commonCorrections.find(
        c => c.originalCategory === ProjectCategory.WEB_APP &&
             c.correctedCategory === ProjectCategory.E_COMMERCE
      );

      expect(webAppToEcommerce).toBeDefined();
      expect(webAppToEcommerce?.frequency).toBe(2);
    });

    it('should generate improvement suggestions', async () => {
      const insights = await feedbackManager.getLearningInsights();

      expect(insights.improvementSuggestions).toContain(
        'Consider refining classification rules for web_app → e_commerce (2 corrections)'
      );
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (prisma.feedback.create as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const correction: StackCorrection = {
        originalCategory: ProjectCategory.WEB_APP,
        originalStack: {} as RecommendedStack,
        correctedStack: {},
        confidence: 0.9,
      };

      await expect(
        feedbackManager.recordStackCorrection(
          mockUserId,
          mockProjectId,
          mockModelRunId,
          correction
        )
      ).rejects.toThrow('DB Error');
    });

    it('should handle missing model run gracefully', async () => {
      (prisma.modelRun.findUnique as jest.Mock).mockResolvedValue(null);

      const correction: StackCorrection = {
        originalCategory: ProjectCategory.WEB_APP,
        originalStack: {} as RecommendedStack,
        correctedStack: {},
        confidence: 0.9,
      };

      await expect(
        feedbackManager.recordStackCorrection(
          mockUserId,
          mockProjectId,
          mockModelRunId,
          correction
        )
      ).rejects.toThrow('Model run or model not found');
    });
  });

  describe('Time Window Calculations', () => {
    it('should calculate current window correctly', async () => {
      const now = new Date('2024-03-15');
      jest.spyOn(Date, 'now').mockReturnValue(now.getTime());

      // Access private method for testing
      const getCurrentWindow = (feedbackManager as any).getCurrentWindow.bind(feedbackManager);
      const window = getCurrentWindow();

      expect(window).toBe('2024-03');
    });

    it('should calculate window start date correctly', async () => {
      // Access private method for testing
      const getWindowStartDate = (feedbackManager as any).getWindowStartDate.bind(feedbackManager);
      const startDate = getWindowStartDate('2024-03');

      expect(startDate).toEqual(new Date(2024, 2, 1)); // March 1, 2024
    });
  });

  describe('Performance', () => {
    it('should handle multiple concurrent corrections', async () => {
      const correction: StackCorrection = {
        originalCategory: ProjectCategory.WEB_APP,
        originalStack: {} as RecommendedStack,
        correctedStack: {},
        confidence: 0.9,
      };

      const promises = Array(10).fill(null).map((_, i) =>
        feedbackManager.recordStackCorrection(
          mockUserId,
          mockProjectId,
          `${mockModelRunId}-${i}`,
          correction
        )
      );

      await Promise.all(promises);

      expect(prisma.feedback.create).toHaveBeenCalledTimes(10);
    });

    it('should retrieve insights efficiently', async () => {
      const start = Date.now();

      await feedbackManager.getLearningInsights();

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });
  });
});