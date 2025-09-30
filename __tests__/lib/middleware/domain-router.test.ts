import { NextRequest, NextResponse } from 'next/server';
import { DomainRouter } from '@/lib/middleware/domain-router';
import { DomainsService } from '@/lib/services/domains';

// Mock dependencies
jest.mock('@/lib/services/domains');

const mockDomainsService = {
  findProjectByDomain: jest.fn(),
  generateSubdomain: jest.fn(),
  createDomain: jest.fn(),
};

const mockConfig = {
  baseDomain: 'magi.dev',
  wildcardDomains: ['*.magi.dev'],
  allowedOrigins: ['https://magi.dev'],
  developmentMode: false,
};

describe('DomainRouter', () => {
  let domainRouter: DomainRouter;

  beforeEach(() => {
    jest.clearAllMocks();
    (DomainsService.getInstance as jest.Mock).mockReturnValue(mockDomainsService);
    domainRouter = new DomainRouter(mockConfig);
  });

  describe('handleRequest', () => {
    it('should handle main domain requests by passing through', async () => {
      const request = new NextRequest('https://magi.dev/dashboard');

      const result = await domainRouter.handleRequest(request);

      expect(result).toBeNull();
    });

    it('should route subdomain to project', async () => {
      mockDomainsService.findProjectByDomain.mockResolvedValue({
        projectId: 'project-123',
        domain: {
          id: 'domain-123',
          domain: 'my-app.magi.dev',
          domainType: 'subdomain',
          redirectTo: null,
        },
      });

      const request = new NextRequest('https://my-app.magi.dev/api/test');

      const result = await domainRouter.handleRequest(request);

      expect(result).toBeInstanceOf(NextResponse);
      expect(mockDomainsService.findProjectByDomain).toHaveBeenCalledWith('my-app.magi.dev');

      // Check that the request was rewritten
      const response = result as NextResponse;
      expect(response.headers.get('x-magi-project-id')).toBe('project-123');
      expect(response.headers.get('x-magi-domain-type')).toBe('subdomain');
    });

    it('should route custom domain to project', async () => {
      mockDomainsService.findProjectByDomain.mockResolvedValue({
        projectId: 'project-456',
        domain: {
          id: 'domain-456',
          domain: 'example.com',
          domainType: 'custom',
          redirectTo: null,
        },
      });

      const request = new NextRequest('https://example.com/');

      const result = await domainRouter.handleRequest(request);

      expect(result).toBeInstanceOf(NextResponse);
      expect(mockDomainsService.findProjectByDomain).toHaveBeenCalledWith('example.com');

      const response = result as NextResponse;
      expect(response.headers.get('x-magi-project-id')).toBe('project-456');
      expect(response.headers.get('x-magi-domain-type')).toBe('custom');
    });

    it('should handle domain redirects', async () => {
      mockDomainsService.findProjectByDomain.mockResolvedValue({
        projectId: 'project-789',
        domain: {
          id: 'domain-789',
          domain: 'old-domain.com',
          domainType: 'custom',
          redirectTo: 'https://new-domain.com',
        },
      });

      const request = new NextRequest('https://old-domain.com/some-path');

      const result = await domainRouter.handleRequest(request);

      expect(result).toBeInstanceOf(NextResponse);
      // Check if it's a redirect response
      const response = result as NextResponse;
      expect(response.status).toBe(307); // Temporary redirect
    });

    it('should return 404 for unknown domains', async () => {
      mockDomainsService.findProjectByDomain.mockResolvedValue(null);

      const request = new NextRequest('https://unknown-domain.com/');

      const result = await domainRouter.handleRequest(request);

      expect(result).toBeInstanceOf(NextResponse);
      const response = result as NextResponse;
      expect(response.status).toBe(404);
    });

    it('should return project-specific 404 for unknown subdomains', async () => {
      mockDomainsService.findProjectByDomain.mockResolvedValue(null);

      const request = new NextRequest('https://nonexistent-app.magi.dev/');

      const result = await domainRouter.handleRequest(request);

      expect(result).toBeInstanceOf(NextResponse);
      const response = result as NextResponse;
      expect(response.status).toBe(404);

      const body = await response.json();
      expect(body.code).toBe('PROJECT_NOT_FOUND');
      expect(body.message).toContain('nonexistent-app');
    });

    it('should handle requests without host header', async () => {
      const request = new NextRequest('https://example.com/');
      // Remove host header
      const requestWithoutHost = new NextRequest(request.url, {
        headers: new Headers(),
      });

      const result = await domainRouter.handleRequest(requestWithoutHost);

      expect(result).toBeNull();
    });

    it('should handle service errors gracefully', async () => {
      mockDomainsService.findProjectByDomain.mockRejectedValue(new Error('Database error'));

      const request = new NextRequest('https://example.com/');

      const result = await domainRouter.handleRequest(request);

      expect(result).toBeInstanceOf(NextResponse);
      const response = result as NextResponse;
      expect(response.status).toBe(500);
    });
  });

  describe('createSubdomain', () => {
    it('should create subdomain for project', async () => {
      mockDomainsService.generateSubdomain.mockReturnValue('my-app.magi.dev');
      mockDomainsService.createDomain.mockResolvedValue({
        id: 'domain-new',
        domain: 'my-app.magi.dev',
      });

      const result = await domainRouter.createSubdomain('project-123', 'my-app');

      expect(result).toBe('my-app.magi.dev');
      expect(mockDomainsService.createDomain).toHaveBeenCalledWith({
        projectId: 'project-123',
        domain: 'my-app.magi.dev',
        domainType: 'subdomain',
        provider: 'vercel',
      });
    });

    it('should handle subdomain creation errors', async () => {
      mockDomainsService.generateSubdomain.mockReturnValue('my-app.magi.dev');
      mockDomainsService.createDomain.mockRejectedValue(new Error('Database error'));

      await expect(domainRouter.createSubdomain('project-123', 'my-app'))
        .rejects.toThrow('Failed to create subdomain');
    });
  });

  describe('validateCustomDomain', () => {
    it('should validate correct domain formats', () => {
      const validDomains = [
        'example.com',
        'subdomain.example.com',
        'my-app.co.uk',
        'test123.example.org',
      ];

      validDomains.forEach(domain => {
        const result = domainRouter.validateCustomDomain(domain);
        expect(result.valid).toBe(true);
      });
    });

    it('should reject invalid domain formats', () => {
      const invalidDomains = [
        'invalid..domain',
        '-invalid.com',
        'invalid-.com',
        'invalid_domain.com',
        'invalid domain.com',
        '.invalid.com',
        'invalid.com.',
      ];

      invalidDomains.forEach(domain => {
        const result = domainRouter.validateCustomDomain(domain);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Invalid domain format');
      });
    });

    it('should reject blocked domains', () => {
      const blockedDomains = [
        'magi.dev',
        'localhost',
        'example.com',
        '127.0.0.1',
        'subdomain.magi.dev',
      ];

      blockedDomains.forEach(domain => {
        const result = domainRouter.validateCustomDomain(domain);
        expect(result.valid).toBe(false);
        expect(result.error).toBe('Domain not allowed');
      });
    });

    it('should reject domains that are too long', () => {
      const longDomain = 'a'.repeat(250) + '.com';

      const result = domainRouter.validateCustomDomain(longDomain);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Domain too long');
    });
  });

  describe('getProjectUrl', () => {
    it('should generate project URL with slug', () => {
      mockDomainsService.generateSubdomain.mockReturnValue('my-app.magi.dev');

      const url = domainRouter.getProjectUrl('project-123', 'my-app');

      expect(url).toBe('https://my-app.magi.dev');
    });

    it('should generate project URL without slug', () => {
      mockDomainsService.generateSubdomain.mockReturnValue('project-1.magi.dev');

      const url = domainRouter.getProjectUrl('project-123');

      expect(url).toBe('https://project-1.magi.dev');
    });

    it('should use http in development mode', () => {
      const devRouter = new DomainRouter({
        ...mockConfig,
        developmentMode: true,
      });

      mockDomainsService.generateSubdomain.mockReturnValue('my-app.magi.dev');

      const url = devRouter.getProjectUrl('project-123', 'my-app');

      expect(url).toBe('http://my-app.magi.dev');
    });
  });

  describe('Project identifier validation', () => {
    it('should validate UUID patterns', () => {
      const isValidProjectIdentifier = (domainRouter as any).isValidProjectIdentifier;

      const validUuids = [
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      ];

      validUuids.forEach(uuid => {
        expect(isValidProjectIdentifier(uuid)).toBe(true);
      });
    });

    it('should validate slug patterns', () => {
      const isValidProjectIdentifier = (domainRouter as any).isValidProjectIdentifier;

      const validSlugs = ['my-app', 'app123', 'test-project'];
      const invalidSlugs = ['ab', 'my_app', '-invalid', 'invalid-'];

      validSlugs.forEach(slug => {
        expect(isValidProjectIdentifier(slug)).toBe(true);
      });

      invalidSlugs.forEach(slug => {
        expect(isValidProjectIdentifier(slug)).toBe(false);
      });
    });
  });

  describe('Development mode handling', () => {
    it('should skip routing for localhost in development', async () => {
      const devRouter = new DomainRouter({
        ...mockConfig,
        developmentMode: true,
      });

      const request = new NextRequest('http://localhost:3000/dashboard');

      const result = await devRouter.handleRequest(request);

      expect(result).toBeNull();
    });
  });

  describe('Port handling', () => {
    it('should extract domain from host with port', async () => {
      mockDomainsService.findProjectByDomain.mockResolvedValue({
        projectId: 'project-123',
        domain: {
          id: 'domain-123',
          domain: 'example.com',
          domainType: 'custom',
        },
      });

      const request = new NextRequest('https://example.com:8080/api/test');

      await domainRouter.handleRequest(request);

      expect(mockDomainsService.findProjectByDomain).toHaveBeenCalledWith('example.com');
    });
  });
});