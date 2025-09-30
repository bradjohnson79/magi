import { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { BillingService } from '@/lib/services/billing';
import { CreateCheckoutSessionRequest, SubscriptionPlan } from '@/lib/types/billing';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { userId } = getAuth(req);

    if (!userId) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'User not authenticated'
      });
    }

    if (req.method !== 'POST') {
      res.setHeader('Allow', ['POST']);
      return res.status(405).json({
        error: 'Method Not Allowed',
        message: 'Only POST method is allowed'
      });
    }

    const { plan, successUrl, cancelUrl } = req.body;

    // Validate required fields
    if (!plan) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Plan is required'
      });
    }

    if (!successUrl || !cancelUrl) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Success URL and cancel URL are required'
      });
    }

    // Validate plan
    if (!['solo', 'teams'].includes(plan)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid plan. Must be "solo" or "teams"'
      });
    }

    // Validate URLs
    try {
      new URL(successUrl);
      new URL(cancelUrl);
    } catch {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid URLs provided'
      });
    }

    const billingService = BillingService.getInstance();

    // Check if user already has an active subscription
    const existingSubscription = await billingService.getUserActiveSubscription(userId);
    if (existingSubscription) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User already has an active subscription'
      });
    }

    // Get user email (in a real app, you'd get this from your user service)
    // For now, we'll use a placeholder - you should integrate with your user service
    const userEmail = req.body.userEmail;
    if (!userEmail) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'User email is required'
      });
    }

    // Create checkout session
    const checkoutRequest: CreateCheckoutSessionRequest = {
      plan: plan as SubscriptionPlan,
      successUrl,
      cancelUrl
    };

    const session = await billingService.createCheckoutSession(
      userId,
      userEmail,
      checkoutRequest
    );

    res.status(200).json({
      success: true,
      message: 'Checkout session created successfully',
      data: {
        sessionId: session.sessionId,
        url: session.url,
        plan
      }
    });

  } catch (error) {
    console.error('Subscribe API error:', error);

    if (error instanceof Error) {
      if (error.message.includes('already has an active subscription')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
      }

      if (error.message.includes('Invalid plan')) {
        return res.status(400).json({
          error: 'Bad Request',
          message: error.message
        });
      }
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create checkout session'
    });
  }
}