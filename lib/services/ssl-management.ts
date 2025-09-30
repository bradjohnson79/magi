import { SecretsService } from '@/lib/services/secrets';
import { decrypt } from '@/lib/utils/encryption';

export interface SSLCertificate {
  id: string;
  domain: string;
  provider: 'vercel' | 'netlify' | 'cloudflare' | 'letsencrypt';
  status: 'pending' | 'issued' | 'expired' | 'failed' | 'revoked';
  issuedAt?: Date;
  expiresAt?: Date;
  certificateData?: string;
  privateKey?: string;
  certificateChain?: string;
  autoRenew: boolean;
  lastRenewalAttempt?: Date;
  renewalError?: string;
}

export interface SSLProviderConfig {
  name: string;
  apiEndpoint: string;
  requiredCredentials: string[];
  supportedFeatures: string[];
  rateLimits: {
    requestsPerHour: number;
    certificatesPerWeek: number;
  };
}

export class SSLManagementService {
  private static instance: SSLManagementService;
  private secretsService: SecretsService;

  constructor() {
    this.secretsService = SecretsService.getInstance();
  }

  static getInstance(): SSLManagementService {
    if (!SSLManagementService.instance) {
      SSLManagementService.instance = new SSLManagementService();
    }
    return SSLManagementService.instance;
  }

