/**
 * Stack Recommender System
 *
 * Intelligent technology stack recommendations based on project categories.
 * Includes admin overrides, user preferences, and adaptive learning.
 */

import { ProjectCategory } from './classifier';
import { prisma } from '@/lib/db';
import { platformSettings } from '@/services/platform/settings';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface RecommendedStack {
  // Database
  database: {
    primary: string;
    alternatives: string[];
    reasoning: string;
  };

  // Authentication
  auth: {
    provider: string;
    alternatives: string[];
    reasoning: string;
  };

  // Frontend
  frontend: {
    framework: string;
    alternatives: string[];
    language: string;
    styling: string;
    reasoning: string;
  };

  // Backend (if needed)
  backend?: {
    framework: string;
    alternatives: string[];
    language: string;
    reasoning: string;
  };

  // Hosting & Deployment
  hosting: {
    platform: string;
    alternatives: string[];
    reasoning: string;
  };

  // Additional Tools & Services
  extras: {
    stateManagement?: string;
    testing?: string;
    monitoring?: string;
    cms?: string;
    payments?: string;
    storage?: string;
    apis?: string[];
    reasoning: string;
  };

  // Metadata
  complexity: 'simple' | 'moderate' | 'complex';
  timeEstimate: string;
  confidence: number;
  reasoning: string;
}

interface StackRule {
  category: ProjectCategory;
  stack: RecommendedStack;
  priority: number;
  conditions?: {
    userPlan?: string[];
    teamSize?: number;
    complexity?: string[];
  };
}

