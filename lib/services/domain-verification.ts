import dns from 'dns/promises';
import { DomainsService } from '@/lib/services/domains';

export interface VerificationJob {
  id: string;
  domainId: string;
  domain: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  attempts: number;
  maxAttempts: number;
  nextRetry?: Date;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface DNSRecord {
  type: 'CNAME' | 'TXT' | 'A' | 'AAAA';
  name: string;
  value: string;
  ttl?: number;
}

export class DomainVerificationService {
  private static instance: DomainVerificationService;
  private domainsService: DomainsService;
  private verificationJobs: Map<string, VerificationJob> = new Map();
  private jobInterval?: NodeJS.Timeout;

  constructor() {
    this.domainsService = DomainsService.getInstance();
    this.startJobProcessor();
  }

  static getInstance(): DomainVerificationService {
    if (!DomainVerificationService.instance) {
      DomainVerificationService.instance = new DomainVerificationService();
    }
    return DomainVerificationService.instance;
  }

  /**
   * Start a verification job for a domain
   */
  async startVerification(domainId: string): Promise<VerificationJob> {
    const domain = await this.domainsService.getDomainById(domainId);
    if (!domain) {
      throw new Error('Domain not found');
    }

    if (domain.verified) {
      throw new Error('Domain already verified');
    }

    const jobId = `verify-${domainId}-${Date.now()}`;
    const job: VerificationJob = {
      id: jobId,
      domainId: domain.id,
      domain: domain.domain,
      status: 'pending',
      attempts: 0,
      maxAttempts: 10,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.verificationJobs.set(jobId, job);
    console.log(`Started verification job ${jobId} for domain ${domain.domain}`);

    return job;
  }

  /**
   * Check DNS records for domain verification
   */
  async verifyDomainDNS(domainId: string): Promise<{ verified: boolean; error?: string; records?: DNSRecord[] }> {
    const domain = await this.domainsService.getDomainById(domainId);
    if (!domain) {
      return { verified: false, error: 'Domain not found' };
    }

    try {
      // For custom domains, check CNAME verification record
      if (domain.domainType === 'custom') {
        return await this.verifyCNAMERecord(domain);
      }

      // For subdomains, automatically verify
      if (domain.domainType === 'subdomain') {
        return { verified: true };
      }

      return { verified: false, error: 'Unknown domain type' };
    } catch (error) {
      console.error('DNS verification error:', error);
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'DNS lookup failed'
      };
    }
  }

  /**
   * Verify CNAME record for custom domain
   */
  private async verifyCNAMERecord(domain: any): Promise<{ verified: boolean; error?: string; records?: DNSRecord[] }> {
    const verificationHost = `_magi-verify.${domain.domain}`;
    const expectedValue = domain.verificationRecord;

    if (!expectedValue) {
      return { verified: false, error: 'Verification record not set' };
    }

    try {
      // Try CNAME first
      try {
        const cnameRecords = await dns.resolveCname(verificationHost);
        console.log(`CNAME records for ${verificationHost}:`, cnameRecords);

        if (cnameRecords.includes(expectedValue)) {
          return {
            verified: true,
            records: cnameRecords.map(value => ({
              type: 'CNAME' as const,
              name: verificationHost,
              value
            }))
          };
        }
      } catch (cnameError) {
        // CNAME not found, try TXT as fallback
        console.log('CNAME not found, trying TXT records');
      }

      // Try TXT records as fallback
      try {
        const txtRecords = await dns.resolveTxt(verificationHost);
        const flatTxtRecords = txtRecords.flat();
        console.log(`TXT records for ${verificationHost}:`, flatTxtRecords);

        if (flatTxtRecords.includes(expectedValue)) {
          return {
            verified: true,
            records: flatTxtRecords.map(value => ({
              type: 'TXT' as const,
              name: verificationHost,
              value
            }))
          };
        }
      } catch (txtError) {
        console.log('TXT records not found either');
      }

      return {
        verified: false,
        error: `Verification record not found. Expected CNAME or TXT record: ${verificationHost} -> ${expectedValue}`
      };
    } catch (error) {
      return {
        verified: false,
        error: `DNS lookup failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Check domain accessibility
   */
  async checkDomainAccessibility(domain: string): Promise<{ accessible: boolean; error?: string; statusCode?: number }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`https://${domain}`, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Magi-Domain-Checker/1.0'
        }
      });

      clearTimeout(timeoutId);

