import { NextRequest, NextResponse } from 'next/server';
import { BillingService } from '@/lib/services/billing';
import { SubscriptionPlan, UserQuotaUsage } from '@/lib/types/billing';

export interface PlanEnforcementResult {
  allowed: boolean;
  reason?: string;
  upgradeRequired?: boolean;
  currentUsage?: number;
  limit?: number;
}

export class PlanEnforcementService {
  private static instance: PlanEnforcementService;
  private billingService: BillingService;

  constructor() {
    this.billingService = BillingService.getInstance();
  }

  static getInstance(): PlanEnforcementService {
    if (!PlanEnforcementService.instance) {
      PlanEnforcementService.instance = new PlanEnforcementService();
    }
    return PlanEnforcementService.instance;
  }

  /**
   * Check if user can create a new project
   */
  async canCreateProject(userId: string): Promise<PlanEnforcementResult> {
    try {
      const quotaUsage = await this.billingService.getUserQuotaUsage(userId);

      if (quotaUsage.currentProjects >= quotaUsage.maxProjects) {
        return {
          allowed: false,
          reason: `Project limit reached. You can have up to ${quotaUsage.maxProjects} projects on your current plan.`,
          upgradeRequired: true,
          currentUsage: quotaUsage.currentProjects,
          limit: quotaUsage.maxProjects
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking project creation permission:', error);
      return {
        allowed: false,
        reason: 'Unable to verify project limits at this time'
      };
    }
  }

  /**
   * Check if user can add collaborators to a project
   */
  async canAddCollaborator(userId: string): Promise<PlanEnforcementResult> {
    try {
      const quotaUsage = await this.billingService.getUserQuotaUsage(userId);

      if (quotaUsage.currentCollaborators >= quotaUsage.maxCollaborators) {
        return {
          allowed: false,
          reason: `Collaborator limit reached. You can have up to ${quotaUsage.maxCollaborators} collaborators on your current plan.`,
          upgradeRequired: true,
          currentUsage: quotaUsage.currentCollaborators,
          limit: quotaUsage.maxCollaborators
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking collaborator permission:', error);
      return {
        allowed: false,
        reason: 'Unable to verify collaborator limits at this time'
      };
    }
  }

  /**
   * Check if user can make API calls
   */
  async canMakeApiCall(userId: string): Promise<PlanEnforcementResult> {
    try {
      const quotaUsage = await this.billingService.getUserQuotaUsage(userId);

      if (quotaUsage.currentApiCalls >= quotaUsage.maxApiCallsPerMonth) {
        return {
          allowed: false,
          reason: `API call limit reached. You can make up to ${quotaUsage.maxApiCallsPerMonth.toLocaleString()} API calls per month on your current plan.`,
          upgradeRequired: true,
          currentUsage: quotaUsage.currentApiCalls,
          limit: quotaUsage.maxApiCallsPerMonth
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking API call permission:', error);
      return {
        allowed: false,
        reason: 'Unable to verify API limits at this time'
      };
    }
  }

  /**
   * Check if user can use templates
   */
  async canUseTemplates(userId: string): Promise<PlanEnforcementResult> {
    try {
      const hasAccess = await this.billingService.checkFeatureAccess(userId, 'templates');

      if (!hasAccess) {
        return {
          allowed: false,
          reason: 'Templates are only available on the Teams plan.',
          upgradeRequired: true
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking templates permission:', error);
      return {
        allowed: false,
        reason: 'Unable to verify template access at this time'
      };
    }
  }

  /**
   * Check if user can use plugins
   */
  async canUsePlugins(userId: string): Promise<PlanEnforcementResult> {
    try {
      const hasAccess = await this.billingService.checkFeatureAccess(userId, 'plugins');

      if (!hasAccess) {
        return {
          allowed: false,
          reason: 'Plugins are only available on the Teams plan.',
          upgradeRequired: true
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking plugins permission:', error);
      return {
        allowed: false,
        reason: 'Unable to verify plugin access at this time'
      };
    }
  }

  /**
   * Check if user can use custom domains
   */
  async canUseCustomDomains(userId: string): Promise<PlanEnforcementResult> {
    try {
      const hasAccess = await this.billingService.checkFeatureAccess(userId, 'custom_domains');

      if (!hasAccess) {
        return {
          allowed: false,
          reason: 'Custom domains are only available on the Teams plan.',
          upgradeRequired: true
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking custom domains permission:', error);
      return {
        allowed: false,
        reason: 'Unable to verify custom domain access at this time'
      };
    }
  }

  /**
   * Check if user has priority support
   */
  async hasPrioritySupport(userId: string): Promise<boolean> {
    try {
      return await this.billingService.checkFeatureAccess(userId, 'priority_support');
    } catch (error) {
      console.error('Error checking priority support:', error);
      return false;
    }
  }

  /**
   * Check if user can access advanced analytics
   */
  async canUseAdvancedAnalytics(userId: string): Promise<PlanEnforcementResult> {
    try {
      const hasAccess = await this.billingService.checkFeatureAccess(userId, 'advanced_analytics');

      if (!hasAccess) {
        return {
          allowed: false,
          reason: 'Advanced analytics are only available on the Teams plan.',
          upgradeRequired: true
        };
      }

      return { allowed: true };
    } catch (error) {
      console.error('Error checking advanced analytics permission:', error);
      return {
        allowed: false,
        reason: 'Unable to verify analytics access at this time'
      };
    }
  }

  /**
   * Track usage for billing purposes
   */
  async trackProjectCreation(userId: string): Promise<void> {
    try {
      await this.billingService.trackUsage(userId, {
        projectsCreated: 1
      });
    } catch (error) {
      console.error('Error tracking project creation:', error);
    }
  }

  async trackCollaboratorAddition(userId: string): Promise<void> {
    try {
      await this.billingService.trackUsage(userId, {
        collaboratorsAdded: 1
      });
    } catch (error) {
      console.error('Error tracking collaborator addition:', error);
    }
  }

  async trackApiCall(userId: string): Promise<void> {
    try {
      await this.billingService.trackUsage(userId, {
        apiCalls: 1
      });
    } catch (error) {
      console.error('Error tracking API call:', error);
    }
  }

  async trackStorageUsage(userId: string, sizeInMb: number): Promise<void> {
    try {
      await this.billingService.trackUsage(userId, {
        storageUsedMb: sizeInMb
      });
    } catch (error) {
      console.error('Error tracking storage usage:', error);
    }
  }

  async trackTemplateUsage(userId: string): Promise<void> {
    try {
      await this.billingService.trackUsage(userId, {
        templatesUsed: 1
      });
    } catch (error) {
      console.error('Error tracking template usage:', error);
    }
  }

  async trackPluginUsage(userId: string): Promise<void> {
    try {
      await this.billingService.trackUsage(userId, {
        pluginsUsed: 1
      });
    } catch (error) {
      console.error('Error tracking plugin usage:', error);
    }
  }

  /**
   * Middleware function for enforcing plan limits
   */
  async enforceApiRateLimit(
    request: NextRequest,
    userId: string
  ): Promise<NextResponse | null> {
    const canMakeCall = await this.canMakeApiCall(userId);

    if (!canMakeCall.allowed) {
      return NextResponse.json(
        {
          error: 'Rate Limit Exceeded',
          message: canMakeCall.reason,
          upgradeRequired: canMakeCall.upgradeRequired,
          limits: {
            current: canMakeCall.currentUsage,
            max: canMakeCall.limit
          }
        },
        { status: 429 }
      );
    }

    // Track the API call
    await this.trackApiCall(userId);

    return null; // Continue to next middleware/handler
  }

  /**
   * Get upgrade message for feature
   */
  getUpgradeMessage(feature: string): string {
    const messages: Record<string, string> = {
      projects: 'Upgrade to Teams to create more projects and scale your development workflow.',
      collaborators: 'Upgrade to Teams to add more team members and collaborate effectively.',
      templates: 'Upgrade to Teams to access premium templates and accelerate your development.',
      plugins: 'Upgrade to Teams to unlock powerful plugins and extend your capabilities.',
      custom_domains: 'Upgrade to Teams to use custom domains and professional branding.',
      advanced_analytics: 'Upgrade to Teams to access detailed analytics and insights.',
      api_calls: 'Upgrade to Teams to increase your API limits and build more robust applications.'
    };

    return messages[feature] || 'Upgrade to Teams to access this premium feature.';
  }

  /**
   * Get plan comparison for upgrade prompts
   */
  getPlanComparison(): {
    solo: string[];
    teams: string[];
  } {
    return {
      solo: [
        '10 projects',
        '1 collaborator',
        '10,000 API calls/month',
        '1GB storage',
        'Email support'
      ],
      teams: [
        '100 projects',
        '20 collaborators',
        '100,000 API calls/month',
        '10GB storage',
        'Templates & plugins',
        'Custom domains',
        'Priority support',
        'Advanced analytics'
      ]
    };
  }
}

/**
 * Higher-order function to wrap API routes with plan enforcement
 */
export function withPlanEnforcement(
  handler: (req: NextRequest, context: any) => Promise<NextResponse>,
  options: {
    feature?: string;
    checkRateLimit?: boolean;
    requireUpgrade?: boolean;
  } = {}
) {
  return async (req: NextRequest, context: any) => {
    try {
      // Get user ID from request (you'll need to implement this based on your auth system)
      const userId = req.headers.get('x-user-id');

      if (!userId) {
        return NextResponse.json(
          { error: 'Unauthorized', message: 'User not authenticated' },
          { status: 401 }
        );
      }

      const enforcement = PlanEnforcementService.getInstance();

      // Check rate limiting if enabled
      if (options.checkRateLimit) {
        const rateLimitResponse = await enforcement.enforceApiRateLimit(req, userId);
        if (rateLimitResponse) {
          return rateLimitResponse;
        }
      }

      // Check feature access if specified
      if (options.feature) {
        let canAccess: PlanEnforcementResult;

        switch (options.feature) {
          case 'templates':
            canAccess = await enforcement.canUseTemplates(userId);
            break;
          case 'plugins':
            canAccess = await enforcement.canUsePlugins(userId);
            break;
          case 'custom_domains':
            canAccess = await enforcement.canUseCustomDomains(userId);
            break;
          case 'advanced_analytics':
            canAccess = await enforcement.canUseAdvancedAnalytics(userId);
            break;
          default:
            canAccess = { allowed: true };
        }

        if (!canAccess.allowed) {
          return NextResponse.json(
            {
              error: 'Feature Not Available',
              message: canAccess.reason,
              upgradeRequired: canAccess.upgradeRequired,
              upgradeMessage: enforcement.getUpgradeMessage(options.feature)
            },
            { status: 403 }
          );
        }
      }

      // Continue to the actual handler
      return await handler(req, context);

    } catch (error) {
      console.error('Plan enforcement error:', error);
      return NextResponse.json(
        { error: 'Internal Server Error', message: 'Plan enforcement failed' },
        { status: 500 }
      );
    }
  };
}