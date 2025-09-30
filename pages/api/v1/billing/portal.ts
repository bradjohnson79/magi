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

    const { returnUrl } = req.body;

    if (!returnUrl) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Return URL is required'
      });
    }

    // Validate return URL
    try {
      new URL(returnUrl);
    } catch {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid return URL'
      });
    }

    const billingService = BillingService.getInstance();

    // Create billing portal session
    const portalSession = await billingService.createBillingPortalSession(userId, returnUrl);

    res.status(200).json({
      success: true,
      message: 'Billing portal session created successfully',
      data: {
        url: portalSession.url
      }
    });

  } catch (error) {
    console.error('Billing portal API error:', error);

    if (error instanceof Error) {
      if (error.message.includes('No active subscription')) {
        return res.status(404).json({
          error: 'Not Found',
          message: 'No active subscription found'
        });
      }
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to create billing portal session'
    });
  }
}