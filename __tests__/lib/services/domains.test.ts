import { DomainsService } from '@/lib/services/domains';
import { Database } from '@/lib/database';
import { SecretsService } from '@/lib/services/secrets';

// Mock dependencies
jest.mock('@/lib/database');
jest.mock('@/lib/services/secrets');
jest.mock('dns/promises');

const mockDatabase = {
  query: jest.fn(),
};

const mockSecretsService = {
  listSecrets: jest.fn(),
};

const mockDns = {
  resolveCname: jest.fn(),
  resolveTxt: jest.fn(),
};

// Mock DNS module
jest.mock('dns/promises', () => mockDns);

describe('DomainsService', () => {
  let domainsService: DomainsService;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock Database getInstance
    (Database.getInstance as jest.Mock).mockReturnValue(mockDatabase);

    // Mock SecretsService getInstance
    (SecretsService.getInstance as jest.Mock).mockReturnValue(mockSecretsService);

    domainsService = DomainsService.getInstance();
  });

  describe('generateSubdomain', () => {
    it('should generate subdomain with project slug when valid', () => {
      const projectId = 'project-123';
      const projectSlug = 'my-app';

      const subdomain = domainsService.generateSubdomain(projectId, projectSlug);

      expect(subdomain).toBe('my-app.magi.dev');
    });

    it('should use project ID when slug is invalid', () => {
      const projectId = 'project-123';
      const projectSlug = 'a'; // Too short

      const subdomain = domainsService.generateSubdomain(projectId, projectSlug);

      expect(subdomain).toBe('project-1.magi.dev'); // First 8 chars of project ID
    });

    it('should use project ID when no slug provided', () => {
      const projectId = 'abcdef12-3456-7890-abcd-ef1234567890';

      const subdomain = domainsService.generateSubdomain(projectId);

      expect(subdomain).toBe('abcdef12.magi.dev');
    });
  });

  describe('createDomain', () => {
    it('should create a new domain successfully', async () => {
      const mockRow = {
        id: 'domain-123',
        project_id: 'project-123',
        domain: 'example.com',
        domain_type: 'custom',
        verified: false,
        ssl_status: 'pending',
        verification_token: 'token-123',
        verification_record: 'record-123',
        provider: 'vercel',
        redirect_to: null,
        created_at: new Date(),
        updated_at: new Date(),
        verified_at: null,
        ssl_issued_at: null,
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await domainsService.createDomain({
        projectId: 'project-123',
        domain: 'example.com',
        domainType: 'custom',
        provider: 'vercel',
      });

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO domains'),
        expect.arrayContaining(['project-123', 'example.com', 'custom'])
      );

      expect(result).toMatchObject({
        id: 'domain-123',
        projectId: 'project-123',
        domain: 'example.com',
        domainType: 'custom',
        verified: false,
        provider: 'vercel',
      });
    });

    it('should generate verification token and record', async () => {
      const mockRow = {
        id: 'domain-123',
        project_id: 'project-123',
        domain: 'example.com',
        domain_type: 'custom',
        verified: false,
        ssl_status: 'pending',
        verification_token: 'magi-verify-abc123',
        verification_record: 'def456.domains.magi.dev',
        provider: 'vercel',
        redirect_to: null,
        created_at: new Date(),
        updated_at: new Date(),
        verified_at: null,
        ssl_issued_at: null,
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await domainsService.createDomain({
        projectId: 'project-123',
        domain: 'example.com',
      });

      expect(result.verificationToken).toContain('magi-verify-');
      expect(result.verificationRecord).toContain('.domains.magi.dev');
    });
  });

  describe('getProjectDomains', () => {
    it('should return domains for a project', async () => {
      const mockRows = [
        {
          id: 'domain-1',
          project_id: 'project-123',
          domain: 'app.magi.dev',
          domain_type: 'subdomain',
          verified: true,
          ssl_status: 'issued',
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          id: 'domain-2',
          project_id: 'project-123',
          domain: 'example.com',
          domain_type: 'custom',
          verified: false,
          ssl_status: 'pending',
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockDatabase.query.mockResolvedValueOnce({ rows: mockRows });

      const result = await domainsService.getProjectDomains('project-123');

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE project_id = $1'),
        ['project-123']
      );

      expect(result).toHaveLength(2);
      expect(result[0].domainType).toBe('subdomain');
      expect(result[1].domainType).toBe('custom');
    });
  });

  describe('findProjectByDomain', () => {
    it('should find project by exact domain match', async () => {
      const mockRow = {
        id: 'domain-123',
        project_id: 'project-123',
        domain: 'example.com',
        domain_type: 'custom',
        verified: true,
        ssl_status: 'issued',
        created_at: new Date(),
        updated_at: new Date(),
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await domainsService.findProjectByDomain('example.com');

      expect(result).not.toBeNull();
      expect(result?.projectId).toBe('project-123');
      expect(result?.domain.domain).toBe('example.com');
    });

    it('should find project by magi.dev subdomain with slug', async () => {
      const mockRow = {
        id: 'domain-123',
        project_id: 'project-123',
        domain_type: 'subdomain',
        slug: 'my-app',
        created_at: new Date(),
        updated_at: new Date(),
      };

      // First query for exact match returns empty
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });
      // Second query for slug match returns result
      mockDatabase.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await domainsService.findProjectByDomain('my-app.magi.dev');

      expect(result).not.toBeNull();
      expect(result?.projectId).toBe('project-123');
    });

    it('should return null for non-existent domain', async () => {
      mockDatabase.query.mockResolvedValue({ rows: [] });

      const result = await domainsService.findProjectByDomain('nonexistent.com');

      expect(result).toBeNull();
    });
  });

  describe('verifyDomain', () => {
    it('should verify subdomain automatically', async () => {
      const mockDomain = {
        id: 'domain-123',
        projectId: 'project-123',
        domain: 'app.magi.dev',
        domainType: 'subdomain',
        verified: false,
      };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [{ ...mockDomain, domain_type: 'subdomain' }] }) // getDomainById
        .mockResolvedValueOnce({ rows: [{}] }); // updateDomain

      const result = await domainsService.verifyDomain('domain-123');

      expect(result.verified).toBe(true);
      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE domains'),
        expect.arrayContaining([true])
      );
    });

    it('should verify custom domain with correct DNS records', async () => {
      const mockDomain = {
        id: 'domain-123',
        project_id: 'project-123',
        domain: 'example.com',
        domain_type: 'custom',
        verified: false,
        verification_record: 'abc123.domains.magi.dev',
      };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockDomain] }) // getDomainById
        .mockResolvedValueOnce({ rows: [{}] }); // updateDomain

      mockDns.resolveCname.mockResolvedValueOnce(['abc123.domains.magi.dev']);

      const result = await domainsService.verifyDomain('domain-123');

      expect(result.verified).toBe(true);
      expect(mockDns.resolveCname).toHaveBeenCalledWith('_magi-verify.example.com');
    });

    it('should fail verification with incorrect DNS records', async () => {
      const mockDomain = {
        id: 'domain-123',
        project_id: 'project-123',
        domain: 'example.com',
        domain_type: 'custom',
        verified: false,
        verification_record: 'abc123.domains.magi.dev',
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockDomain] });
      mockDns.resolveCname.mockRejectedValueOnce(new Error('NXDOMAIN'));
      mockDns.resolveTxt.mockRejectedValueOnce(new Error('NXDOMAIN'));

      const result = await domainsService.verifyDomain('domain-123');

      expect(result.verified).toBe(false);
      expect(result.error).toContain('Verification record not found');
    });
  });

  describe('getDomainVerificationInstructions', () => {
    it('should return CNAME verification instructions', () => {
      const domain = {
        id: 'domain-123',
        domain: 'example.com',
        verificationRecord: 'abc123.domains.magi.dev',
      } as any;

      const instructions = domainsService.getDomainVerificationInstructions(domain);

      expect(instructions).toMatchObject({
        recordType: 'CNAME',
        name: '_magi-verify.example.com',
        value: 'abc123.domains.magi.dev',
        instructions: expect.stringContaining('Add a CNAME record'),
      });
    });
  });

  describe('deleteDomain', () => {
    it('should delete domain successfully', async () => {
      const mockDomain = {
        id: 'domain-123',
        project_id: 'project-123',
        domain: 'example.com',
        ssl_certificate_id: null,
      };

      mockDatabase.query
        .mockResolvedValueOnce({ rows: [mockDomain] }) // getDomainById
        .mockResolvedValueOnce({ rows: [] }); // DELETE query

      await domainsService.deleteDomain('domain-123');

      expect(mockDatabase.query).toHaveBeenCalledWith(
        'DELETE FROM domains WHERE id = $1',
        ['domain-123']
      );
    });

    it('should throw error for non-existent domain', async () => {
      mockDatabase.query.mockResolvedValueOnce({ rows: [] });

      await expect(domainsService.deleteDomain('nonexistent'))
        .rejects.toThrow('Domain not found');
    });
  });

  describe('updateDomain', () => {
    it('should update allowed fields', async () => {
      const mockUpdatedRow = {
        id: 'domain-123',
        project_id: 'project-123',
        domain: 'example.com',
        verified: true,
        ssl_status: 'issued',
        updated_at: new Date(),
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockUpdatedRow] });

      const result = await domainsService.updateDomain('domain-123', {
        verified: true,
        sslStatus: 'issued',
      });

      expect(mockDatabase.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE domains'),
        expect.arrayContaining([true, 'issued', 'domain-123'])
      );

      expect(result.verified).toBe(true);
      expect(result.sslStatus).toBe('issued');
    });

    it('should throw error when no valid fields provided', async () => {
      await expect(domainsService.updateDomain('domain-123', {}))
        .rejects.toThrow('No valid fields to update');
    });
  });

  describe('SSL certificate management', () => {
    beforeEach(() => {
      mockSecretsService.listSecrets.mockResolvedValue([
        {
          id: 'secret-1',
          key: 'vercel_api_token',
          value: 'encrypted_token_value',
        },
      ]);

      // Mock decrypt function
      jest.doMock('@/lib/utils/encryption', () => ({
        decrypt: jest.fn((value) => value.replace('encrypted_', '')),
      }));
    });

    it('should check SSL status', async () => {
      const mockDomain = {
        id: 'domain-123',
        sslCertificateId: 'cert-123',
        provider: 'vercel',
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockDomain] });

      // Mock fetch for SSL status check
      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          status: 'valid',
          expiresAt: '2024-12-31T00:00:00Z',
        }),
      });

      const result = await domainsService.checkSSLStatus('domain-123');

      expect(result.status).toBe('issued');
      expect(result.expiresAt).toBeDefined();
    });
  });

  describe('Domain validation', () => {
    it('should validate subdomain format correctly', () => {
      // Access private method for testing
      const isValidSubdomain = (domainsService as any).isValidSubdomain;

      expect(isValidSubdomain('my-app')).toBe(true);
      expect(isValidSubdomain('app123')).toBe(true);
      expect(isValidSubdomain('my-awesome-app')).toBe(true);

      expect(isValidSubdomain('a')).toBe(false); // Too short
      expect(isValidSubdomain('my_app')).toBe(false); // Underscore not allowed
      expect(isValidSubdomain('-myapp')).toBe(false); // Can't start with dash
      expect(isValidSubdomain('myapp-')).toBe(false); // Can't end with dash
    });
  });

  describe('Error handling', () => {
    it('should handle database errors gracefully', async () => {
      mockDatabase.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(domainsService.getProjectDomains('project-123'))
        .rejects.toThrow('Database connection failed');
    });

    it('should handle DNS resolution errors', async () => {
      const mockDomain = {
        id: 'domain-123',
        project_id: 'project-123',
        domain: 'example.com',
        domain_type: 'custom',
        verified: false,
        verification_record: 'abc123.domains.magi.dev',
      };

      mockDatabase.query.mockResolvedValueOnce({ rows: [mockDomain] });
      mockDns.resolveCname.mockRejectedValueOnce(new Error('DNS timeout'));
      mockDns.resolveTxt.mockRejectedValueOnce(new Error('DNS timeout'));

      const result = await domainsService.verifyDomain('domain-123');

      expect(result.verified).toBe(false);
      expect(result.error).toContain('Verification record not found');
    });
  });
});