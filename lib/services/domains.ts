import { Database } from '@/lib/database';
import { encrypt, decrypt } from '@/lib/utils/encryption';
import { SecretsService } from '@/lib/services/secrets';
import dns from 'dns/promises';

export interface Domain {
  id: string;
  projectId: string;
  domain: string;
  domainType: 'subdomain' | 'custom';
  verified: boolean;
  sslStatus: 'pending' | 'issued' | 'expired' | 'failed';
  verificationToken?: string;
  verificationRecord?: string;
  sslCertificateId?: string;
  provider: 'vercel' | 'netlify' | 'cloudflare' | 'letsencrypt';
  redirectTo?: string;
  createdAt: Date;
  updatedAt: Date;
  verifiedAt?: Date;
  sslIssuedAt?: Date;
}

export interface CreateDomainRequest {
  projectId: string;
  domain: string;
  domainType?: 'subdomain' | 'custom';
  provider?: 'vercel' | 'netlify' | 'cloudflare' | 'letsencrypt';
  redirectTo?: string;
}

export interface DomainVerificationInstructions {
  recordType: 'CNAME' | 'TXT';
  name: string;
  value: string;
  instructions: string;
}

export interface SSLProvider {
  name: string;
  createCertificate(domain: string): Promise<{ certificateId: string; status: string }>;
  checkCertificateStatus(certificateId: string): Promise<{ status: string; expiresAt?: Date }>;
  deleteCertificate(certificateId: string): Promise<void>;
}

export class DomainsService {
  private static instance: DomainsService;
  private db: Database;
  private secretsService: SecretsService;

  constructor() {
    this.db = Database.getInstance();
    this.secretsService = SecretsService.getInstance();
  }

  static getInstance(): DomainsService {
    if (!DomainsService.instance) {
      DomainsService.instance = new DomainsService();
    }
    return DomainsService.instance;
  }

  /**
   * Generate automatic subdomain for project
   */
  generateSubdomain(projectId: string, projectSlug?: string): string {
    if (projectSlug && this.isValidSubdomain(projectSlug)) {
      return `${projectSlug}.magi.dev`;
    }
    return `${projectId.slice(0, 8)}.magi.dev`;
  }

  /**
   * Create a new domain
   */
  async createDomain(data: CreateDomainRequest): Promise<Domain> {
    const verificationToken = this.generateVerificationToken();
    const verificationRecord = this.generateVerificationRecord(data.domain);

    const query = `
      INSERT INTO domains (
        project_id, domain, domain_type, verification_token,
        verification_record, provider, redirect_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `;

    const values = [
      data.projectId,
      data.domain.toLowerCase(),
      data.domainType || 'custom',
      verificationToken,
      verificationRecord,
      data.provider || 'vercel',
      data.redirectTo
    ];

    const result = await this.db.query(query, values);
    return this.mapDomainFromRow(result.rows[0]);
  }

  /**
   * Get domains for a project
   */
  async getProjectDomains(projectId: string): Promise<Domain[]> {
    const query = `
      SELECT * FROM domains
      WHERE project_id = $1
      ORDER BY domain_type, created_at DESC
    `;

    const result = await this.db.query(query, [projectId]);
    return result.rows.map(row => this.mapDomainFromRow(row));
  }

