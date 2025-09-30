/**
 * Intuition Layer Integration Tests
 *
 * End-to-end tests for the complete AI Matrix intuition layer.
 * Tests the integration between classifier, recommender, router, and feedback systems.
 */

import { ProjectClassifier, ProjectCategory } from '../../services/orch/classifier';
import { StackRecommender } from '../../services/orch/recommender';
import { OrchestrationRouter } from '../../services/orch/router';
import { FeedbackManager } from '../../services/orch/feedback';
import { adminSettingsService } from '../../services/admin/settings';
import { prisma } from '../../lib/prisma';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    project: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
    adminSetting: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
    modelRun: {
      findUnique: jest.fn(),
    },
    modelMetrics: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn(),
    },
    feedback: {
      create: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

jest.mock('../../services/secrets', () => ({
  secretsManager: {
    getSecret: jest.fn().mockResolvedValue('mock-openai-key'),
  },
}));

jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn().mockResolvedValue({
            choices: [{
              message: {
                content: JSON.stringify({
                  category: 'web_app',
                  confidence: 0.75,
                  reasoning: 'Appears to be a web application',
                }),
              },
            }],
            usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
          }),
        },
      },
    })),
  };
});

describe('Intuition Layer Integration', () => {
  const mockUserId = 'user-123';
  const mockProjectId = 'project-456';

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock user as admin for admin settings tests
    (prisma.user.findUnique as jest.Mock).mockResolvedValue({
      id: mockUserId,
      role: 'admin',
    });

    // Mock project lookup
    (prisma.project.findUnique as jest.Mock).mockResolvedValue({
      id: mockProjectId,
      category: ProjectCategory.WEB_APP,
    });

    // Mock model run for feedback
    (prisma.modelRun.findUnique as jest.Mock).mockResolvedValue({
      id: 'run-123',
      model: { id: 'classifier-v1' },
    });

    // Mock model metrics
    (prisma.modelMetrics.findUnique as jest.Mock).mockResolvedValue({
      correctionRate: 0.1,
      totalRuns: 100,
    });
  });

  describe('Complete Intent Processing Flow', () => {
    it('should process intent through the complete pipeline', async () => {
      // No admin overrides
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([]);

      const router = new OrchestrationRouter(mockUserId, mockProjectId);
      const intent = 'build an e-commerce store with payment processing';

      const taskGraph = await router.routeIntent(intent, {
        userId: mockUserId,
        projectId: mockProjectId,
        userPlan: 'pro',
        teamSize: 3,
      });

      // Should classify as e-commerce
      expect(taskGraph.metadata.projectCategory).toBe(ProjectCategory.E_COMMERCE);

      // Should recommend appropriate stack
      expect(taskGraph.metadata.recommendedStack).toBeDefined();
      expect(taskGraph.metadata.recommendedStack?.extras.payments).toBe('Stripe');

      // Should generate relevant tasks
      expect(taskGraph.tasks).toBeDefined();
      expect(taskGraph.tasks.length).toBeGreaterThan(0);

      // Should have reasonable confidence
      expect(taskGraph.metadata.classificationConfidence).toBeGreaterThan(0.7);
    });

    it('should handle LLM fallback in integration', async () => {
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([]);

      const router = new OrchestrationRouter(mockUserId, mockProjectId);
      const ambiguousIntent = 'create something innovative and unique';

      const taskGraph = await router.routeIntent(ambiguousIntent, {
        userId: mockUserId,
        projectId: mockProjectId,
      });

      // Should still produce a valid task graph
      expect(taskGraph).toBeDefined();
      expect(taskGraph.metadata.projectCategory).toBeDefined();
      expect(taskGraph.metadata.recommendedStack).toBeDefined();
    });
  });

  describe('Admin Override Integration', () => {
    beforeEach(() => {
      // Mock admin override
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'override-1',
          key: 'stack_override_e_commerce_custom',
          value: {
            database: {
              primary: 'MongoDB',
              alternatives: ['PostgreSQL'],
              reasoning: 'Admin override: NoSQL preferred',
            },
            frontend: {
              framework: 'Vue.js',
              alternatives: ['React'],
              language: 'TypeScript',
              styling: 'Vuetify',
              reasoning: 'Admin override: Vue.js stack',
            },
            auth: {
              provider: 'Auth0',
              alternatives: ['Firebase'],
              reasoning: 'Admin override: Auth0 integration',
            },
            hosting: {
              platform: 'DigitalOcean',
              alternatives: ['AWS'],
              reasoning: 'Admin override: DigitalOcean infrastructure',
            },
            extras: {
              payments: 'Square',
              reasoning: 'Admin override: Square payment integration',
            },
            complexity: 'moderate',
            timeEstimate: '6-8 weeks',
            confidence: 0.95,
            reasoning: 'Custom admin-configured e-commerce stack',
          },
          priority: 10,
          conditions: {},
          isActive: true,
        },
      ]);
    });

    it('should apply admin overrides in complete flow', async () => {
      const router = new OrchestrationRouter(mockUserId, mockProjectId);
      const intent = 'build an online store';

      const taskGraph = await router.routeIntent(intent, {
        userId: mockUserId,
        projectId: mockProjectId,
      });

      // Should use admin override stack
      const stack = taskGraph.metadata.recommendedStack;
      expect(stack?.database.primary).toBe('MongoDB');
      expect(stack?.frontend.framework).toBe('Vue.js');
      expect(stack?.auth.provider).toBe('Auth0');
      expect(stack?.hosting.platform).toBe('DigitalOcean');
      expect(stack?.extras.payments).toBe('Square');
    });

    it('should create and use admin overrides', async () => {
      // Create an admin override
      const stackRule = {
        category: ProjectCategory.API_SERVICE,
        name: 'microservices_stack',
        stack: {
          database: {
            primary: 'Redis',
            alternatives: ['PostgreSQL'],
            reasoning: 'Fast caching for microservices',
          },
          backend: {
            framework: 'Fastify',
            alternatives: ['Express.js'],
            language: 'TypeScript',
            reasoning: 'High-performance API framework',
          },
          auth: {
            provider: 'JWT',
            alternatives: ['OAuth'],
            reasoning: 'Stateless authentication',
          },
          hosting: {
            platform: 'Kubernetes',
            alternatives: ['Docker'],
            reasoning: 'Container orchestration',
          },
          extras: {
            monitoring: 'Prometheus',
            reasoning: 'Microservices monitoring',
          },
          complexity: 'complex',
          timeEstimate: '8-12 weeks',
          confidence: 0.9,
          reasoning: 'Optimized for microservices architecture',
        },
        priority: 5,
        conditions: {
          teamSize: { min: 5 },
        },
        createdBy: mockUserId,
      };

      await adminSettingsService.createStackRule(stackRule);

      expect(prisma.adminSetting.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          key: 'stack_override_api_service_microservices_stack',
          value: stackRule.stack,
          category: 'stack_rules',
          priority: 5,
        }),
      });
    });
  });

  describe('Feedback Loop Integration', () => {
    it('should record and process user corrections', async () => {
      const router = new OrchestrationRouter(mockUserId, mockProjectId);
      const feedbackManager = FeedbackManager.getInstance();

      // Original recommendation
      const recommender = StackRecommender.getInstance();
      const originalStack = await recommender.recommendStack(ProjectCategory.WEB_APP);

      // User correction
      const correctedStack = {
        database: {
          primary: 'MongoDB',
          alternatives: ['PostgreSQL'],
          reasoning: 'User prefers NoSQL',
        },
        frontend: {
          framework: 'React',
          alternatives: ['Next.js'],
          language: 'TypeScript',
          styling: 'Chakra UI',
          reasoning: 'Team expertise in React',
        },
      };

      // Record the correction
      await router.recordStackOverride(
        'run-123',
        originalStack,
        correctedStack,
        'Team prefers React and MongoDB'
      );

      // Should record feedback
      expect(prisma.feedback.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          modelRunId: 'run-123',
          userId: mockUserId,
          correction: expect.objectContaining({
            type: 'stack_correction',
            correctedStack,
          }),
        }),
      });

      // Should update model metrics
      expect(prisma.modelMetrics.update).toHaveBeenCalled();

      // Should create audit log
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'system.stack_correction_recorded',
        }),
      });
    });

    it('should handle category corrections', async () => {
      const router = new OrchestrationRouter(mockUserId, mockProjectId);

      await router.recordCategoryCorrection(
        ProjectCategory.WEB_APP,
        ProjectCategory.E_COMMERCE,
        0.9,
        'Actually has e-commerce features'
      );

      // Should update project category
      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: mockProjectId },
        data: {
          category: ProjectCategory.E_COMMERCE,
          metadata: expect.objectContaining({
            categoryCorrection: expect.objectContaining({
              originalCategory: ProjectCategory.WEB_APP,
              correctedCategory: ProjectCategory.E_COMMERCE,
            }),
          }),
        },
      });
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle classification errors gracefully', async () => {
      // Mock classification error
      const classifier = ProjectClassifier.getInstance();
      jest.spyOn(classifier, 'classifyProjectIntent').mockRejectedValue(new Error('Classification failed'));

      const router = new OrchestrationRouter(mockUserId, mockProjectId);
      const intent = 'build something';

      // Should not throw, should fallback gracefully
      const taskGraph = await router.routeIntent(intent, {
        userId: mockUserId,
        projectId: mockProjectId,
      });

      expect(taskGraph).toBeDefined();
      expect(taskGraph.tasks).toBeDefined();
    });

    it('should handle recommendation errors gracefully', async () => {
      // Mock recommendation error
      const recommender = StackRecommender.getInstance();
      jest.spyOn(recommender, 'recommendStack').mockRejectedValue(new Error('Recommendation failed'));

      const router = new OrchestrationRouter(mockUserId, mockProjectId);
      const intent = 'build an e-commerce store';

      // Should still produce task graph
      const taskGraph = await router.routeIntent(intent, {
        userId: mockUserId,
        projectId: mockProjectId,
      });

      expect(taskGraph).toBeDefined();
    });

    it('should handle database errors in feedback', async () => {
      (prisma.feedback.create as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const feedbackManager = FeedbackManager.getInstance();

      await expect(
        feedbackManager.recordStackCorrection(
          mockUserId,
          mockProjectId,
          'run-123',
          {
            originalCategory: ProjectCategory.WEB_APP,
            originalStack: {} as any,
            correctedStack: {},
            confidence: 0.9,
          }
        )
      ).rejects.toThrow('DB Error');
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle multiple concurrent requests', async () => {
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([]);

      const router = new OrchestrationRouter(mockUserId, mockProjectId);

      const intents = [
        'build an e-commerce store',
        'create a mobile app',
        'develop an API service',
        'make a blog platform',
        'build a CRM system',
      ];

      const start = Date.now();

      const promises = intents.map(intent =>
        router.routeIntent(intent, {
          userId: mockUserId,
          projectId: mockProjectId,
        })
      );

      const results = await Promise.all(promises);

      const duration = Date.now() - start;

      // Should complete within reasonable time
      expect(duration).toBeLessThan(5000);

      // All results should be valid
      results.forEach(taskGraph => {
        expect(taskGraph).toBeDefined();
        expect(taskGraph.metadata.projectCategory).toBeDefined();
        expect(taskGraph.metadata.recommendedStack).toBeDefined();
      });
    });

    it('should cache recommendations appropriately', async () => {
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([]);

      const recommender = StackRecommender.getInstance();

      // Multiple calls for same category should be efficient
      const results = await Promise.all([
        recommender.recommendStack(ProjectCategory.WEB_APP),
        recommender.recommendStack(ProjectCategory.WEB_APP),
        recommender.recommendStack(ProjectCategory.WEB_APP),
      ]);

      // Should return consistent results
      results.forEach(stack => {
        expect(stack.frontend.framework).toBe('Next.js');
        expect(stack.database.primary).toBe('PostgreSQL');
      });
    });
  });

  describe('Telemetry and Monitoring', () => {
    it('should log telemetry events throughout the pipeline', async () => {
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([]);

      const router = new OrchestrationRouter(mockUserId, mockProjectId);
      const intent = 'build an e-commerce store';

      await router.routeIntent(intent, {
        userId: mockUserId,
        projectId: mockProjectId,
      });

      // Should create telemetry events
      expect(prisma.telemetryEvent.create).toHaveBeenCalled();
    });

    it('should maintain audit trail for admin operations', async () => {
      const stackRule = {
        category: ProjectCategory.WEB_APP,
        name: 'custom_web_stack',
        stack: {} as any,
        createdBy: mockUserId,
      };

      await adminSettingsService.createStackRule(stackRule);

      // Should log admin operation
      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'admin.setting_created',
          userId: mockUserId,
        }),
      });
    });
  });
});