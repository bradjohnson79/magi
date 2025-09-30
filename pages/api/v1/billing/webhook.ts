import { NextApiRequest, NextApiResponse } from 'next';
import { buffer } from 'micro';
import { StripeService } from '@/lib/services/stripe';
import { BillingService } from '@/lib/services/billing';

// Disable body parsing for webhook
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({
      error: 'Method Not Allowed',
      message: 'Only POST method is allowed'
    });
  }

  try {
    const stripeService = StripeService.getInstance();
    const billingService = BillingService.getInstance();

    // Get the raw body
    const buf = await buffer(req);
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Missing Stripe signature'
      });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('STRIPE_WEBHOOK_SECRET not configured');
      return res.status(500).json({
        error: 'Internal Server Error',
        message: 'Webhook secret not configured'
      });
    }

    // Verify the webhook signature
    const event = stripeService.verifyWebhookSignature(buf, signature, webhookSecret);

    console.log(`Received Stripe webhook: ${event.type} (${event.id})`);

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as any;

        if (session.mode === 'subscription' && session.subscription) {
          // Get the subscription and customer details
          const subscription = await stripeService.getSubscription(session.subscription);
          const customer = await stripeService.getCustomer(session.customer);

          const userId = customer.metadata?.userId;
          if (!userId) {
            console.error('User ID not found in customer metadata');
            break;
          }

          // Create subscription in our database
          await billingService.upsertSubscriptionFromStripe(subscription, userId);

          console.log(`Created subscription for user ${userId}: ${subscription.id}`);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as any;

        // Update subscription in our database
        await billingService.upsertSubscriptionFromStripe(subscription);

        console.log(`Updated subscription: ${subscription.id}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as any;

        // Mark subscription as canceled in our database
        const dbSubscription = await billingService.getSubscriptionByStripeId(subscription.id);
        if (dbSubscription) {
          await billingService.upsertSubscriptionFromStripe({
            ...subscription,
            status: 'canceled'
          });
        }

        console.log(`Canceled subscription: ${subscription.id}`);
        break;
      }

      case 'invoice.paid': {
        const invoice = event.data.object as any;

        if (invoice.subscription) {
          // Get subscription details
          const subscription = await stripeService.getSubscription(invoice.subscription);

          // Update subscription status to active if it was past_due
          if (subscription.status === 'active') {
            await billingService.upsertSubscriptionFromStripe(subscription);
          }

          console.log(`Invoice paid for subscription: ${invoice.subscription}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as any;

        if (invoice.subscription) {
          // Get subscription details
          const subscription = await stripeService.getSubscription(invoice.subscription);

          // Update subscription status
          await billingService.upsertSubscriptionFromStripe(subscription);

          console.log(`Invoice payment failed for subscription: ${invoice.subscription}`);

          // Here you could add logic to:
          // - Send notification emails
          // - Update user permissions
          // - Schedule account suspension
        }
        break;
      }

      case 'customer.subscription.trial_will_end': {
        const subscription = event.data.object as any;

        console.log(`Trial ending soon for subscription: ${subscription.id}`);

        // Here you could add logic to:
        // - Send trial ending notifications
        // - Prompt for payment method
        break;
      }

      default:
        console.log(`Unhandled webhook event type: ${event.type}`);
        break;
    }

    // Record the billing event for audit purposes
    const dbSubscription = event.data.object.subscription
      ? await billingService.getSubscriptionByStripeId(event.data.object.subscription)
      : null;

    await billingService.recordBillingEvent(
      event.id,
      event.type,
      event.data,
      dbSubscription?.id
    );

    res.status(200).json({
      success: true,
      message: 'Webhook processed successfully',
      eventType: event.type,
      eventId: event.id
    });

  } catch (error) {
    console.error('Webhook processing error:', error);

    if (error instanceof Error) {
      if (error.message.includes('Invalid webhook signature')) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Invalid webhook signature'
        });
      }
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to process webhook'
    });
  }
}