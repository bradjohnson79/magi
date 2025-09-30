import { NextApiRequest, NextApiResponse } from 'next';
import { DomainsService } from '@/lib/services/domains';
import { requireAuth } from '@/lib/auth';

interface VerifyDomainRequest {
  domainId: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }

  try {
    const { domainId }: VerifyDomainRequest = req.body;

    if (!domainId) {
      return res.status(400).json({ error: 'Domain ID is required' });
    }

    const domainsService = DomainsService.getInstance();

    // Get domain details
    const domain = await domainsService.getDomainById(domainId);
    if (!domain) {
      return res.status(404).json({ error: 'Domain not found' });
    }

    // Perform verification
    const verificationResult = await domainsService.verifyDomain(domainId);

    if (verificationResult.verified) {
      // Get updated domain with verification status
      const updatedDomain = await domainsService.getDomainById(domainId);

      return res.status(200).json({
        verified: true,
        domain: updatedDomain,
        message: 'Domain successfully verified'
      });
    } else {
      // Return verification instructions if not verified
      const instructions = domainsService.getDomainVerificationInstructions(domain);

      return res.status(400).json({
        verified: false,
        error: verificationResult.error || 'Verification failed',
        instructions,
        retryAfter: 30 // Suggest retry after 30 seconds
      });
    }
  } catch (error) {
    console.error('Domain verification error:', error);

    if (error instanceof Error) {
      if (error.message.includes('not found')) {
        return res.status(404).json({ error: 'Domain not found' });
      }
      if (error.message.includes('already verified')) {
        return res.status(400).json({ error: 'Domain already verified' });
      }
    }

    return res.status(500).json({ error: 'Domain verification failed' });
  }
}

export default requireAuth(handler);