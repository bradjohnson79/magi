import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { createMocks } from 'node-mocks-http';
import { NextApiRequest, NextApiResponse } from 'next';
import subscribeHandler from '@/pages/api/v1/billing/subscribe';
import cancelHandler from '@/pages/api/v1/billing/cancel';
import webhookHandler from '@/pages/api/v1/billing/webhook';

// Mock dependencies
jest.mock('@clerk/nextjs/server', () => ({
  getAuth: jest.fn()
}));

jest.mock('@/lib/services/billing', () => ({
  BillingService: {
    getInstance: jest.fn()
  }
}));

jest.mock('@/lib/services/stripe', () => ({
  StripeService: {
    getInstance: jest.fn()
  }
}));

const mockAuth = require('@clerk/nextjs/server').getAuth;
const mockBillingService = require('@/lib/services/billing').BillingService;
const mockStripeService = require('@/lib/services/stripe').StripeService;

describe('Billing API Endpoints', () => {
  let mockBilling: any;
  let mockStripe: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockBilling = {
      getUserActiveSubscription: jest.fn(),
      createCheckoutSession: jest.fn(),
      cancelSubscription: jest.fn(),
      upsertSubscriptionFromStripe: jest.fn(),
      getSubscriptionByStripeId: jest.fn(),
      recordBillingEvent: jest.fn()
    };

    mockStripe = {
      verifyWebhookSignature: jest.fn(),
      getSubscription: jest.fn(),
      getCustomer: jest.fn()
    };

    mockBillingService.getInstance.mockReturnValue(mockBilling);
    mockStripeService.getInstance.mockReturnValue(mockStripe);
  });

  describe('POST /api/v1/billing/subscribe', () => {
    test('should create checkout session successfully', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockSession = {
        sessionId: 'cs_test123',
        url: 'https://checkout.stripe.com/cs_test123'
      };

      mockBilling.getUserActiveSubscription.mockResolvedValue(null);
      mockBilling.createCheckoutSession.mockResolvedValue(mockSession);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          plan: 'teams',
          userEmail: 'test@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        }
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.data.sessionId).toBe('cs_test123');
    });

    test('should return 401 when user not authenticated', async () => {
      mockAuth.mockReturnValue({ userId: null });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          plan: 'solo',
          userEmail: 'test@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        }
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Unauthorized');
    });

    test('should return 409 when user already has subscription', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const existingSubscription = {
        id: 'sub_123',
        plan: 'solo',
        status: 'active'
      };

      mockBilling.getUserActiveSubscription.mockResolvedValue(existingSubscription);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          plan: 'teams',
          userEmail: 'test@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        }
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Conflict');
    });

    test('should return 400 for invalid plan', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          plan: 'invalid-plan',
          userEmail: 'test@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        }
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('Invalid plan');
    });

    test('should return 400 for missing required fields', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          plan: 'teams'
          // Missing successUrl, cancelUrl, userEmail
        }
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Bad Request');
    });

    test('should return 405 for non-POST methods', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET'
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res.getHeader('Allow')).toEqual(['POST']);
    });
  });

  describe('POST /api/v1/billing/cancel', () => {
    test('should cancel subscription successfully', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const subscription = {
        id: 'sub_123',
        plan: 'teams',
        status: 'active',
        cancelAtPeriodEnd: false,
        currentPeriodEnd: new Date('2024-02-01')
      };

      const canceledSubscription = {
        ...subscription,
        cancelAtPeriodEnd: true
      };

      mockBilling.getUserActiveSubscription.mockResolvedValue(subscription);
      mockBilling.cancelSubscription.mockResolvedValue(canceledSubscription);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST'
      });

      await cancelHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.data.subscription.cancelAtPeriodEnd).toBe(true);
    });

    test('should return 404 when no active subscription', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });
      mockBilling.getUserActiveSubscription.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST'
      });

      await cancelHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Not Found');
    });

    test('should return 409 when subscription already canceled', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const subscription = {
        id: 'sub_123',
        cancelAtPeriodEnd: true
      };

      mockBilling.getUserActiveSubscription.mockResolvedValue(subscription);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST'
      });

      await cancelHandler(req, res);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Conflict');
    });
  });

  describe('POST /api/v1/billing/webhook', () => {
    const mockEvent = {
      id: 'evt_test123',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_test123',
          subscription: 'sub_test123',
          amount_paid: 5900
        }
      }
    };

    beforeEach(() => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test123';
    });

    test('should process webhook successfully', async () => {
      mockStripe.verifyWebhookSignature.mockReturnValue(mockEvent);
      mockBilling.recordBillingEvent.mockResolvedValue({});

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'stripe-signature': 'test-signature'
        },
        body: Buffer.from(JSON.stringify(mockEvent))
      });

      // Mock buffer for webhook
      require('micro').buffer = jest.fn().mockResolvedValue(Buffer.from(JSON.stringify(mockEvent)));

      await webhookHandler(req, res);

      expect(mockStripe.verifyWebhookSignature).toHaveBeenCalled();
      expect(mockBilling.recordBillingEvent).toHaveBeenCalledWith(
        'evt_test123',
        'invoice.paid',
        mockEvent.data,
        undefined
      );

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
    });

    test('should handle checkout.session.completed event', async () => {
      const checkoutEvent = {
        id: 'evt_checkout123',
        type: 'checkout.session.completed',
        data: {
          object: {
            mode: 'subscription',
            subscription: 'sub_test123',
            customer: 'cus_test123'
          }
        }
      };

      const mockSubscription = {
        id: 'sub_test123',
        customer: 'cus_test123',
        status: 'active'
      };

      const mockCustomer = {
        metadata: { userId: 'user123' }
      };

      mockStripe.verifyWebhookSignature.mockReturnValue(checkoutEvent);
      mockStripe.getSubscription.mockResolvedValue(mockSubscription);
      mockStripe.getCustomer.mockResolvedValue(mockCustomer);
      mockBilling.upsertSubscriptionFromStripe.mockResolvedValue({});
      mockBilling.recordBillingEvent.mockResolvedValue({});

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'stripe-signature': 'test-signature'
        }
      });

      require('micro').buffer = jest.fn().mockResolvedValue(Buffer.from(JSON.stringify(checkoutEvent)));

      await webhookHandler(req, res);

      expect(mockStripe.getSubscription).toHaveBeenCalledWith('sub_test123');
      expect(mockStripe.getCustomer).toHaveBeenCalledWith('cus_test123');
      expect(mockBilling.upsertSubscriptionFromStripe).toHaveBeenCalledWith(mockSubscription, 'user123');

      expect(res._getStatusCode()).toBe(200);
    });

    test('should handle customer.subscription.updated event', async () => {
      const subscriptionEvent = {
        id: 'evt_sub123',
        type: 'customer.subscription.updated',
        data: {
          object: {
            id: 'sub_test123',
            status: 'active'
          }
        }
      };

      mockStripe.verifyWebhookSignature.mockReturnValue(subscriptionEvent);
      mockBilling.upsertSubscriptionFromStripe.mockResolvedValue({});
      mockBilling.recordBillingEvent.mockResolvedValue({});

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'stripe-signature': 'test-signature'
        }
      });

      require('micro').buffer = jest.fn().mockResolvedValue(Buffer.from(JSON.stringify(subscriptionEvent)));

      await webhookHandler(req, res);

      expect(mockBilling.upsertSubscriptionFromStripe).toHaveBeenCalledWith(subscriptionEvent.data.object);
      expect(res._getStatusCode()).toBe(200);
    });

    test('should handle invoice.payment_failed event', async () => {
      const failedEvent = {
        id: 'evt_failed123',
        type: 'invoice.payment_failed',
        data: {
          object: {
            subscription: 'sub_test123'
          }
        }
      };

      const mockSubscription = {
        id: 'sub_test123',
        status: 'past_due'
      };

      mockStripe.verifyWebhookSignature.mockReturnValue(failedEvent);
      mockStripe.getSubscription.mockResolvedValue(mockSubscription);
      mockBilling.upsertSubscriptionFromStripe.mockResolvedValue({});
      mockBilling.recordBillingEvent.mockResolvedValue({});

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'stripe-signature': 'test-signature'
        }
      });

      require('micro').buffer = jest.fn().mockResolvedValue(Buffer.from(JSON.stringify(failedEvent)));

      await webhookHandler(req, res);

      expect(mockStripe.getSubscription).toHaveBeenCalledWith('sub_test123');
      expect(mockBilling.upsertSubscriptionFromStripe).toHaveBeenCalledWith(mockSubscription);
      expect(res._getStatusCode()).toBe(200);
    });

    test('should return 400 for missing signature', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {}
      });

      await webhookHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('Missing Stripe signature');
    });

    test('should return 400 for invalid signature', async () => {
      mockStripe.verifyWebhookSignature.mockImplementation(() => {
        throw new Error('Invalid webhook signature');
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'stripe-signature': 'invalid-signature'
        }
      });

      require('micro').buffer = jest.fn().mockResolvedValue(Buffer.from('test'));

      await webhookHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('Invalid webhook signature');
    });

    test('should return 500 when webhook secret not configured', async () => {
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        headers: {
          'stripe-signature': 'test-signature'
        }
      });

      require('micro').buffer = jest.fn().mockResolvedValue(Buffer.from('test'));

      await webhookHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('Webhook secret not configured');
    });

    test('should return 405 for non-POST methods', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET'
      });

      await webhookHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res.getHeader('Allow')).toEqual(['POST']);
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });
      mockBilling.getUserActiveSubscription.mockRejectedValue(new Error('Database connection failed'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          plan: 'teams',
          userEmail: 'test@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        }
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Internal Server Error');
    });

    test('should handle Stripe API errors', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });
      mockBilling.getUserActiveSubscription.mockResolvedValue(null);
      mockBilling.createCheckoutSession.mockRejectedValue(new Error('Stripe API error'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: {
          plan: 'teams',
          userEmail: 'test@example.com',
          successUrl: 'https://example.com/success',
          cancelUrl: 'https://example.com/cancel'
        }
      });

      await subscribeHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('Failed to create checkout session');
    });
  });
});