// Default stack recommendations
const DEFAULT_STACK_RULES: StackRule[] = [
  // Web Applications
  {
    category: ProjectCategory.WEB_APP,
    priority: 1,
    stack: {
      database: {
        primary: 'PostgreSQL',
        alternatives: ['MongoDB', 'MySQL', 'SQLite'],
        reasoning: 'PostgreSQL offers excellent performance, JSON support, and strong consistency for web applications',
      },
      auth: {
        provider: 'Clerk',
        alternatives: ['Auth0', 'Firebase Auth', 'NextAuth.js'],
        reasoning: 'Clerk provides modern authentication with great developer experience',
      },
      frontend: {
        framework: 'Next.js',
        alternatives: ['React', 'Vue.js', 'Nuxt.js'],
        language: 'TypeScript',
        styling: 'Tailwind CSS',
        reasoning: 'Next.js with TypeScript provides full-stack capabilities with excellent performance',
      },
      backend: {
        framework: 'Next.js API Routes',
        alternatives: ['Express.js', 'Fastify', 'tRPC'],
        language: 'TypeScript',
        reasoning: 'Next.js API routes offer seamless full-stack development',
      },
      hosting: {
        platform: 'Vercel',
        alternatives: ['Netlify', 'AWS', 'Railway'],
        reasoning: 'Vercel provides optimal Next.js hosting with zero configuration',
      },
      extras: {
        stateManagement: 'Zustand',
        testing: 'Jest + React Testing Library',
        monitoring: 'Vercel Analytics',
        reasoning: 'Modern tooling for scalable web applications',
      },
      complexity: 'moderate',
      timeEstimate: '2-4 weeks',
      confidence: 0.9,
      reasoning: 'Proven stack for modern web applications with excellent developer experience',
    },
  },

  // E-commerce
  {
    category: ProjectCategory.E_COMMERCE,
    priority: 1,
    stack: {
      database: {
        primary: 'PostgreSQL',
        alternatives: ['MongoDB', 'MySQL'],
        reasoning: 'PostgreSQL handles complex e-commerce data relationships and transactions reliably',
      },
      auth: {
        provider: 'Clerk',
        alternatives: ['Auth0', 'Firebase Auth'],
        reasoning: 'Clerk supports user management and role-based access for e-commerce',
      },
      frontend: {
        framework: 'Next.js',
        alternatives: ['React', 'Vue.js'],
        language: 'TypeScript',
        styling: 'Tailwind CSS',
        reasoning: 'Next.js provides SSR for SEO and performance critical for e-commerce',
      },
      backend: {
        framework: 'Next.js API Routes',
        alternatives: ['Express.js', 'NestJS'],
        language: 'TypeScript',
        reasoning: 'Integrated backend for handling complex e-commerce logic',
      },
      hosting: {
        platform: 'Vercel',
        alternatives: ['AWS', 'Digital Ocean'],
        reasoning: 'Vercel handles e-commerce traffic with excellent performance',
      },
      extras: {
        payments: 'Stripe',
        stateManagement: 'Zustand',
        testing: 'Jest + Playwright',
        monitoring: 'Sentry',
        storage: 'AWS S3',
        reasoning: 'Complete e-commerce infrastructure with payment processing',
      },
      complexity: 'complex',
      timeEstimate: '6-12 weeks',
      confidence: 0.95,
      reasoning: 'Comprehensive stack optimized for e-commerce requirements',
    },
  },

  // Mobile Apps
  {
    category: ProjectCategory.MOBILE_APP,
    priority: 1,
    stack: {
      database: {
        primary: 'Firebase Firestore',
        alternatives: ['PostgreSQL', 'MongoDB'],
        reasoning: 'Firebase provides real-time sync and offline support for mobile apps',
      },
      auth: {
        provider: 'Firebase Auth',
        alternatives: ['Clerk', 'Auth0'],
        reasoning: 'Firebase Auth integrates seamlessly with mobile platforms',
      },
      frontend: {
        framework: 'React Native',
        alternatives: ['Flutter', 'Swift/Kotlin'],
        language: 'TypeScript',
        styling: 'StyleSheet',
        reasoning: 'React Native enables cross-platform development with native performance',
      },
      backend: {
        framework: 'Firebase Functions',
        alternatives: ['Express.js', 'FastAPI'],
        language: 'TypeScript',
        reasoning: 'Firebase Functions provide serverless backend for mobile apps',
      },
      hosting: {
        platform: 'Firebase',
        alternatives: ['AWS', 'Google Cloud'],
        reasoning: 'Firebase offers complete mobile backend as a service',
      },
      extras: {
        stateManagement: 'Redux Toolkit',
        testing: 'Jest + Detox',
        monitoring: 'Firebase Crashlytics',
        apis: ['Firebase SDK'],
        reasoning: 'Integrated mobile development ecosystem',
      },
      complexity: 'moderate',
      timeEstimate: '4-8 weeks',
      confidence: 0.85,
      reasoning: 'Optimized for cross-platform mobile development',
    },
  },

  // API Services
  {
    category: ProjectCategory.API_SERVICE,
    priority: 1,
    stack: {
      database: {
        primary: 'PostgreSQL',
        alternatives: ['MongoDB', 'Redis'],
        reasoning: 'PostgreSQL provides reliable data storage with excellent query performance',
      },
      auth: {
        provider: 'JWT + Clerk',
        alternatives: ['Auth0', 'Custom OAuth'],
        reasoning: 'JWT tokens with Clerk for scalable API authentication',
      },
      frontend: {
        framework: 'None',
        alternatives: ['Swagger UI', 'Postman'],
        language: 'N/A',
        styling: 'N/A',
        reasoning: 'API-only service without frontend interface',
      },
      backend: {
        framework: 'Express.js',
        alternatives: ['Fastify', 'NestJS', 'Koa'],
        language: 'TypeScript',
        reasoning: 'Express.js provides flexible and performant API development',
      },
      hosting: {
        platform: 'Railway',
        alternatives: ['AWS', 'Digital Ocean', 'Heroku'],
        reasoning: 'Railway offers simple deployment for API services',
      },
      extras: {
        testing: 'Jest + Supertest',
        monitoring: 'New Relic',
        apis: ['OpenAPI/Swagger'],
        reasoning: 'Professional API development and monitoring tools',
      },
      complexity: 'moderate',
      timeEstimate: '2-6 weeks',
      confidence: 0.9,
      reasoning: 'Proven stack for scalable API services',
    },
  },

  // AI/ML Projects
  {
    category: ProjectCategory.AI_CHATBOT,
    priority: 1,
    stack: {
      database: {
        primary: 'Vector Database (Pinecone)',
        alternatives: ['PostgreSQL + pgvector', 'Weaviate'],
        reasoning: 'Vector databases optimize similarity search for AI applications',
      },
      auth: {
        provider: 'Clerk',
        alternatives: ['Auth0', 'Firebase Auth'],
        reasoning: 'User management for AI applications with usage tracking',
      },
      frontend: {
        framework: 'Next.js',
        alternatives: ['React', 'Streamlit'],
        language: 'TypeScript',
        styling: 'Tailwind CSS',
        reasoning: 'Next.js provides excellent UX for conversational interfaces',
      },
      backend: {
        framework: 'FastAPI',
        alternatives: ['Express.js', 'Django'],
        language: 'Python',
        reasoning: 'FastAPI excels at AI/ML API development with async support',
      },
      hosting: {
        platform: 'Vercel + Railway',
        alternatives: ['AWS', 'Google Cloud'],
        reasoning: 'Vercel for frontend, Railway for AI backend services',
      },
      extras: {
        stateManagement: 'Zustand',
        testing: 'Pytest + Jest',
        monitoring: 'LangSmith',
        apis: ['OpenAI API', 'Anthropic API'],
        reasoning: 'Complete AI development stack with monitoring',
      },
      complexity: 'complex',
      timeEstimate: '4-10 weeks',
      confidence: 0.85,
      reasoning: 'Specialized stack for AI-powered applications',
    },
  },

  // Data Analytics
  {
    category: ProjectCategory.ANALYTICS_DASHBOARD,
    priority: 1,
    stack: {
      database: {
        primary: 'PostgreSQL',
        alternatives: ['ClickHouse', 'BigQuery'],
        reasoning: 'PostgreSQL with analytics extensions for complex queries',
      },
      auth: {
        provider: 'Clerk',
        alternatives: ['Auth0', 'Custom RBAC'],
        reasoning: 'Role-based access for sensitive analytics data',
      },
      frontend: {
        framework: 'Next.js',
        alternatives: ['React', 'Vue.js'],
        language: 'TypeScript',
        styling: 'Tailwind CSS',
        reasoning: 'Next.js with excellent charting library ecosystem',
      },
      backend: {
        framework: 'Next.js API Routes',
        alternatives: ['Express.js', 'FastAPI'],
        language: 'TypeScript',
        reasoning: 'Integrated backend for data processing and API endpoints',
      },
      hosting: {
        platform: 'Vercel',
        alternatives: ['AWS', 'Google Cloud'],
        reasoning: 'Vercel handles analytics workloads with good caching',
      },
      extras: {
        stateManagement: 'TanStack Query',
        testing: 'Jest + Playwright',
        monitoring: 'Datadog',
        apis: ['Chart.js', 'D3.js', 'Recharts'],
        reasoning: 'Data visualization and analytics tooling',
      },
      complexity: 'moderate',
      timeEstimate: '3-6 weeks',
      confidence: 0.8,
      reasoning: 'Balanced stack for analytics and visualization',
    },
  },

  // Simple Projects
  {
    category: ProjectCategory.LANDING_PAGE,
    priority: 1,
    stack: {
      database: {
        primary: 'None',
        alternatives: ['Airtable', 'Google Sheets'],
        reasoning: 'Landing pages typically don\'t require complex databases',
      },
      auth: {
        provider: 'None',
        alternatives: ['Simple forms', 'Newsletter signup'],
        reasoning: 'Landing pages focus on conversion, not authentication',
      },
      frontend: {
        framework: 'Next.js',
        alternatives: ['React', 'HTML/CSS'],
        language: 'TypeScript',
        styling: 'Tailwind CSS',
        reasoning: 'Next.js provides excellent SEO and performance for landing pages',
      },
      hosting: {
        platform: 'Vercel',
        alternatives: ['Netlify', 'GitHub Pages'],
        reasoning: 'Vercel offers optimal performance and easy deployment',
      },
      extras: {
        testing: 'Lighthouse',
        monitoring: 'Vercel Analytics',
        apis: ['Email service', 'Analytics'],
        reasoning: 'Focus on performance and conversion tracking',
      },
      complexity: 'simple',
      timeEstimate: '1-2 weeks',
      confidence: 0.95,
      reasoning: 'Streamlined stack for high-converting landing pages',
    },
  },
];

