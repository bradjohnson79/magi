export type SubscriptionPlan = 'solo' | 'teams';

export type SubscriptionStatus =
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing';

export interface Subscription {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date;
  trialStart?: Date;
  trialEnd?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingEvent {
  id: string;
  subscriptionId?: string;
  stripeEventId: string;
  eventType: string;
  eventData: Record<string, any>;
  processedAt: Date;
  createdAt: Date;
}

export interface UsageTracking {
  id: string;
  userId: string;
  subscriptionId?: string;
  periodStart: Date;
  periodEnd: Date;
  projectsCreated: number;
  collaboratorsAdded: number;
  apiCalls: number;
  storageUsedMb: number;
  templatesUsed: number;
  pluginsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlanQuotas {
  plan: SubscriptionPlan;
  maxProjects: number;
  maxCollaborators: number;
  maxApiCallsPerMonth: number;
  maxStorageMb: number;
  templatesEnabled: boolean;
  pluginsEnabled: boolean;
  prioritySupport: boolean;
  customDomains: boolean;
  advancedAnalytics: boolean;
}

export interface UserQuotaUsage {
  currentProjects: number;
  currentCollaborators: number;
  currentApiCalls: number;
  currentStorageMb: number;
  maxProjects: number;
  maxCollaborators: number;
  maxApiCallsPerMonth: number;
  maxStorageMb: number;
}

export interface CreateCheckoutSessionRequest {
  plan: SubscriptionPlan;
  successUrl: string;
  cancelUrl: string;
}

export interface CheckoutSession {
  sessionId: string;
  url: string;
}

export interface PlanDetails {
  name: string;
  price: number;
  interval: 'month' | 'year';
  features: string[];
  stripePriceId: string;
  recommended?: boolean;
}

export interface BillingPortalSession {
  url: string;
}

export interface SubscriptionPreview {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  quotaUsage: UserQuotaUsage;
  features: string[];
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
    previous_attributes?: any;
  };
  created: number;
}

export const PLAN_DETAILS: Record<SubscriptionPlan, PlanDetails> = {
  solo: {
    name: 'Solo',
    price: 59,
    interval: 'month',
    stripePriceId: process.env.STRIPE_SOLO_PRICE_ID || 'price_solo_monthly',
    features: [
      '10 projects',
      '1 collaborator',
      '10,000 API calls/month',
      '1GB storage',
      'Email support',
      'Basic analytics'
    ]
  },
  teams: {
    name: 'Teams',
    price: 99,
    interval: 'month',
    stripePriceId: process.env.STRIPE_TEAMS_PRICE_ID || 'price_teams_monthly',
    recommended: true,
    features: [
      '100 projects',
      '20 collaborators',
      '100,000 API calls/month',
      '10GB storage',
      'Templates & plugins',
      'Custom domains',
      'Priority support',
      'Advanced analytics'
    ]
  }
};

export const FREE_PLAN_QUOTAS: PlanQuotas = {
  plan: 'solo',
  maxProjects: 3,
  maxCollaborators: 1,
  maxApiCallsPerMonth: 1000,
  maxStorageMb: 100,
  templatesEnabled: false,
  pluginsEnabled: false,
  prioritySupport: false,
  customDomains: false,
  advancedAnalytics: false
};