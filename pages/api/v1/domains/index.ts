import { NextApiRequest, NextApiResponse } from 'next';
import { DomainsService } from '@/lib/services/domains';
import { requireAuth } from '@/lib/auth';
import { sanitizeInput } from '@/lib/utils/validation';

interface CreateDomainRequest {
  domain: string;
  projectId: string;
  domainType?: 'subdomain' | 'custom';
  provider?: 'vercel' | 'netlify' | 'cloudflare' | 'letsencrypt';
  redirectTo?: string;
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const domainsService = DomainsService.getInstance();

  switch (req.method) {
    case 'GET':
      return handleGetDomains(req, res, domainsService);
    case 'POST':
      return handleCreateDomain(req, res, domainsService);
    default:
      res.setHeader('Allow', ['GET', 'POST']);
      return res.status(405).json({ error: `Method ${req.method} not allowed` });
  }
}

async function handleGetDomains(
  req: NextApiRequest,
  res: NextApiResponse,
  domainsService: DomainsService
) {
  try {
    const { projectId } = req.query;

    if (!projectId || typeof projectId !== 'string') {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    const domains = await domainsService.getProjectDomains(projectId);

    // Format response with additional computed fields
    const formattedDomains = domains.map(domain => ({
      ...domain,
      url: `https://${domain.domain}`,
      status: getDisplayStatus(domain),
      verificationInstructions: domain.domainType === 'custom' && !domain.verified
        ? domainsService.getDomainVerificationInstructions(domain)
        : null
    }));

    return res.status(200).json(formattedDomains);
  } catch (error) {
    console.error('Failed to fetch domains:', error);
    return res.status(500).json({ error: 'Failed to fetch domains' });
  }
}

async function handleCreateDomain(
  req: NextApiRequest,
  res: NextApiResponse,
  domainsService: DomainsService
) {
  try {
    const data: CreateDomainRequest = req.body;

    // Validate required fields
    if (!data.domain || !data.projectId) {
      return res.status(400).json({ error: 'Domain and project ID are required' });
    }

    // Sanitize inputs
    const sanitizedData = {
      domain: sanitizeInput(data.domain.toLowerCase().trim()),
      projectId: sanitizeInput(data.projectId),
      domainType: data.domainType || 'custom',
      provider: data.provider || 'vercel',
      redirectTo: data.redirectTo ? sanitizeInput(data.redirectTo) : undefined,
    };

    // Validate domain format for custom domains
    if (sanitizedData.domainType === 'custom') {
      const validation = validateCustomDomain(sanitizedData.domain);
      if (!validation.valid) {
        return res.status(400).json({ error: validation.error });
      }
    }

    // Check if domain already exists
    const existingProject = await domainsService.findProjectByDomain(sanitizedData.domain);
    if (existingProject) {
      return res.status(409).json({ error: 'Domain already in use' });
    }

    // Create domain
    const domain = await domainsService.createDomain(sanitizedData);

    // For subdomains, automatically verify
    if (domain.domainType === 'subdomain') {
      await domainsService.verifyDomain(domain.id);
    }

    // Return created domain with additional fields
    const response = {
      ...domain,
      url: `https://${domain.domain}`,
      status: getDisplayStatus(domain),
      verificationInstructions: domain.domainType === 'custom' && !domain.verified
        ? domainsService.getDomainVerificationInstructions(domain)
        : null
    };

    return res.status(201).json(response);
  } catch (error) {
    console.error('Failed to create domain:', error);

    if (error instanceof Error) {
      if (error.message.includes('already exists')) {
        return res.status(409).json({ error: 'Domain already exists' });
      }
      if (error.message.includes('invalid')) {
        return res.status(400).json({ error: error.message });
      }
    }

    return res.status(500).json({ error: 'Failed to create domain' });
  }
}

function validateCustomDomain(domain: string): { valid: boolean; error?: string } {
  // Basic domain validation
  const domainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

  if (!domainRegex.test(domain)) {
    return { valid: false, error: 'Invalid domain format' };
  }

  // Check against blocked domains
  const blockedDomains = [
    'magi.dev',
    'localhost',
    'example.com',
    '127.0.0.1',
    'vercel.app',
    'netlify.app',
    'herokuapp.com'
  ];

  if (blockedDomains.some(blocked => domain.endsWith(blocked))) {
    return { valid: false, error: 'Domain not allowed' };
  }

  // Check length limits
  if (domain.length > 253) {
    return { valid: false, error: 'Domain too long (max 253 characters)' };
  }

  // Check for minimum length
  if (domain.length < 4) {
    return { valid: false, error: 'Domain too short (min 4 characters)' };
  }

  // Check for valid TLD
  const parts = domain.split('.');
  if (parts.length < 2) {
    return { valid: false, error: 'Domain must have a valid TLD' };
  }

  const tld = parts[parts.length - 1];
  if (tld.length < 2) {
    return { valid: false, error: 'Invalid TLD' };
  }

  return { valid: true };
}

function getDisplayStatus(domain: any): string {
  if (domain.domainType === 'subdomain') {
    return 'Active';
  }

  if (!domain.verified) {
    return 'Pending Verification';
  }

  if (domain.sslStatus === 'failed') {
    return 'SSL Failed';
  }

  if (domain.sslStatus === 'issued') {
    return 'Active';
  }

  if (domain.sslStatus === 'pending') {
    return 'Issuing SSL';
  }

  return 'Unknown';
}

export default requireAuth(handler);