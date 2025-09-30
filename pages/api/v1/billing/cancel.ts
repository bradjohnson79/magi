import { NextApiRequest, NextApiResponse } from 'next';
import { getAuth } from '@clerk/nextjs/server';
import { BillingService } from '@/lib/services/billing';

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

    const billingService = BillingService.getInstance();

    // Check if user has an active subscription
    const subscription = await billingService.getUserActiveSubscription(userId);
    if (!subscription) {
      return res.status(404).json({
        error: 'Not Found',
        message: 'No active subscription found'
      });
    }

    if (subscription.cancelAtPeriodEnd) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'Subscription is already set to cancel at period end'
      });
    }

    // Cancel the subscription
    const canceledSubscription = await billingService.cancelSubscription(userId);

    res.status(200).json({
      success: true,
      message: 'Subscription canceled successfully',
      data: {
        subscription: {
          id: canceledSubscription.id,
          plan: canceledSubscription.plan,
          status: canceledSubscription.status,
          cancelAtPeriodEnd: canceledSubscription.cancelAtPeriodEnd,
          currentPeriodEnd: canceledSubscription.currentPeriodEnd
        },
        note: 'Your subscription will remain active until the end of your current billing period'
      }
    });

  } catch (error) {
    console.error('Cancel subscription API error:', error);

    if (error instanceof Error) {
      if (error.message.includes('No active subscription')) {
        return res.status(404).json({
          error: 'Not Found',
          message: error.message
        });
      }

      if (error.message.includes('already set to cancel')) {
        return res.status(409).json({
          error: 'Conflict',
          message: error.message
        });
      }
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to cancel subscription'
    });
  }
}