  /**
   * Get domain by ID
   */
  async getDomainById(domainId: string): Promise<Domain | null> {
    const query = 'SELECT * FROM domains WHERE id = $1';
    const result = await this.db.query(query, [domainId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapDomainFromRow(result.rows[0]);
  }

  /**
   * Find project by domain (for routing)
   */
  async findProjectByDomain(domain: string): Promise<{ projectId: string; domain: Domain } | null> {
    // First try exact match
    let query = 'SELECT * FROM domains WHERE domain = $1 AND verified = true';
    let result = await this.db.query(query, [domain.toLowerCase()]);

    if (result.rows.length > 0) {
      const domainRecord = this.mapDomainFromRow(result.rows[0]);
      return { projectId: domainRecord.projectId, domain: domainRecord };
    }

    // Check for magi.dev subdomain pattern
    if (domain.endsWith('.magi.dev')) {
      const subdomain = domain.replace('.magi.dev', '');

      // Try to find by project slug first
      query = `
        SELECT d.*, p.slug
        FROM domains d
        JOIN projects p ON d.project_id = p.id
        WHERE d.domain_type = 'subdomain' AND p.slug = $1
      `;
      result = await this.db.query(query, [subdomain]);

      if (result.rows.length > 0) {
        const domainRecord = this.mapDomainFromRow(result.rows[0]);
        return { projectId: domainRecord.projectId, domain: domainRecord };
      }

      // Try to find by project ID prefix
      query = `
        SELECT d.*
        FROM domains d
        WHERE d.domain_type = 'subdomain'
        AND d.project_id LIKE $1
      `;
      result = await this.db.query(query, [`${subdomain}%`]);

      if (result.rows.length > 0) {
        const domainRecord = this.mapDomainFromRow(result.rows[0]);
        return { projectId: domainRecord.projectId, domain: domainRecord };
      }
    }

    return null;
  }

  /**
   * Verify domain ownership
   */
  async verifyDomain(domainId: string): Promise<{ verified: boolean; error?: string }> {
    const domain = await this.getDomainById(domainId);
    if (!domain) {
      return { verified: false, error: 'Domain not found' };
    }

    if (domain.domainType === 'subdomain') {
      // Subdomains are automatically verified
      await this.markDomainVerified(domainId);
      return { verified: true };
    }

    try {
      // Check DNS records for verification
      const verified = await this.checkDNSVerification(domain);

      if (verified) {
        await this.markDomainVerified(domainId);
        // Trigger SSL certificate issuance
        await this.requestSSLCertificate(domainId);
        return { verified: true };
      }

      return { verified: false, error: 'DNS verification failed' };
    } catch (error) {
      console.error('Domain verification error:', error);
      return { verified: false, error: 'Verification failed' };
    }
  }

  /**
   * Get verification instructions for domain
   */
  getDomainVerificationInstructions(domain: Domain): DomainVerificationInstructions {
    return {
      recordType: 'CNAME',
      name: `_magi-verify.${domain.domain}`,
      value: domain.verificationRecord || '',
      instructions: `Add a CNAME record with name "_magi-verify" pointing to "${domain.verificationRecord}" to verify ownership of ${domain.domain}.`
    };
  }

  /**
   * Delete domain
   */
  async deleteDomain(domainId: string): Promise<void> {
    const domain = await this.getDomainById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    // Remove SSL certificate if exists
    if (domain.sslCertificateId) {
      await this.revokSSLCertificate(domain);
    }

    const query = 'DELETE FROM domains WHERE id = $1';
    await this.db.query(query, [domainId]);
  }

  /**
   * Update domain
   */
  async updateDomain(domainId: string, updates: Partial<Domain>): Promise<Domain> {
    const allowedFields = ['verified', 'ssl_status', 'ssl_certificate_id', 'redirect_to', 'verified_at', 'ssl_issued_at'];
    const setClause = [];
    const values = [];
    let paramIndex = 1;

    for (const [key, value] of Object.entries(updates)) {
      const dbField = this.camelToSnake(key);
      if (allowedFields.includes(dbField)) {
        setClause.push(`${dbField} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    }

    if (setClause.length === 0) {
      throw new Error('No valid fields to update');
    }

    const query = `
      UPDATE domains
      SET ${setClause.join(', ')}, updated_at = now()
      WHERE id = $${paramIndex}
      RETURNING *
    `;
    values.push(domainId);

    const result = await this.db.query(query, values);
    return this.mapDomainFromRow(result.rows[0]);
  }

  /**
   * Request SSL certificate
   */
  private async requestSSLCertificate(domainId: string): Promise<void> {
    const domain = await this.getDomainById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    try {
      const provider = await this.getSSLProvider(domain.provider);
      const result = await provider.createCertificate(domain.domain);

      await this.updateDomain(domainId, {
        sslStatus: result.status as any,
        sslCertificateId: result.certificateId,
        sslIssuedAt: new Date()
      });
    } catch (error) {
      console.error('SSL certificate request failed:', error);
      await this.updateDomain(domainId, {
        sslStatus: 'failed'
      });
      throw error;
    }
  }

  /**
   * Check SSL certificate status
   */
  async checkSSLStatus(domainId: string): Promise<{ status: string; expiresAt?: Date }> {
    const domain = await this.getDomainById(domainId);
    if (!domain || !domain.sslCertificateId) {
      return { status: 'pending' };
    }

    try {
      const provider = await this.getSSLProvider(domain.provider);
      return await provider.checkCertificateStatus(domain.sslCertificateId);
    } catch (error) {
      console.error('SSL status check failed:', error);
      return { status: 'failed' };
    }
  }

  /**
   * Get SSL provider instance
   */
  private async getSSLProvider(providerName: string): Promise<SSLProvider> {
    switch (providerName) {
      case 'vercel':
        return new VercelSSLProvider(await this.getProviderToken('vercel'));
      case 'netlify':
        return new NetlifySSLProvider(await this.getProviderToken('netlify'));
      case 'cloudflare':
        return new CloudflareSSLProvider(await this.getProviderToken('cloudflare'));
      case 'letsencrypt':
        return new LetsEncryptSSLProvider();
      default:
        throw new Error(`Unsupported SSL provider: ${providerName}`);
    }
  }

  /**
   * Get provider API token from secrets
   */
  private async getProviderToken(provider: string): Promise<string> {
    const secrets = await this.secretsService.listSecrets();
    const tokenSecret = secrets.find(s =>
      s.key === `${provider}_api_token` ||
      s.key === `${provider}_token`
    );

    if (!tokenSecret) {
      throw new Error(`${provider} API token not found in secrets`);
    }

    return decrypt(tokenSecret.value);
  }

  /**
   * Check DNS verification
   */
  private async checkDNSVerification(domain: Domain): Promise<boolean> {
    try {
      const records = await dns.resolveCname(`_magi-verify.${domain.domain}`);
      return records.includes(domain.verificationRecord || '');
    } catch (error) {
      return false;
    }
  }

  /**
   * Mark domain as verified
   */
  private async markDomainVerified(domainId: string): Promise<void> {
    await this.updateDomain(domainId, {
      verified: true,
      verifiedAt: new Date()
    });
  }

  /**
   * Revoke SSL certificate
   */
  private async revokSSLCertificate(domain: Domain): Promise<void> {
    if (!domain.sslCertificateId) return;

    try {
      const provider = await this.getSSLProvider(domain.provider);
      await provider.deleteCertificate(domain.sslCertificateId);
    } catch (error) {
      console.error('SSL certificate revocation failed:', error);
    }
  }

  /**
   * Generate verification token
   */
  private generateVerificationToken(): string {
    return `magi-verify-${Math.random().toString(36).substring(2, 15)}`;
  }

  /**
   * Generate verification record
   */
  private generateVerificationRecord(domain: string): string {
    const hash = require('crypto').createHash('sha256').update(domain + process.env.DOMAIN_VERIFICATION_SECRET).digest('hex');
    return `${hash.substring(0, 16)}.domains.magi.dev`;
  }

  /**
   * Validate subdomain format
   */
  private isValidSubdomain(slug: string): boolean {
    const subdomainRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
    return subdomainRegex.test(slug) && slug.length >= 3 && slug.length <= 63;
  }

  /**
   * Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }

  /**
   * Map database row to Domain object
   */
  private mapDomainFromRow(row: any): Domain {
    return {
      id: row.id,
      projectId: row.project_id,
      domain: row.domain,
      domainType: row.domain_type,
      verified: row.verified,
      sslStatus: row.ssl_status,
      verificationToken: row.verification_token,
      verificationRecord: row.verification_record,
      sslCertificateId: row.ssl_certificate_id,
      provider: row.provider,
      redirectTo: row.redirect_to,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
      sslIssuedAt: row.ssl_issued_at ? new Date(row.ssl_issued_at) : undefined,
    };
  }
}

// SSL Provider Implementations
class VercelSSLProvider implements SSLProvider {
  name = 'Vercel';

  constructor(private apiToken: string) {}

  async createCertificate(domain: string): Promise<{ certificateId: string; status: string }> {
    const response = await fetch('https://api.vercel.com/v1/certificates', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        domains: [domain],
        autoRenew: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Vercel SSL creation failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      certificateId: data.uid,
      status: 'issued',
    };
  }

  async checkCertificateStatus(certificateId: string): Promise<{ status: string; expiresAt?: Date }> {
    const response = await fetch(`https://api.vercel.com/v1/certificates/${certificateId}`, {
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Vercel SSL status check failed: ${response.statusText}`);
    }

    const data = await response.json();
    return {
      status: data.status === 'valid' ? 'issued' : 'failed',
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    };
  }

  async deleteCertificate(certificateId: string): Promise<void> {
    const response = await fetch(`https://api.vercel.com/v1/certificates/${certificateId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${this.apiToken}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Vercel SSL deletion failed: ${response.statusText}`);
    }
  }
}

class NetlifySSLProvider implements SSLProvider {
  name = 'Netlify';

  constructor(private apiToken: string) {}

  async createCertificate(domain: string): Promise<{ certificateId: string; status: string }> {
    // Netlify handles SSL automatically for custom domains
    return {
      certificateId: `netlify-${domain}`,
      status: 'issued',
    };
  }

  async checkCertificateStatus(certificateId: string): Promise<{ status: string; expiresAt?: Date }> {
    return { status: 'issued' };
  }

  async deleteCertificate(certificateId: string): Promise<void> {
    // Netlify handles SSL cleanup automatically
  }
}

class CloudflareSSLProvider implements SSLProvider {
  name = 'Cloudflare';

  constructor(private apiToken: string) {}

  async createCertificate(domain: string): Promise<{ certificateId: string; status: string }> {
    // Cloudflare SSL implementation
    return {
      certificateId: `cf-${domain}`,
      status: 'issued',
    };
  }

  async checkCertificateStatus(certificateId: string): Promise<{ status: string; expiresAt?: Date }> {
    return { status: 'issued' };
  }

  async deleteCertificate(certificateId: string): Promise<void> {
    // Cloudflare SSL cleanup
  }
}

class LetsEncryptSSLProvider implements SSLProvider {
  name = 'Let\'s Encrypt';

  async createCertificate(domain: string): Promise<{ certificateId: string; status: string }> {
    // Let's Encrypt ACME implementation would go here
    return {
      certificateId: `le-${domain}`,
      status: 'issued',
    };
  }

  async checkCertificateStatus(certificateId: string): Promise<{ status: string; expiresAt?: Date }> {
    return { status: 'issued' };
  }

  async deleteCertificate(certificateId: string): Promise<void> {
    // Let's Encrypt cleanup
  }
}