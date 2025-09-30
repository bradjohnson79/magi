import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { BillingService } from '@/lib/services/billing';
import { StripeService } from '@/lib/services/stripe';
import { Database } from '@/lib/database';
import { SubscriptionPlan, SubscriptionStatus } from '@/lib/types/billing';

// Mock dependencies
jest.mock('@/lib/database');
jest.mock('@/lib/services/stripe');

const mockDb = {
  query: jest.fn(),
} as unknown as Database;

const mockStripe = {
  getOrCreateCustomer: jest.fn(),
  createCheckoutSession: jest.fn(),
  createBillingPortalSession: jest.fn(),
  cancelSubscription: jest.fn(),
  reactivateSubscription: jest.fn(),
  getCustomer: jest.fn(),
} as unknown as StripeService;

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock static getInstance methods
    (Database.getInstance as jest.Mock).mockReturnValue(mockDb);
    (StripeService.getInstance as jest.Mock).mockReturnValue(mockStripe);

    service = BillingService.getInstance();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createCheckoutSession', () => {
    test('should create checkout session successfully', async () => {
      const mockCustomer = { id: 'cus_test123' };
      const mockSession = {
        sessionId: 'cs_test123',
        url: 'https://checkout.stripe.com/pay/cs_test123'
      };

      (mockStripe.getOrCreateCustomer as jest.Mock).mockResolvedValue(mockCustomer);
      (mockStripe.createCheckoutSession as jest.Mock).mockResolvedValue(mockSession);

      const request = {
        plan: 'teams' as SubscriptionPlan,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      };

      const result = await service.createCheckoutSession('user123', 'user@example.com', request);

      expect(mockStripe.getOrCreateCustomer).toHaveBeenCalledWith('user@example.com', 'user123');
      expect(mockStripe.createCheckoutSession).toHaveBeenCalledWith('cus_test123', request);
      expect(result).toEqual(mockSession);
    });

    test('should handle Stripe errors', async () => {
      (mockStripe.getOrCreateCustomer as jest.Mock).mockRejectedValue(new Error('Stripe error'));

      const request = {
        plan: 'solo' as SubscriptionPlan,
        successUrl: 'https://example.com/success',
        cancelUrl: 'https://example.com/cancel'
      };

      await expect(
        service.createCheckoutSession('user123', 'user@example.com', request)
      ).rejects.toThrow('Failed to create checkout session');
    });
  });

  describe('getUserActiveSubscription', () => {
    test('should return active subscription', async () => {
      const mockSubscription = {
        id: 'sub_123',
        user_id: 'user123',
        stripe_subscription_id: 'sub_stripe123',
        stripe_customer_id: 'cus_test123',
        plan: 'teams',
        status: 'active',
        current_period_start: new Date('2024-01-01'),
        current_period_end: new Date('2024-02-01'),
        cancel_at_period_end: false,
        created_at: new Date('2024-01-01'),
        updated_at: new Date('2024-01-01')
      };

      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [mockSubscription] });

      const result = await service.getUserActiveSubscription('user123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM subscriptions'),
        ['user123']
      );
      expect(result).toBeDefined();
      expect(result?.plan).toBe('teams');
      expect(result?.status).toBe('active');
    });

    test('should return null when no active subscription', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await service.getUserActiveSubscription('user123');

      expect(result).toBeNull();
    });
  });

  describe('cancelSubscription', () => {
    test('should cancel subscription successfully', async () => {
      const mockSubscription = {
        id: 'sub_123',
        stripeSubscriptionId: 'sub_stripe123',
        stripeCustomerId: 'cus_test123',
        plan: 'teams',
        status: 'active',
        cancelAtPeriodEnd: false
      };

      const mockUpdatedSubscription = {
        ...mockSubscription,
        cancel_at_period_end: true
      };

      // Mock getting current subscription
      service.getUserActiveSubscription = jest.fn().mockResolvedValue(mockSubscription);

      (mockStripe.cancelSubscription as jest.Mock).mockResolvedValue({});
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [mockUpdatedSubscription] });

      const result = await service.cancelSubscription('user123');

      expect(mockStripe.cancelSubscription).toHaveBeenCalledWith('sub_stripe123');
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE subscriptions'),
        ['sub_123']
      );
      expect(result.cancelAtPeriodEnd).toBe(true);
    });

    test('should throw error when no active subscription', async () => {
      service.getUserActiveSubscription = jest.fn().mockResolvedValue(null);

      await expect(service.cancelSubscription('user123')).rejects.toThrow('No active subscription found');
    });
  });

  describe('upsertSubscriptionFromStripe', () => {
    test('should create new subscription from Stripe data', async () => {
      const stripeSubscription = {
        id: 'sub_stripe123',
        customer: 'cus_test123',
        status: 'active',
        current_period_start: 1704067200, // 2024-01-01
        current_period_end: 1706745600,   // 2024-02-01
        cancel_at_period_end: false,
        metadata: { plan: 'teams' }
      };

      const mockDbSubscription = {
        id: 'sub_123',
        user_id: 'user123',
        stripe_subscription_id: 'sub_stripe123',
        plan: 'teams',
        status: 'active'
      };

      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [mockDbSubscription] });

      const result = await service.upsertSubscriptionFromStripe(stripeSubscription, 'user123');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO subscriptions'),
        expect.arrayContaining(['user123', 'sub_stripe123', 'cus_test123', 'teams', 'active'])
      );
      expect(result).toBeDefined();
    });

    test('should get user ID from customer metadata when not provided', async () => {
      const stripeSubscription = {
        id: 'sub_stripe123',
        customer: 'cus_test123',
        status: 'active',
        current_period_start: 1704067200,
        current_period_end: 1706745600,
        cancel_at_period_end: false,
        metadata: { plan: 'solo' }
      };

      const mockCustomer = {
        metadata: { userId: 'user123' }
      };

      (mockStripe.getCustomer as jest.Mock).mockResolvedValue(mockCustomer);
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [{}] });

      await service.upsertSubscriptionFromStripe(stripeSubscription);

      expect(mockStripe.getCustomer).toHaveBeenCalledWith('cus_test123');
    });
  });

  describe('getUserQuotaUsage', () => {
    test('should return quota usage data', async () => {
      const mockQuotaData = {
        current_projects: 5,
        current_collaborators: 3,
        current_api_calls: 1500,
        current_storage_mb: 500,
        max_projects: 100,
        max_collaborators: 20,
        max_api_calls_per_month: 100000,
        max_storage_mb: 10240
      };

      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [mockQuotaData] });

      const result = await service.getUserQuotaUsage('user123');

      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM get_user_quota_usage($1)',
        ['user123']
      );
      expect(result.currentProjects).toBe(5);
      expect(result.maxProjects).toBe(100);
    });

    test('should return free plan quotas when no data', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await service.getUserQuotaUsage('user123');

      expect(result.currentProjects).toBe(0);
      expect(result.maxProjects).toBe(3); // FREE_PLAN_QUOTAS
    });
  });

  describe('checkFeatureAccess', () => {
    test('should return true for accessible features', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [{ has_access: true }] });

      const result = await service.checkFeatureAccess('user123', 'templates');

      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT check_plan_feature_access($1, $2) as has_access',
        ['user123', 'templates']
      );
      expect(result).toBe(true);
    });

    test('should return false for inaccessible features', async () => {
      (mockDb.query as jest.Mock).mockResolvedValue({ rows: [{ has_access: false }] });

      const result = await service.checkFeatureAccess('user123', 'plugins');

      expect(result).toBe(false);
    });

    test('should return false on database error', async () => {
      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await service.checkFeatureAccess('user123', 'templates');

      expect(result).toBe(false);
    });
  });

  describe('trackUsage', () => {
    test('should track usage successfully', async () => {
      const subscription = {
        id: 'sub_123',
        plan: 'teams',
        status: 'active'
      };

      service.getUserActiveSubscription = jest.fn().mockResolvedValue(subscription);
      (mockDb.query as jest.Mock).mockResolvedValue({});

      const usage = {
        projectsCreated: 1,
        apiCalls: 10,
        storageUsedMb: 50
      };

      await service.trackUsage('user123', usage);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO usage_tracking'),
        expect.arrayContaining(['user123', 'sub_123', 1, 10, 50])
      );
    });

    test('should not throw error on tracking failure', async () => {
      service.getUserActiveSubscription = jest.fn().mockResolvedValue(null);
      (mockDb.query as jest.Mock).mockRejectedValue(new Error('Database error'));

      // Should not throw
      await expect(service.trackUsage('user123', { projectsCreated: 1 })).resolves.toBeUndefined();
    });
  });
});