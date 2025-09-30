import { createMocks } from 'node-mocks-http';
import handler from '@/pages/api/v1/domains/index';
import { NextApiRequest, NextApiResponse } from 'next';

// Mock the auth middleware
jest.mock('@/lib/auth', () => ({
  requireAuth: jest.fn((handler) => handler),
}));

// Mock the domains service
jest.mock('@/lib/services/domains', () => ({
  DomainsService: {
    getInstance: jest.fn(() => ({
      getProjectDomains: jest.fn(),
      createDomain: jest.fn(),
      findProjectByDomain: jest.fn(),
      getDomainVerificationInstructions: jest.fn(),
    })),
  },
}));

// Mock validation utility
jest.mock('@/lib/utils/validation', () => ({
  sanitizeInput: jest.fn((input) => input),
}));

import { DomainsService } from '@/lib/services/domains';

const mockDomainsService = DomainsService.getInstance() as jest.Mocked<any>;

describe('/api/v1/domains API handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/v1/domains', () => {
    it('returns domains for a project successfully', async () => {
      const mockDomains = [
        {
          id: 'domain-1',
          projectId: 'project-123',
          domain: 'app.magi.dev',
          domainType: 'subdomain',
          verified: true,
          sslStatus: 'issued',
          provider: 'vercel',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'domain-2',
          projectId: 'project-123',
          domain: 'example.com',
          domainType: 'custom',
          verified: false,
          sslStatus: 'pending',
          provider: 'vercel',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDomainsService.getProjectDomains.mockResolvedValue(mockDomains);
      mockDomainsService.getDomainVerificationInstructions.mockReturnValue({
        recordType: 'CNAME',
        name: '_magi-verify.example.com',
        value: 'abc123.domains.magi.dev',
        instructions: 'Add a CNAME record...',
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { projectId: 'project-123' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());

      expect(data).toHaveLength(2);
      expect(data[0]).toHaveProperty('url', 'https://app.magi.dev');
      expect(data[0]).toHaveProperty('status', 'Active');
      expect(data[1]).toHaveProperty('url', 'https://example.com');
      expect(data[1]).toHaveProperty('status');
      expect(data[1]).toHaveProperty('verificationInstructions');
    });

    it('returns 400 when project ID is missing', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: {},
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Project ID is required');
    });

    it('handles service errors', async () => {
      mockDomainsService.getProjectDomains.mockRejectedValue(new Error('Database error'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { projectId: 'project-123' },
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Failed to fetch domains');
    });
  });

  describe('POST /api/v1/domains', () => {
    it('creates a new custom domain successfully', async () => {
      const newDomain = {
        domain: 'example.com',
        projectId: 'project-123',
        domainType: 'custom',
        provider: 'vercel',
      };

      const createdDomain = {
        id: 'domain-new',
        projectId: 'project-123',
        domain: 'example.com',
        domainType: 'custom',
        verified: false,
        sslStatus: 'pending',
        provider: 'vercel',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDomainsService.findProjectByDomain.mockResolvedValue(null);
      mockDomainsService.createDomain.mockResolvedValue(createdDomain);
      mockDomainsService.getDomainVerificationInstructions.mockReturnValue({
        recordType: 'CNAME',
        name: '_magi-verify.example.com',
        value: 'abc123.domains.magi.dev',
        instructions: 'Add a CNAME record...',
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: newDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = JSON.parse(res._getData());

      expect(data.id).toBe('domain-new');
      expect(data.domain).toBe('example.com');
      expect(data.url).toBe('https://example.com');
      expect(data.verificationInstructions).toBeDefined();
      expect(mockDomainsService.createDomain).toHaveBeenCalledWith({
        domain: 'example.com',
        projectId: 'project-123',
        domainType: 'custom',
        provider: 'vercel',
        redirectTo: undefined,
      });
    });

    it('creates a subdomain and verifies it automatically', async () => {
      const newDomain = {
        domain: 'app.magi.dev',
        projectId: 'project-123',
        domainType: 'subdomain',
        provider: 'vercel',
      };

      const createdDomain = {
        id: 'domain-sub',
        projectId: 'project-123',
        domain: 'app.magi.dev',
        domainType: 'subdomain',
        verified: false,
        sslStatus: 'pending',
        provider: 'vercel',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDomainsService.findProjectByDomain.mockResolvedValue(null);
      mockDomainsService.createDomain.mockResolvedValue(createdDomain);
      mockDomainsService.verifyDomain.mockResolvedValue({ verified: true });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: newDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      expect(mockDomainsService.verifyDomain).toHaveBeenCalledWith('domain-sub');
    });

    it('validates required fields', async () => {
      const invalidDomain = {
        domain: 'example.com',
        // Missing projectId
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: invalidDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Domain and project ID are required');
    });

    it('validates custom domain format', async () => {
      const invalidDomain = {
        domain: 'invalid..domain',
        projectId: 'project-123',
        domainType: 'custom',
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: invalidDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Invalid domain format');
    });

    it('prevents duplicate domains', async () => {
      const newDomain = {
        domain: 'example.com',
        projectId: 'project-123',
        domainType: 'custom',
      };

      mockDomainsService.findProjectByDomain.mockResolvedValue({
        projectId: 'other-project',
        domain: { domain: 'example.com' },
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: newDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Domain already in use');
    });

    it('blocks reserved domains', async () => {
      const reservedDomain = {
        domain: 'magi.dev',
        projectId: 'project-123',
        domainType: 'custom',
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: reservedDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Domain not allowed');
    });

    it('handles creation errors', async () => {
      const newDomain = {
        domain: 'example.com',
        projectId: 'project-123',
        domainType: 'custom',
      };

      mockDomainsService.findProjectByDomain.mockResolvedValue(null);
      mockDomainsService.createDomain.mockRejectedValue(new Error('Database error'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: newDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Failed to create domain');
    });
  });

  describe('Input validation and sanitization', () => {
    it('sanitizes input data', async () => {
      const newDomain = {
        domain: 'example.com',
        projectId: 'project-123',
        domainType: 'custom',
        redirectTo: 'https://evil.com',
      };

      mockDomainsService.findProjectByDomain.mockResolvedValue(null);
      mockDomainsService.createDomain.mockResolvedValue({
        id: 'domain-new',
        domain: 'example.com',
        domainType: 'custom',
        redirectTo: 'https://evil.com',
      } as any);

      const { sanitizeInput } = require('@/lib/utils/validation');

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: newDomain,
      });

      await handler(req, res);

      expect(sanitizeInput).toHaveBeenCalledWith('example.com');
      expect(sanitizeInput).toHaveBeenCalledWith('project-123');
      expect(sanitizeInput).toHaveBeenCalledWith('https://evil.com');
    });

    it('validates domain length limits', async () => {
      const longDomain = {
        domain: 'a'.repeat(255) + '.com',
        projectId: 'project-123',
        domainType: 'custom',
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: longDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Domain too long (max 253 characters)');
    });

    it('validates minimum domain length', async () => {
      const shortDomain = {
        domain: 'a.b',
        projectId: 'project-123',
        domainType: 'custom',
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: shortDomain,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Domain too short (min 4 characters)');
    });
  });

  describe('Status formatting', () => {
    it('correctly formats domain status', async () => {
      const domains = [
        {
          id: 'domain-1',
          domainType: 'subdomain',
          verified: true,
          sslStatus: 'issued',
        },
        {
          id: 'domain-2',
          domainType: 'custom',
          verified: false,
          sslStatus: 'pending',
        },
        {
          id: 'domain-3',
          domainType: 'custom',
          verified: true,
          sslStatus: 'failed',
        },
        {
          id: 'domain-4',
          domainType: 'custom',
          verified: true,
          sslStatus: 'issued',
        },
      ];

      mockDomainsService.getProjectDomains.mockResolvedValue(domains);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { projectId: 'project-123' },
      });

      await handler(req, res);

      const data = JSON.parse(res._getData());

      expect(data[0].status).toBe('Active'); // subdomain
      expect(data[1].status).toBe('Pending Verification'); // custom, not verified
      expect(data[2].status).toBe('SSL Failed'); // verified but SSL failed
      expect(data[3].status).toBe('Active'); // verified and SSL issued
    });
  });

  describe('Unsupported methods', () => {
    it('returns 405 for unsupported methods', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'PUT',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Method PUT not allowed');
    });
  });
});