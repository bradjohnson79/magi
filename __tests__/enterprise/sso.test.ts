import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SSOService } from '@/services/auth/sso';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

describe('SSO Service', () => {
  let ssoService: SSOService;

  beforeEach(() => {
    ssoService = new SSOService(mockPrisma);
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('SAML Configuration', () => {
    it('should configure SAML provider successfully', async () => {
      const organizationId = 'test-org-id';
      const config = {
        entityId: 'test-entity-id',
        ssoUrl: 'https://sso.example.com/login',
        x509cert: 'test-certificate',
        attributeMapping: {
          email: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
          firstName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname',
          lastName: 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname',
        },
      };
      const configuredBy = 'admin-user-id';

      const mockProvider = {
        id: 'provider-id',
        organizationId,
        type: 'saml',
        name: 'Test SAML Provider',
        domain: 'example.com',
        enabled: true,
        configuration: config,
        metadata: {},
        configuredBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.sSOProvider.create.mockResolvedValue(mockProvider);

      const result = await ssoService.configureSAMLProvider(
        organizationId,
        config,
        configuredBy
      );

      expect(result).toEqual(mockProvider);
      expect(mockPrisma.sSOProvider.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          type: 'saml',
          name: `SAML Provider for ${config.entityId}`,
          domain: expect.any(String),
          enabled: true,
          configuration: config,
          metadata: {},
          configuredBy,
        },
      });
    });

    it('should handle SAML configuration errors', async () => {
      const organizationId = 'test-org-id';
      const config = {
        entityId: 'test-entity-id',
        ssoUrl: 'https://sso.example.com/login',
        x509cert: 'test-certificate',
        attributeMapping: {},
      };

      mockPrisma.sSOProvider.create.mockRejectedValue(new Error('Database error'));

      await expect(
        ssoService.configureSAMLProvider(organizationId, config, 'admin-id')
      ).rejects.toThrow('Database error');
    });
  });

  describe('OIDC Configuration', () => {
    it('should configure OIDC provider successfully', async () => {
      const organizationId = 'test-org-id';
      const config = {
        issuerUrl: 'https://oidc.example.com',
        clientId: 'test-client-id',
        clientSecret: 'test-client-secret',
        scopes: ['openid', 'email', 'profile'],
        attributeMapping: {
          email: 'email',
          firstName: 'given_name',
          lastName: 'family_name',
        },
      };
      const configuredBy = 'admin-user-id';

      const mockProvider = {
        id: 'provider-id',
        organizationId,
        type: 'oidc',
        name: 'Test OIDC Provider',
        domain: 'example.com',
        enabled: true,
        configuration: config,
        metadata: {},
        configuredBy,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.sSOProvider.create.mockResolvedValue(mockProvider);

      const result = await ssoService.configureOIDCProvider(
        organizationId,
        config,
        configuredBy
      );

      expect(result).toEqual(mockProvider);
      expect(mockPrisma.sSOProvider.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          type: 'oidc',
          name: `OIDC Provider for ${config.issuerUrl}`,
          domain: expect.any(String),
          enabled: true,
          configuration: config,
          metadata: {},
          configuredBy,
        },
      });
    });
  });

  describe('SSO Login', () => {
    it('should handle successful SSO login for existing user', async () => {
      const providerId = 'provider-id';
      const userInfo = {
        externalId: 'external-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        attributes: { department: 'Engineering' },
      };

      const mockProvider = {
        id: providerId,
        organizationId: 'org-id',
        type: 'saml',
        name: 'Test Provider',
        domain: 'example.com',
        enabled: true,
      };

      const mockMapping = {
        id: 'mapping-id',
        providerId,
        externalId: userInfo.externalId,
        userId: 'user-123',
        user: {
          id: 'user-123',
          email: userInfo.email,
          clerkUserId: 'clerk-123',
        },
      };

      mockPrisma.sSOProvider.findUnique.mockResolvedValue(mockProvider);
      mockPrisma.sSOUserMapping.findUnique.mockResolvedValue(mockMapping);
      mockPrisma.user.update.mockResolvedValue({
        id: 'user-123',
        lastLogin: new Date(),
      });

      const result = await ssoService.handleSSOLogin(providerId, userInfo);

      expect(result).toEqual({
        userId: 'user-123',
        isNewUser: false,
      });

      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-123' },
        data: { lastLogin: expect.any(Date) },
      });
    });

    it('should handle SSO login for new user', async () => {
      const providerId = 'provider-id';
      const userInfo = {
        externalId: 'external-123',
        email: 'newuser@example.com',
        firstName: 'Jane',
        lastName: 'Smith',
        attributes: { department: 'Marketing' },
      };

      const mockProvider = {
        id: providerId,
        organizationId: 'org-id',
        type: 'saml',
        name: 'Test Provider',
        domain: 'example.com',
        enabled: true,
      };

      const mockUser = {
        id: 'new-user-123',
        email: userInfo.email,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        clerkUserId: 'new-clerk-123',
        organizationId: 'org-id',
        role: 'user',
        department: 'Marketing',
        isActive: true,
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMapping = {
        id: 'new-mapping-id',
        providerId,
        externalId: userInfo.externalId,
        userId: 'new-user-123',
        attributes: userInfo.attributes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.sSOProvider.findUnique.mockResolvedValue(mockProvider);
      mockPrisma.sSOUserMapping.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.sSOUserMapping.create.mockResolvedValue(mockMapping);

      const result = await ssoService.handleSSOLogin(providerId, userInfo);

      expect(result).toEqual({
        userId: 'new-user-123',
        isNewUser: true,
      });

      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          email: userInfo.email,
          firstName: userInfo.firstName,
          lastName: userInfo.lastName,
          clerkUserId: expect.any(String),
          organizationId: 'org-id',
          role: 'user',
          department: userInfo.attributes.department,
          isActive: true,
          lastLogin: expect.any(Date),
        },
      });

      expect(mockPrisma.sSOUserMapping.create).toHaveBeenCalledWith({
        data: {
          providerId,
          externalId: userInfo.externalId,
          userId: 'new-user-123',
          attributes: userInfo.attributes,
        },
      });
    });

    it('should handle disabled SSO provider', async () => {
      const providerId = 'provider-id';
      const userInfo = {
        externalId: 'external-123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
      };

      const mockProvider = {
        id: providerId,
        enabled: false,
      };

      mockPrisma.sSOProvider.findUnique.mockResolvedValue(mockProvider);

      await expect(
        ssoService.handleSSOLogin(providerId, userInfo)
      ).rejects.toThrow('SSO provider is disabled');
    });
  });

  describe('SSO Provider Management', () => {
    it('should get SSO providers for organization', async () => {
      const organizationId = 'org-id';
      const mockProviders = [
        {
          id: 'provider-1',
          organizationId,
          type: 'saml',
          name: 'SAML Provider',
          enabled: true,
        },
        {
          id: 'provider-2',
          organizationId,
          type: 'oidc',
          name: 'OIDC Provider',
          enabled: false,
        },
      ];

      mockPrisma.sSOProvider.findMany.mockResolvedValue(mockProviders);

      const result = await ssoService.getSSOProviders(organizationId);

      expect(result).toEqual(mockProviders);
      expect(mockPrisma.sSOProvider.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        orderBy: { name: 'asc' },
      });
    });

    it('should enable SSO provider', async () => {
      const providerId = 'provider-id';
      const mockProvider = {
        id: providerId,
        enabled: true,
        updatedAt: new Date(),
      };

      mockPrisma.sSOProvider.update.mockResolvedValue(mockProvider);

      const result = await ssoService.enableSSOProvider(providerId);

      expect(result).toEqual(mockProvider);
      expect(mockPrisma.sSOProvider.update).toHaveBeenCalledWith({
        where: { id: providerId },
        data: { enabled: true },
      });
    });

    it('should disable SSO provider', async () => {
      const providerId = 'provider-id';
      const mockProvider = {
        id: providerId,
        enabled: false,
        updatedAt: new Date(),
      };

      mockPrisma.sSOProvider.update.mockResolvedValue(mockProvider);

      const result = await ssoService.disableSSOProvider(providerId);

      expect(result).toEqual(mockProvider);
      expect(mockPrisma.sSOProvider.update).toHaveBeenCalledWith({
        where: { id: providerId },
        data: { enabled: false },
      });
    });
  });
});