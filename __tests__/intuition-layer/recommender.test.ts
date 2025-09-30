/**
 * Stack Recommender Tests
 *
 * Tests for the AI Matrix intuition layer stack recommendation system.
 * Validates category mapping, user preferences, and admin overrides.
 */

import { StackRecommender, RecommendedStack } from '../../services/orch/recommender';
import { ProjectCategory } from '../../services/orch/classifier';
import { prisma } from '../../lib/prisma';

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  prisma: {
    adminSetting: {
      findMany: jest.fn(),
    },
    telemetryEvent: {
      create: jest.fn(),
    },
  },
}));

jest.mock('../../services/audit/logger', () => ({
  auditLogger: {
    log: jest.fn(),
  },
}));

describe('StackRecommender', () => {
  let recommender: StackRecommender;

  beforeEach(() => {
    recommender = StackRecommender.getInstance();
    jest.clearAllMocks();
  });

  describe('Category-based Recommendations', () => {
    it('should recommend appropriate stack for e-commerce projects', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.E_COMMERCE);

      expect(stack.database.primary).toBe('PostgreSQL');
      expect(stack.frontend.framework).toBe('Next.js');
      expect(stack.auth.provider).toBe('NextAuth.js');
      expect(stack.complexity).toBe('moderate');
      expect(stack.extras.payments).toBe('Stripe');
    });

    it('should recommend appropriate stack for mobile apps', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.MOBILE_APP);

      expect(stack.frontend.framework).toBe('React Native');
      expect(stack.database.primary).toBe('Firebase');
      expect(stack.hosting.platform).toBe('App Store / Google Play');
      expect(stack.complexity).toBe('moderate');
    });

    it('should recommend appropriate stack for AI/ML projects', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.ML_PLATFORM);

      expect(stack.backend?.framework).toBe('FastAPI');
      expect(stack.backend?.language).toBe('Python');
      expect(stack.database.primary).toBe('PostgreSQL');
      expect(stack.complexity).toBe('complex');
      expect(stack.extras.apis).toContain('OpenAI API');
    });

    it('should recommend appropriate stack for simple websites', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.PORTFOLIO);

      expect(stack.frontend.framework).toBe('Next.js');
      expect(stack.hosting.platform).toBe('Vercel');
      expect(stack.complexity).toBe('simple');
      expect(stack.backend).toBeUndefined();
    });

    it('should recommend appropriate stack for APIs', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.API_SERVICE);

      expect(stack.backend?.framework).toBe('Express.js');
      expect(stack.database.primary).toBe('PostgreSQL');
      expect(stack.auth.provider).toBe('JWT');
      expect(stack.complexity).toBe('moderate');
    });
  });

  describe('User Context Adaptation', () => {
    it('should adapt recommendations for team size', async () => {
      const context = {
        teamSize: 10,
        userPlan: 'enterprise',
      };

      const stack = await recommender.recommendStack(ProjectCategory.WEB_APP, context);

      expect(stack.extras.monitoring).toBeDefined();
      expect(stack.reasoning).toContain('team');
    });

    it('should adapt recommendations for user plan', async () => {
      const context = {
        userPlan: 'trial',
      };

      const stack = await recommender.recommendStack(ProjectCategory.E_COMMERCE, context);

      // Should suggest simpler alternatives for trial users
      expect(stack.database.primary).toBe('SQLite');
      expect(stack.reasoning).toContain('Trial plan');
    });

    it('should respect user preferences', async () => {
      const context = {
        preferences: {
          frontendFramework: 'React',
          database: 'MySQL',
          hosting: 'Netlify',
        },
      };

      const stack = await recommender.recommendStack(ProjectCategory.WEB_APP, context);

      expect(stack.frontend.framework).toBe('React');
      expect(stack.database.primary).toBe('MySQL');
      expect(stack.hosting.platform).toBe('Netlify');
      expect(stack.reasoning).toContain('User preference');
    });
  });

  describe('Admin Overrides', () => {
    beforeEach(() => {
      // Mock admin override
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'override-1',
          key: 'stack_override_web_app_custom',
          value: {
            database: {
              primary: 'MongoDB',
              alternatives: ['PostgreSQL'],
              reasoning: 'Admin override: using MongoDB',
            },
            frontend: {
              framework: 'Vue.js',
              alternatives: ['React', 'Angular'],
              language: 'TypeScript',
              styling: 'Tailwind CSS',
              reasoning: 'Admin override: Vue.js preferred',
            },
            auth: {
              provider: 'Auth0',
              alternatives: ['Firebase Auth'],
              reasoning: 'Admin override: Auth0 integration',
            },
            hosting: {
              platform: 'AWS',
              alternatives: ['Vercel'],
              reasoning: 'Admin override: AWS infrastructure',
            },
            extras: {
              reasoning: 'Admin-configured stack',
            },
            complexity: 'moderate',
            timeEstimate: '4-6 weeks',
            confidence: 0.95,
            reasoning: 'Admin override applied',
          },
          priority: 10,
          conditions: {},
          isActive: true,
        },
      ]);
    });

    it('should apply admin overrides when available', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.WEB_APP);

      expect(stack.database.primary).toBe('MongoDB');
      expect(stack.frontend.framework).toBe('Vue.js');
      expect(stack.auth.provider).toBe('Auth0');
      expect(stack.hosting.platform).toBe('AWS');
      expect(stack.reasoning).toContain('Admin override');
    });

    it('should handle conditional admin overrides', async () => {
      // Mock conditional override
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'override-2',
          key: 'stack_override_web_app_enterprise',
          value: {
            database: { primary: 'PostgreSQL', alternatives: [], reasoning: 'Enterprise DB' },
            frontend: { framework: 'React', alternatives: [], language: 'TypeScript', styling: 'Material-UI', reasoning: 'Enterprise UI' },
            auth: { provider: 'SAML', alternatives: [], reasoning: 'Enterprise SSO' },
            hosting: { platform: 'AWS', alternatives: [], reasoning: 'Enterprise cloud' },
            extras: { reasoning: 'Enterprise stack' },
            complexity: 'complex',
            timeEstimate: '8-12 weeks',
            confidence: 0.9,
            reasoning: 'Enterprise-grade configuration',
          },
          priority: 10,
          conditions: {
            userPlan: ['enterprise'],
            teamSize: { min: 5 },
          },
          isActive: true,
        },
      ]);

      // Should apply for enterprise users with large teams
      const enterpriseStack = await recommender.recommendStack(ProjectCategory.WEB_APP, {
        userPlan: 'enterprise',
        teamSize: 10,
      });

      expect(enterpriseStack.auth.provider).toBe('SAML');
      expect(enterpriseStack.complexity).toBe('complex');

      // Should not apply for small teams
      const smallTeamStack = await recommender.recommendStack(ProjectCategory.WEB_APP, {
        userPlan: 'enterprise',
        teamSize: 2,
      });

      expect(smallTeamStack.auth.provider).not.toBe('SAML');
    });
  });

  describe('Stack Validation', () => {
    it('should return valid stack structure', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.E_COMMERCE);

      // Required fields
      expect(stack.database).toBeDefined();
      expect(stack.database.primary).toBeDefined();
      expect(stack.database.alternatives).toBeInstanceOf(Array);
      expect(stack.database.reasoning).toBeDefined();

      expect(stack.auth).toBeDefined();
      expect(stack.auth.provider).toBeDefined();

      expect(stack.frontend).toBeDefined();
      expect(stack.frontend.framework).toBeDefined();
      expect(stack.frontend.language).toBeDefined();

      expect(stack.hosting).toBeDefined();
      expect(stack.hosting.platform).toBeDefined();

      expect(stack.extras).toBeDefined();
      expect(stack.complexity).toMatch(/^(simple|moderate|complex)$/);
      expect(stack.timeEstimate).toBeDefined();
      expect(stack.confidence).toBeGreaterThan(0);
      expect(stack.confidence).toBeLessThanOrEqual(1);
      expect(stack.reasoning).toBeDefined();
    });

    it('should include relevant alternatives', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.WEB_APP);

      expect(stack.database.alternatives.length).toBeGreaterThan(0);
      expect(stack.frontend.alternatives.length).toBeGreaterThan(0);
      expect(stack.auth.alternatives.length).toBeGreaterThan(0);
      expect(stack.hosting.alternatives.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      (prisma.adminSetting.findMany as jest.Mock).mockRejectedValue(new Error('DB Error'));

      const stack = await recommender.recommendStack(ProjectCategory.WEB_APP);

      // Should fallback to default recommendations
      expect(stack).toBeDefined();
      expect(stack.frontend.framework).toBe('Next.js');
    });

    it('should handle invalid admin overrides', async () => {
      // Mock invalid override structure
      (prisma.adminSetting.findMany as jest.Mock).mockResolvedValue([
        {
          id: 'invalid-override',
          key: 'stack_override_web_app_invalid',
          value: {
            // Missing required fields
            database: { primary: 'MySQL' },
          },
          priority: 10,
          conditions: {},
          isActive: true,
        },
      ]);

      const stack = await recommender.recommendStack(ProjectCategory.WEB_APP);

      // Should fallback to default since override is invalid
      expect(stack.frontend.framework).toBe('Next.js');
    });
  });

  describe('Performance', () => {
    it('should return recommendations quickly', async () => {
      const start = Date.now();

      await Promise.all([
        recommender.recommendStack(ProjectCategory.E_COMMERCE),
        recommender.recommendStack(ProjectCategory.MOBILE_APP),
        recommender.recommendStack(ProjectCategory.API_SERVICE),
        recommender.recommendStack(ProjectCategory.ML_PLATFORM),
        recommender.recommendStack(ProjectCategory.BLOG_PLATFORM),
      ]);

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    it('should handle concurrent requests', async () => {
      const promises = Array(20).fill(null).map(() =>
        recommender.recommendStack(ProjectCategory.WEB_APP)
      );

      const results = await Promise.all(promises);

      results.forEach(stack => {
        expect(stack.frontend.framework).toBe('Next.js');
        expect(stack.complexity).toBeDefined();
      });
    });
  });

  describe('Reasoning Quality', () => {
    it('should provide clear reasoning for recommendations', async () => {
      const stack = await recommender.recommendStack(ProjectCategory.E_COMMERCE);

      expect(stack.reasoning).toContain('e-commerce');
      expect(stack.database.reasoning).toBeDefined();
      expect(stack.frontend.reasoning).toBeDefined();
      expect(stack.auth.reasoning).toBeDefined();
      expect(stack.hosting.reasoning).toBeDefined();
    });

    it('should explain complexity assessment', async () => {
      const simpleStack = await recommender.recommendStack(ProjectCategory.PORTFOLIO);
      const complexStack = await recommender.recommendStack(ProjectCategory.ML_PLATFORM);

      expect(simpleStack.complexity).toBe('simple');
      expect(complexStack.complexity).toBe('complex');
      expect(simpleStack.reasoning).toContain('simple');
      expect(complexStack.reasoning).toContain('complex');
    });
  });

  describe('Time Estimates', () => {
    it('should provide realistic time estimates', async () => {
      const stacks = await Promise.all([
        recommender.recommendStack(ProjectCategory.PORTFOLIO),
        recommender.recommendStack(ProjectCategory.E_COMMERCE),
        recommender.recommendStack(ProjectCategory.ML_PLATFORM),
      ]);

      // Simple projects should have shorter estimates
      expect(stacks[0].timeEstimate).toMatch(/1-2 weeks|2-3 weeks/);

      // Complex projects should have longer estimates
      expect(stacks[2].timeEstimate).toMatch(/8-12 weeks|12-16 weeks/);
    });
  });
});