export class StackRecommender {
  private static instance: StackRecommender;

  private constructor() {}

  static getInstance(): StackRecommender {
    if (!StackRecommender.instance) {
      StackRecommender.instance = new StackRecommender();
    }
    return StackRecommender.instance;
  }

  /**
   * Get stack recommendation for a project category
   */
  async recommendStack(
    category: ProjectCategory,
    context?: {
      userId?: string;
      teamSize?: number;
      userPlan?: string;
      requirements?: string[];
      preferences?: Record<string, any>;
    }
  ): Promise<RecommendedStack> {
    return await withSpan('recommender.recommend_stack', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'stack_recommendation',
          'project.category': category,
          'user.plan': context?.userPlan || 'unknown',
          'team.size': context?.teamSize || 1,
        });

        // Check for admin overrides first
        const adminOverride = await this.getAdminOverride(category, context);
        if (adminOverride) {
          await this.logRecommendation(category, adminOverride, 'admin_override', context?.userId);
          return adminOverride;
        }

        // Find matching stack rules
        const applicableRules = this.findApplicableRules(category, context);

        if (applicableRules.length === 0) {
          // Fallback to generic web app stack
          const fallbackStack = this.getFallbackStack(category);
          await this.logRecommendation(category, fallbackStack, 'fallback', context?.userId);
          return fallbackStack;
        }