  /**
   * Request SSL certificate for domain
   */
  async requestCertificate(
    domain: string,
    provider: 'vercel' | 'netlify' | 'cloudflare' | 'letsencrypt'
  ): Promise<SSLCertificate> {
    const providerService = await this.getProviderService(provider);

    try {
      const certificate = await providerService.createCertificate(domain);

      return {
        id: certificate.certificateId,
        domain,
        provider,
        status: certificate.status as any,
        issuedAt: new Date(),
        autoRenew: true
      };
    } catch (error) {
      console.error(`SSL certificate request failed for ${domain}:`, error);

      return {
        id: `failed-${Date.now()}`,
        domain,
        provider,
        status: 'failed',
        autoRenew: false,
        renewalError: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check certificate status
   */
  async checkCertificateStatus(certificateId: string, provider: string): Promise<SSLCertificate> {
    const providerService = await this.getProviderService(provider as any);

    try {
      const status = await providerService.checkCertificateStatus(certificateId);

      return {
        id: certificateId,
        domain: '', // Would be retrieved from database
        provider: provider as any,
        status: status.status as any,
        expiresAt: status.expiresAt,
        autoRenew: true
      };
    } catch (error) {
      console.error(`SSL status check failed for ${certificateId}:`, error);

      return {
        id: certificateId,
        domain: '',
        provider: provider as any,
        status: 'failed',
        autoRenew: false,
        renewalError: error instanceof Error ? error.message : 'Status check failed'
      };
    }
  }

  /**
   * Renew certificate
   */
  async renewCertificate(certificateId: string, provider: string): Promise<SSLCertificate> {
    const providerService = await this.getProviderService(provider as any);

    try {
      // Most providers handle auto-renewal, but we can trigger it manually
      const certificate = await providerService.createCertificate(''); // Domain would be retrieved

      return {
        id: certificate.certificateId,
        domain: '',
        provider: provider as any,
        status: certificate.status as any,
        issuedAt: new Date(),
        autoRenew: true,
        lastRenewalAttempt: new Date()
      };
    } catch (error) {
      console.error(`SSL certificate renewal failed for ${certificateId}:`, error);

      return {
        id: certificateId,
        domain: '',
        provider: provider as any,
        status: 'failed',
        autoRenew: true,
        lastRenewalAttempt: new Date(),
        renewalError: error instanceof Error ? error.message : 'Renewal failed'
      };
    }
  }

  /**
   * Revoke certificate
   */
  async revokeCertificate(certificateId: string, provider: string): Promise<void> {
    const providerService = await this.getProviderService(provider as any);

    try {
      await providerService.deleteCertificate(certificateId);
      console.log(`SSL certificate ${certificateId} revoked successfully`);
    } catch (error) {
      console.error(`SSL certificate revocation failed for ${certificateId}:`, error);
      throw error;
    }
  }

  /**
   * Get certificates expiring soon
   */
  async getExpiringCertificates(daysThreshold: number = 30): Promise<SSLCertificate[]> {
    // This would query the database for certificates expiring within the threshold
    // For now, return empty array
    return [];
  }

  /**
   * Auto-renew expiring certificates
   */
  async autoRenewCertificates(): Promise<{ renewed: number; failed: number; errors: string[] }> {
    const expiringCertificates = await this.getExpiringCertificates(30);
    let renewed = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const cert of expiringCertificates) {
      if (!cert.autoRenew) {
        continue;
      }

      try {
        await this.renewCertificate(cert.id, cert.provider);
        renewed++;
        console.log(`Auto-renewed certificate ${cert.id} for ${cert.domain}`);
      } catch (error) {
        failed++;
        const errorMessage = `Failed to auto-renew ${cert.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMessage);
        console.error(errorMessage);
      }
    }

    return { renewed, failed, errors };
  }

  /**
   * Get provider service instance
   */
  private async getProviderService(provider: 'vercel' | 'netlify' | 'cloudflare' | 'letsencrypt'): Promise<any> {
    switch (provider) {
      case 'vercel':
        return new VercelSSLService(await this.getProviderToken('vercel'));
      case 'netlify':
        return new NetlifySSLService(await this.getProviderToken('netlify'));
      case 'cloudflare':
        return new CloudflareSSLService(await this.getProviderToken('cloudflare'));
      case 'letsencrypt':
        return new LetsEncryptSSLService();
      default:
        throw new Error(`Unsupported SSL provider: ${provider}`);
    }
  }

  /**
   * Get provider API token from secrets
   */
  private async getProviderToken(provider: string): Promise<string> {
    const secrets = await this.secretsService.listSecrets();
    const tokenSecret = secrets.find(s =>
      s.key === `${provider}_api_token` ||
      s.key === `${provider}_token` ||
      s.key === `${provider}_ssl_token`
    );

    if (!tokenSecret) {
      throw new Error(`${provider} API token not found in secrets`);
    }

    return decrypt(tokenSecret.value);
  }

  /**
   * Get SSL provider configurations
   */
  getProviderConfigs(): Record<string, SSLProviderConfig> {
    return {
      vercel: {
        name: 'Vercel',
        apiEndpoint: 'https://api.vercel.com/v1/certificates',
        requiredCredentials: ['api_token'],
        supportedFeatures: ['auto_renewal', 'wildcard', 'multi_domain'],
        rateLimits: {
          requestsPerHour: 1000,
          certificatesPerWeek: 50
        }
      },
      netlify: {
        name: 'Netlify',
        apiEndpoint: 'https://api.netlify.com/api/v1/sites',
        requiredCredentials: ['api_token'],
        supportedFeatures: ['auto_renewal', 'custom_domain'],
        rateLimits: {
          requestsPerHour: 500,
          certificatesPerWeek: 100
        }
      },
      cloudflare: {
        name: 'Cloudflare',
        apiEndpoint: 'https://api.cloudflare.com/client/v4/certificates',
        requiredCredentials: ['api_token', 'zone_id'],
        supportedFeatures: ['auto_renewal', 'wildcard', 'edge_certificates'],
        rateLimits: {
          requestsPerHour: 1200,
          certificatesPerWeek: 200
        }
      },
      letsencrypt: {
        name: "Let's Encrypt",
        apiEndpoint: 'https://acme-v02.api.letsencrypt.org/directory',
        requiredCredentials: ['email'],
        supportedFeatures: ['auto_renewal', 'wildcard'],
        rateLimits: {
          requestsPerHour: 300,
          certificatesPerWeek: 20
        }
      }
    };
  }

  /**
   * Validate SSL provider configuration
   */
  async validateProviderConfig(provider: string): Promise<{ valid: boolean; error?: string; missingCredentials?: string[] }> {
    const config = this.getProviderConfigs()[provider];
    if (!config) {
      return { valid: false, error: 'Unknown provider' };
    }

    const secrets = await this.secretsService.listSecrets();
    const missingCredentials: string[] = [];

    for (const credential of config.requiredCredentials) {
      const found = secrets.some(s =>
        s.key.includes(provider) && s.key.includes(credential)
      );

      if (!found) {
        missingCredentials.push(credential);
      }
    }

    if (missingCredentials.length > 0) {
      return {
        valid: false,
        error: 'Missing required credentials',
        missingCredentials
      };
    }

    return { valid: true };
  }
}

// SSL Provider Service Implementations
class VercelSSLService {
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

class NetlifySSLService {
  constructor(private apiToken: string) {}

  async createCertificate(domain: string): Promise<{ certificateId: string; status: string }> {
    // Netlify handles SSL automatically for custom domains
    return {
      certificateId: `netlify-${domain}-${Date.now()}`,
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

class CloudflareSSLService {
  constructor(private apiToken: string) {}

  async createCertificate(domain: string): Promise<{ certificateId: string; status: string }> {
    // Cloudflare SSL implementation would go here
    return {
      certificateId: `cf-${domain}-${Date.now()}`,
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

class LetsEncryptSSLService {
  async createCertificate(domain: string): Promise<{ certificateId: string; status: string }> {
    // Let's Encrypt ACME implementation would go here
    // This would use an ACME client like node-acme-client
    return {
      certificateId: `le-${domain}-${Date.now()}`,
      status: 'issued',
    };
  }

  async checkCertificateStatus(certificateId: string): Promise<{ status: string; expiresAt?: Date }> {
    return { status: 'issued' };
  }

  async deleteCertificate(certificateId: string): Promise<void> {
    // Let's Encrypt certificates expire automatically
  }
}

// Export singleton instance
export const sslManagementService = SSLManagementService.getInstance();