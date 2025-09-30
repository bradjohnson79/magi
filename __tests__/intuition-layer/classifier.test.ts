/**
 * Project Classifier Tests
 *
 * Tests for the AI Matrix intuition layer project classification system.
 * Validates rule-based classification, LLM fallback, and confidence scoring.
 */

import { ProjectClassifier, ProjectCategory, ClassificationResult } from '../../services/orch/classifier';
import { prisma } from '../../lib/prisma';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    project: {
      update: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
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
          create: jest.fn(),
        },
      },
    })),
  };
});

describe('ProjectClassifier', () => {
  let classifier: ProjectClassifier;
  let mockOpenAI: any;

  beforeEach(() => {
    classifier = ProjectClassifier.getInstance();
    mockOpenAI = require('openai').OpenAI;
    jest.clearAllMocks();
  });

  describe('Rule-based Classification', () => {
    it('should classify e-commerce projects correctly', async () => {
      const intent = 'build an online store with payment processing and product catalog';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.category).toBe(ProjectCategory.E_COMMERCE);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.method).toBe('rule_based');
      expect(result.reasoning).toContain('e-commerce');
    });

    it('should classify AI chatbot projects correctly', async () => {
      const intent = 'create a conversational AI assistant with NLP capabilities';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.category).toBe(ProjectCategory.AI_CHATBOT);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.method).toBe('rule_based');
    });

    it('should classify mobile apps correctly', async () => {
      const intent = 'develop a React Native mobile application for iOS and Android';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.category).toBe(ProjectCategory.MOBILE_APP);
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.method).toBe('rule_based');
    });

    it('should classify CMS projects correctly', async () => {
      const intent = 'build a content management system with admin dashboard';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.category).toBe(ProjectCategory.CMS);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should classify API projects correctly', async () => {
      const intent = 'create a RESTful API with authentication and rate limiting';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.category).toBe(ProjectCategory.API_SERVICE);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('Confidence Scoring', () => {
    it('should return high confidence for clear matches', async () => {
      const intent = 'e-commerce store shopping cart payment stripe';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.confidence).toBeGreaterThan(0.8);
      expect(result.category).toBe(ProjectCategory.E_COMMERCE);
    });

    it('should return lower confidence for ambiguous intents', async () => {
      const intent = 'build a web application';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.confidence).toBeLessThan(0.7);
    });

    it('should handle multiple keyword matches correctly', async () => {
      const intent = 'social media platform with real-time chat and content sharing';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.category).toBe(ProjectCategory.SOCIAL_PLATFORM);
      expect(result.confidence).toBeGreaterThan(0.7);
    });
  });

  describe('LLM Fallback', () => {
    beforeEach(() => {
      // Mock OpenAI response for LLM fallback
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockResolvedValue({
              choices: [{
                message: {
                  content: JSON.stringify({
                    category: ProjectCategory.WEB_APP,
                    confidence: 0.85,
                    reasoning: 'This appears to be a web application based on the description',
                  }),
                },
              }],
              usage: {
                prompt_tokens: 150,
                completion_tokens: 50,
                total_tokens: 200,
              },
            }),
          },
        },
      }));
    });

    it('should fall back to LLM for low confidence classifications', async () => {
      const intent = 'unusual project that does not match any patterns';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.method).toBe('llm');
      expect(result.category).toBe(ProjectCategory.WEB_APP);
      expect(result.confidence).toBe(0.85);
    });

    it('should handle LLM API errors gracefully', async () => {
      // Mock LLM API error
      mockOpenAI.mockImplementation(() => ({
        chat: {
          completions: {
            create: jest.fn().mockRejectedValue(new Error('API Error')),
          },
        },
      }));

      const intent = 'ambiguous project description';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.category).toBe(ProjectCategory.WEB_APP); // Fallback to default
      expect(result.confidence).toBeLessThan(0.5);
      expect(result.reasoning).toContain('error');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty intent', async () => {
      const result = await classifier.classifyProjectIntent('');

      expect(result.category).toBe(ProjectCategory.WEB_APP);
      expect(result.confidence).toBeLessThan(0.3);
    });

    it('should handle very long intents', async () => {
      const longIntent = 'a'.repeat(10000);
      const result = await classifier.classifyProjectIntent(longIntent);

      expect(result).toBeDefined();
      expect(result.category).toBeDefined();
    });

    it('should handle special characters and unicode', async () => {
      const intent = 'créer une application e-commerce avec émojis 🛒💳';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result).toBeDefined();
      expect(result.category).toBeDefined();
    });
  });

  describe('Database Integration', () => {
    it('should store classification results', async () => {
      const projectId = 'test-project-123';
      const userId = 'test-user-456';
      const intent = 'build an e-commerce store';

      await classifier.classifyProjectIntent(intent, projectId, userId);

      expect(prisma.project.update).toHaveBeenCalledWith({
        where: { id: projectId },
        data: {
          category: ProjectCategory.E_COMMERCE,
        },
      });
    });

    it('should create audit logs', async () => {
      const projectId = 'test-project-123';
      const userId = 'test-user-456';
      const intent = 'build an e-commerce store';

      await classifier.classifyProjectIntent(intent, projectId, userId);

      expect(prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId,
          action: 'system.project_classified',
          resource: 'project',
          resourceId: projectId,
        }),
      });
    });
  });

  describe('Performance', () => {
    it('should classify common intents quickly', async () => {
      const start = Date.now();

      const intents = [
        'e-commerce store',
        'mobile app',
        'AI chatbot',
        'portfolio website',
        'blog platform',
      ];

      await Promise.all(
        intents.map(intent => classifier.classifyProjectIntent(intent))
      );

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    it('should handle concurrent classifications', async () => {
      const intent = 'build a social media platform';
      const promises = Array(10).fill(null).map(() =>
        classifier.classifyProjectIntent(intent)
      );

      const results = await Promise.all(promises);

      results.forEach(result => {
        expect(result.category).toBe(ProjectCategory.SOCIAL_PLATFORM);
        expect(result.confidence).toBeGreaterThan(0.7);
      });
    });
  });

  describe('Classification Categories', () => {
    const testCases = [
      { intent: 'blog with comments and admin panel', expected: ProjectCategory.BLOG_PLATFORM },
      { intent: 'project management tool with teams and tasks', expected: ProjectCategory.PROJECT_MANAGEMENT },
      { intent: 'real-time chat application', expected: ProjectCategory.MESSAGING_APP },
      { intent: 'learning management system for online courses', expected: ProjectCategory.LMS },
      { intent: 'inventory management system', expected: ProjectCategory.INVENTORY_SYSTEM },
      { intent: 'customer relationship management tool', expected: ProjectCategory.CRM },
      { intent: 'business intelligence dashboard', expected: ProjectCategory.BUSINESS_INTELLIGENCE },
      { intent: 'iot monitoring system', expected: ProjectCategory.IOT_PLATFORM },
      { intent: 'booking reservation system', expected: ProjectCategory.BOOKING_SYSTEM },
      { intent: 'forum discussion board', expected: ProjectCategory.FORUM },
    ];

    testCases.forEach(({ intent, expected }) => {
      it(`should classify "${intent}" as ${expected}`, async () => {
        const result = await classifier.classifyProjectIntent(intent);
        expect(result.category).toBe(expected);
        expect(result.confidence).toBeGreaterThan(0.5);
      });
    });
  });

  describe('Keyword Weighting', () => {
    it('should prioritize high-weight keywords', async () => {
      const intent = 'machine learning AI prediction model';
      const result = await classifier.classifyProjectIntent(intent);

      expect(result.category).toBe(ProjectCategory.ML_PLATFORM);
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should handle conflicting keywords appropriately', async () => {
      const intent = 'e-commerce blog with shopping features';
      const result = await classifier.classifyProjectIntent(intent);

      // Should classify as e-commerce since it has higher-weight keywords
      expect(result.category).toBe(ProjectCategory.E_COMMERCE);
    });
  });
});