      return {
        accessible: response.ok,
        statusCode: response.status
      };
    } catch (error) {
      return {
        accessible: false,
        error: error instanceof Error ? error.message : 'Connection failed'
      };
    }
  }

  /**
   * Process verification jobs
   */
  private async processVerificationJobs(): Promise<void> {
    const pendingJobs = Array.from(this.verificationJobs.values())
      .filter(job => job.status === 'pending' || job.status === 'running');

    for (const job of pendingJobs) {
      if (job.status === 'running') {
        continue; // Skip jobs already running
      }

      if (job.attempts >= job.maxAttempts) {
        job.status = 'failed';
        job.error = 'Maximum attempts exceeded';
        job.updatedAt = new Date();
        continue;
      }

      // Check if we should retry (exponential backoff)
      if (job.nextRetry && job.nextRetry > new Date()) {
        continue;
      }

      await this.processVerificationJob(job);
    }
  }

  /**
   * Process individual verification job
   */
  private async processVerificationJob(job: VerificationJob): Promise<void> {
    job.status = 'running';
    job.attempts += 1;
    job.updatedAt = new Date();

    try {
      console.log(`Processing verification job ${job.id} (attempt ${job.attempts})`);

      const result = await this.verifyDomainDNS(job.domainId);

      if (result.verified) {
        // Mark domain as verified
        await this.domainsService.updateDomain(job.domainId, {
          verified: true,
          verifiedAt: new Date()
        });

        job.status = 'completed';
        job.updatedAt = new Date();

        console.log(`Domain ${job.domain} verified successfully`);

        // Trigger SSL certificate request
        this.requestSSLCertificate(job.domainId);
      } else {
        // Schedule retry with exponential backoff
        const backoffMinutes = Math.min(60, Math.pow(2, job.attempts - 1) * 5);
        job.nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);
        job.status = 'pending';
        job.error = result.error;

        console.log(`Domain ${job.domain} verification failed: ${result.error}. Retrying in ${backoffMinutes} minutes.`);
      }
    } catch (error) {
      console.error(`Verification job ${job.id} failed:`, error);

      job.status = 'pending';
      job.error = error instanceof Error ? error.message : 'Unknown error';

      // Schedule retry
      const backoffMinutes = Math.min(60, Math.pow(2, job.attempts - 1) * 5);
      job.nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000);
    }

    job.updatedAt = new Date();
  }

  /**
   * Request SSL certificate after verification
   */
  private async requestSSLCertificate(domainId: string): Promise<void> {
    try {
      await this.domainsService.updateDomain(domainId, {
        sslStatus: 'pending'
      });

      // In a real implementation, this would trigger SSL certificate issuance
      console.log(`SSL certificate request initiated for domain ${domainId}`);

      // Simulate SSL issuance (remove in production)
      setTimeout(async () => {
        try {
          await this.domainsService.updateDomain(domainId, {
            sslStatus: 'issued',
            sslCertificateId: `ssl-${domainId}-${Date.now()}`,
            sslIssuedAt: new Date()
          });
          console.log(`SSL certificate issued for domain ${domainId}`);
        } catch (error) {
          console.error(`SSL issuance failed for domain ${domainId}:`, error);
          await this.domainsService.updateDomain(domainId, {
            sslStatus: 'failed'
          });
        }
      }, 30000); // 30 second simulation
    } catch (error) {
      console.error(`SSL request failed for domain ${domainId}:`, error);
    }
  }

  /**
   * Get verification job status
   */
  getVerificationJob(jobId: string): VerificationJob | undefined {
    return this.verificationJobs.get(jobId);
  }

  /**
   * Get all verification jobs for a domain
   */
  getDomainVerificationJobs(domainId: string): VerificationJob[] {
    return Array.from(this.verificationJobs.values())
      .filter(job => job.domainId === domainId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  /**
   * Start the job processor
   */
  private startJobProcessor(): void {
    if (this.jobInterval) {
      clearInterval(this.jobInterval);
    }

    // Process jobs every 30 seconds
    this.jobInterval = setInterval(() => {
      this.processVerificationJobs().catch(error => {
        console.error('Job processor error:', error);
      });
    }, 30000);

    console.log('Domain verification job processor started');
  }

  /**
   * Stop the job processor
   */
  stopJobProcessor(): void {
    if (this.jobInterval) {
      clearInterval(this.jobInterval);
      this.jobInterval = undefined;
      console.log('Domain verification job processor stopped');
    }
  }

  /**
   * Clean up old completed jobs
   */
  cleanupJobs(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    for (const [jobId, job] of this.verificationJobs.entries()) {
      if (
        (job.status === 'completed' || job.status === 'failed') &&
        now.getTime() - job.updatedAt.getTime() > maxAge
      ) {
        this.verificationJobs.delete(jobId);
      }
    }
  }
}

// Export singleton instance
export const domainVerificationService = DomainVerificationService.getInstance();