        // Select best rule based on priority and conditions
        const selectedRule = applicableRules[0];
        let recommendedStack = { ...selectedRule.stack };

        // Apply user preferences if available
        if (context?.preferences) {
          recommendedStack = this.applyUserPreferences(recommendedStack, context.preferences);
        }

        // Adjust for user plan limitations
        if (context?.userPlan) {
          recommendedStack = this.applyPlanLimitations(recommendedStack, context.userPlan);
        }

        await this.logRecommendation(category, recommendedStack, 'default_rule', context?.userId);
        return recommendedStack;

      } catch (error) {
        console.error('Stack recommendation failed:', error);

        const fallbackStack = this.getFallbackStack(category);
        await this.logRecommendation(category, fallbackStack, 'error_fallback', context?.userId);
        return fallbackStack;
      }
    });
  }

  /**
   * Find applicable stack rules for the given context
   */
  private findApplicableRules(
    category: ProjectCategory,
    context?: {
      userPlan?: string;
      teamSize?: number;
      requirements?: string[];
    }
  ): StackRule[] {
    return DEFAULT_STACK_RULES
      .filter(rule => {
        // Category must match
        if (rule.category !== category) return false;

        // Check conditions if specified
        if (rule.conditions) {
          // User plan check
          if (rule.conditions.userPlan && context?.userPlan) {
            if (!rule.conditions.userPlan.includes(context.userPlan)) {
              return false;
            }
          }

          // Team size check
          if (rule.conditions.teamSize && context?.teamSize) {
            if (context.teamSize < rule.conditions.teamSize) {
              return false;
            }
          }
        }

        return true;
      })
      .sort((a, b) => b.priority - a.priority); // Highest priority first
  }

  /**
   * Check for admin overrides
   */
  private async getAdminOverride(
    category: ProjectCategory,
    context?: { userPlan?: string; teamSize?: number }
  ): Promise<RecommendedStack | null> {
    return withSpan('recommender.get_admin_override', async (span) => {
      try {
        addSpanAttributes(span, {
          'admin_override.category': category,
          'admin_override.user_plan': context?.userPlan || 'unknown',
          'admin_override.team_size': context?.teamSize || 1,
        });

        // Get admin overrides for this category
        const overrides = await prisma.adminSetting.findMany({
          where: {
            category: 'stack_rules',
            isActive: true,
            key: {
              startsWith: `stack_override_${category}`,
            },
          },
          orderBy: [
            { priority: 'desc' },
            { createdAt: 'desc' },
          ],
        });

        if (overrides.length === 0) {
          addSpanAttributes(span, { 'admin_override.found': false });
          return null;
        }

        // Find the most applicable override
        for (const override of overrides) {
          const conditions = override.conditions as any;

          // Check if conditions match context
          if (this.matchesConditions(conditions, context)) {
            const stackOverride = override.value as RecommendedStack;

            // Validate the override structure
            if (this.validateStackStructure(stackOverride)) {
              addSpanAttributes(span, {
                'admin_override.found': true,
                'admin_override.key': override.key,
                'admin_override.priority': override.priority,
              });

              // Log admin override usage
              await this.logAdminOverrideUsage(override.id, category, context);

              return stackOverride;
            }
          }
        }

        addSpanAttributes(span, { 'admin_override.found': false });
        return null;
      } catch (error) {
        span?.recordException?.(error as Error);
        console.warn('Failed to get admin override:', error);
        return null;
      }
    });
  }

  /**
   * Check if admin override conditions match the current context
   */
  private matchesConditions(
    conditions: any,
    context?: { userPlan?: string; teamSize?: number }
  ): boolean {
    if (!conditions || Object.keys(conditions).length === 0) {
      return true; // No conditions = applies to all
    }

    // Check user plan condition
    if (conditions.userPlan && context?.userPlan) {
      if (Array.isArray(conditions.userPlan)) {
        if (!conditions.userPlan.includes(context.userPlan)) {
          return false;
        }
      } else if (conditions.userPlan !== context.userPlan) {
        return false;
      }
    }

    // Check team size condition
    if (conditions.teamSize && context?.teamSize) {
      const teamSize = context.teamSize;
      if (conditions.teamSize.min && teamSize < conditions.teamSize.min) {
        return false;
      }
      if (conditions.teamSize.max && teamSize > conditions.teamSize.max) {
        return false;
      }
    }

    return true;
  }

  /**
   * Log admin override usage for analytics
   */
  private async logAdminOverrideUsage(
    overrideId: string,
    category: ProjectCategory,
    context?: { userPlan?: string; teamSize?: number }
  ): Promise<void> {
    try {
      await auditLogger.log({
        action: 'system.admin_override_used',
        resource: 'stack_recommendation',
        resourceId: overrideId,
        details: {
          category,
          userPlan: context?.userPlan,
          teamSize: context?.teamSize,
        },
        metadata: {
          source: 'stack-recommender',
          version: '1.0.0',
        },
        severity: 'info',
        outcome: 'success',
      });
    } catch (error) {
      console.warn('Failed to log admin override usage:', error);
    }
  }

  /**
   * Apply user preferences to recommended stack
   */
  private applyUserPreferences(
    stack: RecommendedStack,
    preferences: Record<string, any>
  ): RecommendedStack {
    const modifiedStack = { ...stack };

    // Apply frontend framework preference
    if (preferences.frontendFramework && stack.frontend) {
      const preferredFramework = preferences.frontendFramework;
      if (stack.frontend.alternatives.includes(preferredFramework)) {
        modifiedStack.frontend = {
          ...stack.frontend,
          framework: preferredFramework,
          reasoning: `${stack.frontend.reasoning} (User preference: ${preferredFramework})`,
        };
      }
    }

    // Apply database preference
    if (preferences.database) {
      const preferredDb = preferences.database;
      if (stack.database.alternatives.includes(preferredDb)) {
        modifiedStack.database = {
          ...stack.database,
          primary: preferredDb,
          reasoning: `${stack.database.reasoning} (User preference: ${preferredDb})`,
        };
      }
    }

    // Apply hosting preference
    if (preferences.hosting) {
      const preferredHosting = preferences.hosting;
      if (stack.hosting.alternatives.includes(preferredHosting)) {
        modifiedStack.hosting = {
          ...stack.hosting,
          platform: preferredHosting,
          reasoning: `${stack.hosting.reasoning} (User preference: ${preferredHosting})`,
        };
      }
    }

    return modifiedStack;
  }

  /**
   * Apply plan limitations to stack recommendations
   */
  private applyPlanLimitations(
    stack: RecommendedStack,
    userPlan: string
  ): RecommendedStack {
    const modifiedStack = { ...stack };

    // Trial plan limitations
    if (userPlan === 'trial') {
      // Suggest simpler, free alternatives
      if (stack.database.primary === 'PostgreSQL') {
        modifiedStack.database = {
          ...stack.database,
          primary: 'SQLite',
          reasoning: `${stack.database.reasoning} (Trial plan: using SQLite for simplicity)`,
        };
      }

      // Suggest free hosting
      if (stack.hosting.platform === 'Vercel' && stack.complexity === 'complex') {
        modifiedStack.hosting = {
          ...stack.hosting,
          platform: 'Netlify',
          reasoning: `${stack.hosting.reasoning} (Trial plan: Netlify free tier)`,
        };
      }
    }

    return modifiedStack;
  }

  /**
   * Get fallback stack for unknown categories
   */
  private getFallbackStack(category: ProjectCategory): RecommendedStack {
    return {
      database: {
        primary: 'PostgreSQL',
        alternatives: ['SQLite', 'MongoDB'],
        reasoning: 'PostgreSQL is a reliable default choice for most projects',
      },
      auth: {
        provider: 'Clerk',
        alternatives: ['Auth0', 'NextAuth.js'],
        reasoning: 'Clerk provides modern authentication for web applications',
      },
      frontend: {
        framework: 'Next.js',
        alternatives: ['React', 'Vue.js'],
        language: 'TypeScript',
        styling: 'Tailwind CSS',
        reasoning: 'Next.js with TypeScript is a versatile choice for web development',
      },
      backend: {
        framework: 'Next.js API Routes',
        alternatives: ['Express.js', 'Fastify'],
        language: 'TypeScript',
        reasoning: 'Next.js API routes provide integrated full-stack development',
      },
      hosting: {
        platform: 'Vercel',
        alternatives: ['Netlify', 'Railway'],
        reasoning: 'Vercel offers excellent performance and developer experience',
      },
      extras: {
        stateManagement: 'Zustand',
        testing: 'Jest',
        monitoring: 'Vercel Analytics',
        reasoning: 'Modern tooling for web development',
      },
      complexity: 'moderate',
      timeEstimate: '2-4 weeks',
      confidence: 0.6,
      reasoning: `Fallback recommendation for ${category} - using proven web development stack`,
    };
  }

  /**
   * Validate stack structure
   */
  private validateStackStructure(stack: any): stack is RecommendedStack {
    return (
      stack &&
      typeof stack === 'object' &&
      stack.database &&
      stack.auth &&
      stack.frontend &&
      stack.hosting &&
      stack.complexity &&
      stack.timeEstimate &&
      typeof stack.confidence === 'number'
    );
  }

  /**
   * Log recommendation for analytics and learning
   */
  private async logRecommendation(
    category: ProjectCategory,
    stack: RecommendedStack,
    method: string,
    userId?: string
  ): Promise<void> {
    try {
      await auditLogger.logSystem('system.stack_recommended', {
        category,
        method,
        complexity: stack.complexity,
        confidence: stack.confidence,
        frontendFramework: stack.frontend.framework,
        database: stack.database.primary,
        hosting: stack.hosting.platform,
        userId,
      });
    } catch (error) {
      console.warn('Failed to log recommendation:', error);
    }
  }

  /**
   * Get recommendation statistics for analysis
   */
  async getRecommendationStats(timeRange?: { start: Date; end: Date }): Promise<{
    totalRecommendations: number;
    byCategory: Array<{ category: ProjectCategory; count: number }>;
    byMethod: Array<{ method: string; count: number }>;
    averageConfidence: number;
    mostPopularStacks: Array<{ stack: string; count: number }>;
  }> {
    // This would query audit logs for recommendation statistics
    // For now, return mock structure
    return {
      totalRecommendations: 0,
      byCategory: [],
      byMethod: [],
      averageConfidence: 0,
      mostPopularStacks: [],
    };
  }

  /**
   * Update stack rule based on feedback
   */
  async updateStackRule(
    category: ProjectCategory,
    feedback: {
      actualStack: Partial<RecommendedStack>;
      satisfaction: number;
      issues?: string[];
    },
    userId?: string
  ): Promise<void> {
    try {
      // Log feedback for future learning
      await auditLogger.logSystem('system.stack_feedback', {
        category,
        satisfaction: feedback.satisfaction,
        issues: feedback.issues,
        actualStack: feedback.actualStack,
        userId,
      });

      // Future: Use feedback to improve recommendations
      console.log(`Received feedback for ${category}:`, feedback);
    } catch (error) {
      console.error('Failed to update stack rule:', error);
    }
  }
}

// Export singleton instance
export const stackRecommender = StackRecommender.getInstance();

// Export types for external use
export type { RecommendedStack };