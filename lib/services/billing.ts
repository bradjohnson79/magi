import { Database } from '@/lib/database';
import { StripeService } from '@/lib/services/stripe';
import {
  Subscription,
  SubscriptionPlan,
  SubscriptionStatus,
  BillingEvent,
  UsageTracking,
  UserQuotaUsage,
  PlanQuotas,
  SubscriptionPreview,
  CreateCheckoutSessionRequest,
  CheckoutSession,
  BillingPortalSession,
  FREE_PLAN_QUOTAS
} from '@/lib/types/billing';

export class BillingService {
  private static instance: BillingService;
  private db: Database;
  private stripe: StripeService;

  constructor() {
    this.db = Database.getInstance();
    this.stripe = StripeService.getInstance();
  }

  static getInstance(): BillingService {
    if (!BillingService.instance) {
      BillingService.instance = new BillingService();
    }
    return BillingService.instance;
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(
    userId: string,
    userEmail: string,
    request: CreateCheckoutSessionRequest
  ): Promise<CheckoutSession> {
    try {
      // Get or create Stripe customer
      const customer = await this.stripe.getOrCreateCustomer(userEmail, userId);

      // Create checkout session
      const session = await this.stripe.createCheckoutSession(customer.id, request);

      return session;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw new Error('Failed to create checkout session');
    }
  }

  /**
   * Create billing portal session
   */
  async createBillingPortalSession(
    userId: string,
    returnUrl: string
  ): Promise<BillingPortalSession> {
    try {
      const subscription = await this.getUserActiveSubscription(userId);
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      return await this.stripe.createBillingPortalSession(
        subscription.stripeCustomerId,
        returnUrl
      );
    } catch (error) {
      console.error('Error creating billing portal session:', error);
      throw new Error('Failed to create billing portal session');
    }
  }

  /**
   * Cancel subscription at period end
   */
  async cancelSubscription(userId: string): Promise<Subscription> {
    try {
      const subscription = await this.getUserActiveSubscription(userId);
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      // Cancel in Stripe
      await this.stripe.cancelSubscription(subscription.stripeSubscriptionId);

      // Update in database
      const query = `
        UPDATE subscriptions
        SET cancel_at_period_end = true, updated_at = now()
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.db.query(query, [subscription.id]);
      return this.mapSubscriptionFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(userId: string): Promise<Subscription> {
    try {
      const subscription = await this.getUserActiveSubscription(userId);
      if (!subscription) {
        throw new Error('No subscription found');
      }

      // Reactivate in Stripe
      await this.stripe.reactivateSubscription(subscription.stripeSubscriptionId);

      // Update in database
      const query = `
        UPDATE subscriptions
        SET cancel_at_period_end = false, canceled_at = NULL, updated_at = now()
        WHERE id = $1
        RETURNING *
      `;

      const result = await this.db.query(query, [subscription.id]);
      return this.mapSubscriptionFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      throw new Error('Failed to reactivate subscription');
    }
  }

  /**
   * Get user's active subscription
   */
  async getUserActiveSubscription(userId: string): Promise<Subscription | null> {
    try {
      const query = `
        SELECT * FROM subscriptions
        WHERE user_id = $1
        AND status IN ('active', 'trialing', 'past_due')
        ORDER BY created_at DESC
        LIMIT 1
      `;

      const result = await this.db.query(query, [userId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapSubscriptionFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error getting user subscription:', error);
      throw new Error('Failed to get user subscription');
    }
  }

  /**
   * Get subscription by Stripe subscription ID
   */
  async getSubscriptionByStripeId(stripeSubscriptionId: string): Promise<Subscription | null> {
    try {
      const query = `
        SELECT * FROM subscriptions
        WHERE stripe_subscription_id = $1
        LIMIT 1
      `;

      const result = await this.db.query(query, [stripeSubscriptionId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapSubscriptionFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error getting subscription by Stripe ID:', error);
      throw new Error('Failed to get subscription');
    }
  }

  /**
   * Create or update subscription from Stripe webhook
   */
  async upsertSubscriptionFromStripe(
    stripeSubscription: any,
    userId?: string
  ): Promise<Subscription> {
    try {
      // Extract subscription data
      const plan = stripeSubscription.metadata?.plan as SubscriptionPlan || 'solo';
      const status = this.mapStripeStatusToOurs(stripeSubscription.status);

      // Get user ID from customer if not provided
      let finalUserId = userId;
      if (!finalUserId) {
        const customer = await this.stripe.getCustomer(stripeSubscription.customer);
        finalUserId = customer.metadata?.userId;

        if (!finalUserId) {
          throw new Error('User ID not found in customer metadata');
        }
      }

      const query = `
        INSERT INTO subscriptions (
          user_id,
          stripe_subscription_id,
          stripe_customer_id,
          plan,
          status,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          trial_start,
          trial_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (stripe_subscription_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          current_period_start = EXCLUDED.current_period_start,
          current_period_end = EXCLUDED.current_period_end,
          cancel_at_period_end = EXCLUDED.cancel_at_period_end,
          trial_start = EXCLUDED.trial_start,
          trial_end = EXCLUDED.trial_end,
          updated_at = now()
        RETURNING *
      `;

      const values = [
        finalUserId,
        stripeSubscription.id,
        stripeSubscription.customer,
        plan,
        status,
        new Date(stripeSubscription.current_period_start * 1000),
        new Date(stripeSubscription.current_period_end * 1000),
        stripeSubscription.cancel_at_period_end || false,
        stripeSubscription.trial_start ? new Date(stripeSubscription.trial_start * 1000) : null,
        stripeSubscription.trial_end ? new Date(stripeSubscription.trial_end * 1000) : null
      ];

      const result = await this.db.query(query, values);
      return this.mapSubscriptionFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error upserting subscription:', error);
      throw new Error('Failed to upsert subscription');
    }
  }

  /**
   * Record billing event
   */
  async recordBillingEvent(
    stripeEventId: string,
    eventType: string,
    eventData: any,
    subscriptionId?: string
  ): Promise<BillingEvent> {
    try {
      const query = `
        INSERT INTO billing_events (
          subscription_id,
          stripe_event_id,
          event_type,
          event_data
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (stripe_event_id) DO NOTHING
        RETURNING *
      `;

      const values = [
        subscriptionId,
        stripeEventId,
        eventType,
        JSON.stringify(eventData)
      ];

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        // Event already exists, fetch it
        const fetchQuery = 'SELECT * FROM billing_events WHERE stripe_event_id = $1';
        const fetchResult = await this.db.query(fetchQuery, [stripeEventId]);
        return this.mapBillingEventFromRow(fetchResult.rows[0]);
      }

      return this.mapBillingEventFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error recording billing event:', error);
      throw new Error('Failed to record billing event');
    }
  }

  /**
   * Get user quota usage
   */
  async getUserQuotaUsage(userId: string): Promise<UserQuotaUsage> {
    try {
      const query = 'SELECT * FROM get_user_quota_usage($1)';
      const result = await this.db.query(query, [userId]);

      if (result.rows.length === 0) {
        // Return free plan quotas if no data
        return {
          currentProjects: 0,
          currentCollaborators: 0,
          currentApiCalls: 0,
          currentStorageMb: 0,
          ...FREE_PLAN_QUOTAS
        };
      }

      const row = result.rows[0];
      return {
        currentProjects: row.current_projects || 0,
        currentCollaborators: row.current_collaborators || 0,
        currentApiCalls: row.current_api_calls || 0,
        currentStorageMb: row.current_storage_mb || 0,
        maxProjects: row.max_projects,
        maxCollaborators: row.max_collaborators,
        maxApiCallsPerMonth: row.max_api_calls_per_month,
        maxStorageMb: row.max_storage_mb
      };
    } catch (error) {
      console.error('Error getting user quota usage:', error);
      throw new Error('Failed to get user quota usage');
    }
  }

  /**
   * Check if user has access to a feature
   */
  async checkFeatureAccess(userId: string, feature: string): Promise<boolean> {
    try {
      const query = 'SELECT check_plan_feature_access($1, $2) as has_access';
      const result = await this.db.query(query, [userId, feature]);

      return result.rows[0]?.has_access || false;
    } catch (error) {
      console.error('Error checking feature access:', error);
      return false;
    }
  }

  /**
   * Get plan quotas
   */
  async getPlanQuotas(plan: SubscriptionPlan): Promise<PlanQuotas> {
    try {
      const query = 'SELECT * FROM plan_quotas WHERE plan = $1';
      const result = await this.db.query(query, [plan]);

      if (result.rows.length === 0) {
        throw new Error(`Plan quotas not found for plan: ${plan}`);
      }

      return this.mapPlanQuotasFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error getting plan quotas:', error);
      throw new Error('Failed to get plan quotas');
    }
  }

  /**
   * Track usage
   */
  async trackUsage(
    userId: string,
    usage: Partial<{
      projectsCreated: number;
      collaboratorsAdded: number;
      apiCalls: number;
      storageUsedMb: number;
      templatesUsed: number;
      pluginsUsed: number;
    }>
  ): Promise<void> {
    try {
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      // Get current subscription
      const subscription = await this.getUserActiveSubscription(userId);

      const query = `
        INSERT INTO usage_tracking (
          user_id,
          subscription_id,
          period_start,
          period_end,
          projects_created,
          collaborators_added,
          api_calls,
          storage_used_mb,
          templates_used,
          plugins_used
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (user_id, period_start, period_end)
        DO UPDATE SET
          projects_created = usage_tracking.projects_created + EXCLUDED.projects_created,
          collaborators_added = usage_tracking.collaborators_added + EXCLUDED.collaborators_added,
          api_calls = usage_tracking.api_calls + EXCLUDED.api_calls,
          storage_used_mb = usage_tracking.storage_used_mb + EXCLUDED.storage_used_mb,
          templates_used = usage_tracking.templates_used + EXCLUDED.templates_used,
          plugins_used = usage_tracking.plugins_used + EXCLUDED.plugins_used,
          updated_at = now()
      `;

      const values = [
        userId,
        subscription?.id || null,
        periodStart,
        periodEnd,
        usage.projectsCreated || 0,
        usage.collaboratorsAdded || 0,
        usage.apiCalls || 0,
        usage.storageUsedMb || 0,
        usage.templatesUsed || 0,
        usage.pluginsUsed || 0
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error('Error tracking usage:', error);
      // Don't throw error for usage tracking failures
    }
  }

  /**
   * Get subscription preview for user
   */
  async getSubscriptionPreview(userId: string): Promise<SubscriptionPreview | null> {
    try {
      const subscription = await this.getUserActiveSubscription(userId);
      if (!subscription) {
        return null;
      }

      const quotaUsage = await this.getUserQuotaUsage(userId);
      const planQuotas = await this.getPlanQuotas(subscription.plan);

      return {
        plan: subscription.plan,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
        quotaUsage,
        features: this.getPlanFeatures(planQuotas)
      };
    } catch (error) {
      console.error('Error getting subscription preview:', error);
      throw new Error('Failed to get subscription preview');
    }
  }

  /**
   * Private helper methods
   */
  private mapStripeStatusToOurs(stripeStatus: string): SubscriptionStatus {
    const statusMap: Record<string, SubscriptionStatus> = {
      'active': 'active',
      'past_due': 'past_due',
      'canceled': 'canceled',
      'unpaid': 'unpaid',
      'incomplete': 'incomplete',
      'incomplete_expired': 'incomplete_expired',
      'trialing': 'trialing'
    };

    return statusMap[stripeStatus] || 'incomplete';
  }

  private getPlanFeatures(quotas: PlanQuotas): string[] {
    const features = [
      `${quotas.maxProjects} projects`,
      `${quotas.maxCollaborators} collaborator${quotas.maxCollaborators > 1 ? 's' : ''}`,
      `${quotas.maxApiCallsPerMonth.toLocaleString()} API calls/month`,
      `${quotas.maxStorageMb >= 1024 ? `${quotas.maxStorageMb / 1024}GB` : `${quotas.maxStorageMb}MB`} storage`
    ];

    if (quotas.templatesEnabled) features.push('Templates & plugins');
    if (quotas.customDomains) features.push('Custom domains');
    if (quotas.prioritySupport) features.push('Priority support');
    if (quotas.advancedAnalytics) features.push('Advanced analytics');

    return features;
  }

  private mapSubscriptionFromRow(row: any): Subscription {
    return {
      id: row.id,
      userId: row.user_id,
      stripeSubscriptionId: row.stripe_subscription_id,
      stripeCustomerId: row.stripe_customer_id,
      plan: row.plan,
      status: row.status,
      currentPeriodStart: new Date(row.current_period_start),
      currentPeriodEnd: new Date(row.current_period_end),
      cancelAtPeriodEnd: row.cancel_at_period_end,
      canceledAt: row.canceled_at ? new Date(row.canceled_at) : undefined,
      trialStart: row.trial_start ? new Date(row.trial_start) : undefined,
      trialEnd: row.trial_end ? new Date(row.trial_end) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapBillingEventFromRow(row: any): BillingEvent {
    return {
      id: row.id,
      subscriptionId: row.subscription_id,
      stripeEventId: row.stripe_event_id,
      eventType: row.event_type,
      eventData: row.event_data,
      processedAt: new Date(row.processed_at),
      createdAt: new Date(row.created_at)
    };
  }

  private mapPlanQuotasFromRow(row: any): PlanQuotas {
    return {
      plan: row.plan,
      maxProjects: row.max_projects,
      maxCollaborators: row.max_collaborators,
      maxApiCallsPerMonth: row.max_api_calls_per_month,
      maxStorageMb: row.max_storage_mb,
      templatesEnabled: row.templates_enabled,
      pluginsEnabled: row.plugins_enabled,
      prioritySupport: row.priority_support,
      customDomains: row.custom_domains,
      advancedAnalytics: row.advanced_analytics
    };
  }
}