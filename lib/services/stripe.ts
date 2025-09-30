import Stripe from 'stripe';
import {
  SubscriptionPlan,
  CheckoutSession,
  CreateCheckoutSessionRequest,
  BillingPortalSession,
  PLAN_DETAILS
} from '@/lib/types/billing';

export class StripeService {
  private static instance: StripeService;
  private stripe: Stripe;

  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2024-06-20',
      typescript: true,
    });
  }

  static getInstance(): StripeService {
    if (!StripeService.instance) {
      StripeService.instance = new StripeService();
    }
    return StripeService.instance;
  }

  /**
   * Create a Stripe customer
   */
  async createCustomer(
    email: string,
    userId: string,
    name?: string
  ): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
        },
      });

      return customer;
    } catch (error) {
      console.error('Error creating Stripe customer:', error);
      throw new Error('Failed to create customer');
    }
  }

  /**
   * Get or create a Stripe customer
   */
  async getOrCreateCustomer(
    email: string,
    userId: string,
    name?: string
  ): Promise<Stripe.Customer> {
    try {
      // First, try to find existing customer by email
      const existingCustomers = await this.stripe.customers.list({
        email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        const customer = existingCustomers.data[0];

        // Update metadata if userId is missing
        if (!customer.metadata?.userId) {
          await this.stripe.customers.update(customer.id, {
            metadata: {
              ...customer.metadata,
              userId,
            },
          });
        }

        return customer;
      }

      // Create new customer if none exists
      return await this.createCustomer(email, userId, name);
    } catch (error) {
      console.error('Error getting or creating customer:', error);
      throw new Error('Failed to get or create customer');
    }
  }

  /**
   * Create a checkout session for subscription
   */
  async createCheckoutSession(
    customerId: string,
    request: CreateCheckoutSessionRequest
  ): Promise<CheckoutSession> {
    try {
      const planDetails = PLAN_DETAILS[request.plan];
      if (!planDetails) {
        throw new Error(`Invalid plan: ${request.plan}`);
      }

      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        mode: 'subscription',
        line_items: [
          {
            price: planDetails.stripePriceId,
            quantity: 1,
          },
        ],
        success_url: request.successUrl,
        cancel_url: request.cancelUrl,
        metadata: {
          plan: request.plan,
        },
        subscription_data: {
          metadata: {
            plan: request.plan,
          },
        },
        allow_promotion_codes: true,
        billing_address_collection: 'required',
        tax_id_collection: {
          enabled: true,
        },
      });

      if (!session.url) {
        throw new Error('Failed to create checkout session URL');
      }

      return {
        sessionId: session.id,
        url: session.url,
      };
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw new Error('Failed to create checkout session');
    }
  }

  /**
   * Create a billing portal session
   */
  async createBillingPortalSession(
    customerId: string,
    returnUrl: string
  ): Promise<BillingPortalSession> {
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });

      return {
        url: session.url,
      };
    } catch (error) {
      console.error('Error creating billing portal session:', error);
      throw new Error('Failed to create billing portal session');
    }
  }

  /**
   * Cancel a subscription at period end
   */
  async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true,
      });

      return subscription;
    } catch (error) {
      console.error('Error canceling subscription:', error);
      throw new Error('Failed to cancel subscription');
    }
  }

  /**
   * Reactivate a canceled subscription
   */
  async reactivateSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      return subscription;
    } catch (error) {
      console.error('Error reactivating subscription:', error);
      throw new Error('Failed to reactivate subscription');
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      console.error('Error retrieving subscription:', error);
      throw new Error('Failed to retrieve subscription');
    }
  }

  /**
   * Get customer details
   */
  async getCustomer(customerId: string): Promise<Stripe.Customer> {
    try {
      const customer = await this.stripe.customers.retrieve(customerId);

      if (customer.deleted) {
        throw new Error('Customer has been deleted');
      }

      return customer as Stripe.Customer;
    } catch (error) {
      console.error('Error retrieving customer:', error);
      throw new Error('Failed to retrieve customer');
    }
  }

  /**
   * Update subscription plan
   */
  async updateSubscriptionPlan(
    subscriptionId: string,
    newPlan: SubscriptionPlan
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      const newPlanDetails = PLAN_DETAILS[newPlan];

      if (!newPlanDetails) {
        throw new Error(`Invalid plan: ${newPlan}`);
      }

      const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPlanDetails.stripePriceId,
          },
        ],
        metadata: {
          plan: newPlan,
        },
      });

      return updatedSubscription;
    } catch (error) {
      console.error('Error updating subscription plan:', error);
      throw new Error('Failed to update subscription plan');
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(
    payload: string | Buffer,
    signature: string,
    secret: string
  ): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(payload, signature, secret);
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw new Error('Invalid webhook signature');
    }
  }

  /**
   * Get upcoming invoice for a customer
   */
  async getUpcomingInvoice(customerId: string): Promise<Stripe.Invoice | null> {
    try {
      return await this.stripe.invoices.retrieveUpcoming({
        customer: customerId,
      });
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError && error.code === 'invoice_upcoming_none') {
        return null;
      }
      console.error('Error retrieving upcoming invoice:', error);
      throw new Error('Failed to retrieve upcoming invoice');
    }
  }

  /**
   * List customer invoices
   */
  async getCustomerInvoices(
    customerId: string,
    limit: number = 10
  ): Promise<Stripe.Invoice[]> {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit,
      });

      return invoices.data;
    } catch (error) {
      console.error('Error retrieving customer invoices:', error);
      throw new Error('Failed to retrieve customer invoices');
    }
  }

  /**
   * Create a usage record for metered billing
   */
  async createUsageRecord(
    subscriptionItemId: string,
    quantity: number,
    timestamp?: number
  ): Promise<Stripe.UsageRecord> {
    try {
      return await this.stripe.subscriptionItems.createUsageRecord(subscriptionItemId, {
        quantity,
        timestamp: timestamp || Math.floor(Date.now() / 1000),
        action: 'increment',
      });
    } catch (error) {
      console.error('Error creating usage record:', error);
      throw new Error('Failed to create usage record');
    }
  }

  /**
   * Get Stripe publishable key
   */
  getPublishableKey(): string {
    const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
    if (!key) {
      throw new Error('NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY environment variable is required');
    }
    return key;
  }

  /**
   * Format amount for display
   */
  formatAmount(amount: number, currency: string = 'usd'): string {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount / 100);
  }

  /**
   * Get price details for a plan
   */
  getPlanPrice(plan: SubscriptionPlan): { amount: number; currency: string } {
    const planDetails = PLAN_DETAILS[plan];
    return {
      amount: planDetails.price * 100, // Convert to cents
      currency: 'usd',
    };
  }
}