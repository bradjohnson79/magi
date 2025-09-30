import { NextRequest, NextResponse } from 'next/server';
import { DomainsService } from '@/lib/services/domains';

export interface DomainRouterConfig {
  baseDomain: string;
  wildcardDomains: string[];
  allowedOrigins: string[];
  developmentMode: boolean;
}

export class DomainRouter {
  private static instance: DomainRouter;
  private domainsService: DomainsService;
  private config: DomainRouterConfig;

  constructor(config: DomainRouterConfig) {
    this.domainsService = DomainsService.getInstance();
    this.config = config;
  }

  static getInstance(config?: DomainRouterConfig): DomainRouter {
    if (!DomainRouter.instance) {
      if (!config) {
        throw new Error('DomainRouter configuration required for initialization');
      }
      DomainRouter.instance = new DomainRouter(config);
    }
    return DomainRouter.instance;
  }

  /**
   * Handle incoming request and route based on domain
   */
  async handleRequest(request: NextRequest): Promise<NextResponse | null> {
    const host = request.headers.get('host');
    if (!host) {
      return null; // Let the request continue normally
    }

    // Extract domain from host (remove port if present)
    const domain = host.split(':')[0];

    // Skip routing for main app domain in development
    if (this.config.developmentMode && domain === 'localhost') {
      return null;
    }

    // Skip routing for main domain
    if (domain === this.config.baseDomain) {
      return null;
    }

    try {
      // Look up project by domain
      const projectMapping = await this.domainsService.findProjectByDomain(domain);

      if (!projectMapping) {
        // Domain not found - return 404 or redirect
        return this.handleDomainNotFound(domain, request);
      }

      // Route to project
      return this.routeToProject(projectMapping.projectId, projectMapping.domain, request);
    } catch (error) {
      console.error('Domain routing error:', error);
      return NextResponse.json(
        { error: 'Domain routing failed' },
        { status: 500 }
      );
    }
  }

  /**
   * Route request to specific project
   */
  private async routeToProject(
    projectId: string,
    domain: any,
    request: NextRequest
  ): Promise<NextResponse> {
    // Handle redirects
    if (domain.redirectTo) {
      return NextResponse.redirect(domain.redirectTo);
    }

    // Create rewrite URL for project
    const url = new URL(request.url);

    // For subdomains, route to project-specific path
    if (domain.domainType === 'subdomain') {
      url.pathname = `/projects/${projectId}${url.pathname}`;
    } else {
      // For custom domains, route to custom domain handler
      url.pathname = `/domains/${domain.id}${url.pathname}`;
    }

    // Add project context headers
    const response = NextResponse.rewrite(url);
    response.headers.set('x-magi-project-id', projectId);
    response.headers.set('x-magi-domain-id', domain.id);
    response.headers.set('x-magi-domain-type', domain.domainType);

    return response;
  }

  /**
   * Handle domain not found scenarios
   */
  private handleDomainNotFound(domain: string, request: NextRequest): NextResponse {
    // Check if it's a magi.dev subdomain
    if (domain.endsWith('.magi.dev')) {
      const subdomain = domain.replace('.magi.dev', '');

      // Check if it looks like a project identifier
      if (this.isValidProjectIdentifier(subdomain)) {
        return NextResponse.json(
          {
            error: 'Project not found',
            message: `The project "${subdomain}" does not exist or is not accessible.`,
            code: 'PROJECT_NOT_FOUND'
          },
          { status: 404 }
        );
      }
    }

    // For custom domains, show generic not found
    return NextResponse.json(
      {
        error: 'Domain not configured',
        message: `The domain "${domain}" is not configured for this service.`,
        code: 'DOMAIN_NOT_CONFIGURED'
      },
      { status: 404 }
    );
  }

  /**
   * Check if subdomain looks like a valid project identifier
   */
  private isValidProjectIdentifier(subdomain: string): boolean {
    // UUID pattern (project ID)
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    // Slug pattern
    const slugPattern = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;

    return uuidPattern.test(subdomain) ||
           (slugPattern.test(subdomain) && subdomain.length >= 3);
  }

  /**
   * Create subdomain for project
   */
  async createSubdomain(projectId: string, projectSlug?: string): Promise<string> {
    try {
      const subdomain = this.domainsService.generateSubdomain(projectId, projectSlug);

      // Create subdomain domain record
      await this.domainsService.createDomain({
        projectId,
        domain: subdomain,
        domainType: 'subdomain',
        provider: 'vercel'
      });

      return subdomain;
    } catch (error) {
      console.error('Subdomain creation failed:', error);
      throw new Error('Failed to create subdomain');
    }
  }

  /**
   * Get project URL for subdomain
   */
  getProjectUrl(projectId: string, projectSlug?: string): string {
    const subdomain = this.domainsService.generateSubdomain(projectId, projectSlug);
    const protocol = this.config.developmentMode ? 'http' : 'https';
    return `${protocol}://${subdomain}`;
  }

  /**
   * Validate custom domain format
   */
  validateCustomDomain(domain: string): { valid: boolean; error?: string } {
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
      '127.0.0.1'
    ];

    if (blockedDomains.some(blocked => domain.endsWith(blocked))) {
      return { valid: false, error: 'Domain not allowed' };
    }

    // Check length limits
    if (domain.length > 253) {
      return { valid: false, error: 'Domain too long' };
    }

    return { valid: true };
  }

  /**
   * Get domain routing statistics
   */
  async getRoutingStats(): Promise<{
    totalDomains: number;
    verifiedDomains: number;
    customDomains: number;
    subdomains: number;
    sslIssued: number;
  }> {
    // This would query the database for statistics
    // For now, return mock data
    return {
      totalDomains: 0,
      verifiedDomains: 0,
      customDomains: 0,
      subdomains: 0,
      sslIssued: 0,
    };
  }
}

// Default configuration
export const defaultDomainRouterConfig: DomainRouterConfig = {
  baseDomain: 'magi.dev',
  wildcardDomains: ['*.magi.dev'],
  allowedOrigins: ['https://magi.dev', 'https://www.magi.dev'],
  developmentMode: process.env.NODE_ENV === 'development',
};

// Export singleton instance
export const domainRouter = DomainRouter.getInstance(defaultDomainRouterConfig);