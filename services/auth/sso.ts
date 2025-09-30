/**
 * Single Sign-On (SSO) Service
 *
 * Handles enterprise SSO integration with SAML and OIDC providers
 * using Clerk's enterprise features for authentication and user management.
 */

import { clerkClient } from '@clerk/nextjs/server';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { prisma } from '@/lib/prisma';

export interface SAMLConfiguration {
  providerId: string;
  providerName: string;
  metadataUrl?: string;
  metadataXml?: string;
  ssoUrl: string;
  certificate: string;
  signRequests: boolean;
  attributeMapping: {
    email: string;
    firstName?: string;
    lastName?: string;
    department?: string;
    role?: string;
  };
}

export interface OIDCConfiguration {
  providerId: string;
  providerName: string;
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  scopes: string[];
  attributeMapping: {
    email: string;
    firstName?: string;
    lastName?: string;
    department?: string;
    role?: string;
  };
}

export interface SSOProvider {
  id: string;
  organizationId: string;
  type: 'saml' | 'oidc';
  name: string;
  domain: string;
  enabled: boolean;
  configuration: SAMLConfiguration | OIDCConfiguration;
  metadata: {
    userCount: number;
    lastSync: Date;
    syncStatus: 'active' | 'error' | 'pending';
    errorMessage?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface SSOUserMapping {
  id: string;
  userId: string;
  ssoProviderId: string;
  externalId: string;
  attributes: Record<string, any>;
  lastLogin: Date;
  createdAt: Date;
}

export interface OrganizationSSOSettings {
  organizationId: string;
  enforceSSO: boolean;
  allowedDomains: string[];
  defaultRole: string;
  autoProvision: boolean;
  attributeMapping: {
    role?: string;
    department?: string;
    team?: string;
  };
  sessionSettings: {
    maxSessionDuration: number;
    requireReauth: boolean;
    idleTimeout: number;
  };
}

export class SSOService {
  private static instance: SSOService;

  public static getInstance(): SSOService {
    if (!SSOService.instance) {
      SSOService.instance = new SSOService();
    }
    return SSOService.instance;
  }

  /**
   * Configure SAML SSO for an organization
   */
  async configureSAMLProvider(
    organizationId: string,
    config: SAMLConfiguration,
    configuredBy: string
  ): Promise<SSOProvider> {
    return withSpan('sso.configure_saml', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'sso_saml_configure',
        [SPAN_ATTRIBUTES.USER_ID]: configuredBy,
        'organization.id': organizationId,
        'provider.name': config.providerName,
      });

      // Validate SAML configuration
      this.validateSAMLConfig(config);

      // Create SSO provider in Clerk
      const clerkProvider = await clerkClient.samlConnections.createSAMLConnection({
        name: config.providerName,
        domain: this.extractDomainFromConfig(config),
        provider: config.providerId,
        attribute_mapping: {
          email_address: config.attributeMapping.email,
          first_name: config.attributeMapping.firstName,
          last_name: config.attributeMapping.lastName,
        },
      });

      // Store provider configuration
      const provider = await prisma.ssoProvider.create({
        data: {
          id: clerkProvider.id,
          organizationId,
          type: 'saml',
          name: config.providerName,
          domain: this.extractDomainFromConfig(config),
          enabled: true,
          configuration: config as any,
          metadata: {
            userCount: 0,
            lastSync: new Date(),
            syncStatus: 'pending',
          },
          configuredBy,
        },
      });

      // Log configuration event
      await this.logSSOEvent({
        type: 'sso_provider_configured',
        organizationId,
        providerId: provider.id,
        userId: configuredBy,
        details: {
          providerType: 'saml',
          providerName: config.providerName,
          domain: provider.domain,
        },
      });

      addSpanAttributes(span, {
        'provider.id': provider.id,
        'provider.domain': provider.domain,
      });

      return this.formatSSOProvider(provider);
    });
  }

  /**
   * Configure OIDC SSO for an organization
   */
  async configureOIDCProvider(
    organizationId: string,
    config: OIDCConfiguration,
    configuredBy: string
  ): Promise<SSOProvider> {
    return withSpan('sso.configure_oidc', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'sso_oidc_configure',
        [SPAN_ATTRIBUTES.USER_ID]: configuredBy,
        'organization.id': organizationId,
        'provider.name': config.providerName,
      });

      // Validate OIDC configuration
      this.validateOIDCConfig(config);

      // Create OIDC provider in Clerk
      const clerkProvider = await clerkClient.allowlistIdentifiers.create({
        identifier: config.clientId,
        notify: false,
      });

      // Store provider configuration
      const provider = await prisma.ssoProvider.create({
        data: {
          organizationId,
          type: 'oidc',
          name: config.providerName,
          domain: this.extractDomainFromIssuer(config.issuerUrl),
          enabled: true,
          configuration: config as any,
          metadata: {
            userCount: 0,
            lastSync: new Date(),
            syncStatus: 'pending',
          },
          configuredBy,
        },
      });

      // Log configuration event
      await this.logSSOEvent({
        type: 'sso_provider_configured',
        organizationId,
        providerId: provider.id,
        userId: configuredBy,
        details: {
          providerType: 'oidc',
          providerName: config.providerName,
          issuerUrl: config.issuerUrl,
        },
      });

      return this.formatSSOProvider(provider);
    });
  }

  /**
   * Handle SSO login callback
   */
  async handleSSOLogin(
    providerId: string,
    userInfo: {
      externalId: string;
      email: string;
      firstName?: string;
      lastName?: string;
      attributes?: Record<string, any>;
    }
  ): Promise<{ userId: string; isNewUser: boolean }> {
    return withSpan('sso.handle_login', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'sso_login',
        'provider.id': providerId,
        'user.email': userInfo.email,
      });

      const provider = await this.getSSOProvider(providerId);
      if (!provider || !provider.enabled) {
        throw new Error('SSO provider not found or disabled');
      }

      // Check for existing SSO mapping
      let ssoMapping = await prisma.ssoUserMapping.findUnique({
        where: {
          providerId_externalId: {
            ssoProviderId: providerId,
            externalId: userInfo.externalId,
          },
        },
        include: { user: true },
      });

      let userId: string;
      let isNewUser = false;

      if (ssoMapping) {
        // Update existing mapping
        userId = ssoMapping.userId;
        await prisma.ssoUserMapping.update({
          where: { id: ssoMapping.id },
          data: {
            attributes: userInfo.attributes || {},
            lastLogin: new Date(),
          },
        });
      } else {
        // Check for existing user by email
        let user = await prisma.user.findUnique({
          where: { email: userInfo.email },
        });

        if (!user) {
          // Auto-provision new user if enabled
          const orgSettings = await this.getOrganizationSSOSettings(provider.organizationId);
          if (!orgSettings.autoProvision) {
            throw new Error('User auto-provisioning is disabled');
          }

          user = await prisma.user.create({
            data: {
              email: userInfo.email,
              name: `${userInfo.firstName || ''} ${userInfo.lastName || ''}`.trim(),
              role: orgSettings.defaultRole,
              metadata: {
                ssoProvisioned: true,
                ssoProvider: providerId,
                provisionedAt: new Date().toISOString(),
              },
            },
          });

          isNewUser = true;
        }

        userId = user.id;

        // Create SSO mapping
        await prisma.ssoUserMapping.create({
          data: {
            userId,
            ssoProviderId: providerId,
            externalId: userInfo.externalId,
            attributes: userInfo.attributes || {},
            lastLogin: new Date(),
          },
        });
      }

      // Log SSO login event
      await this.logSSOEvent({
        type: 'sso_login_success',
        organizationId: provider.organizationId,
        providerId,
        userId,
        details: {
          isNewUser,
          email: userInfo.email,
          externalId: userInfo.externalId,
        },
      });

      // Update provider user count
      await this.updateProviderUserCount(providerId);

      addSpanAttributes(span, {
        'user.id': userId,
        'login.is_new_user': isNewUser,
      });

      return { userId, isNewUser };
    });
  }

  /**
   * Get organization SSO settings
   */
  async getOrganizationSSOSettings(organizationId: string): Promise<OrganizationSSOSettings> {
    return withSpan('sso.get_org_settings', async (span) => {
      const settings = await prisma.organizationSSOSettings.findUnique({
        where: { organizationId },
      });

      if (!settings) {
        // Return default settings
        return {
          organizationId,
          enforceSSO: false,
          allowedDomains: [],
          defaultRole: 'user',
          autoProvision: true,
          attributeMapping: {},
          sessionSettings: {
            maxSessionDuration: 8 * 60 * 60 * 1000, // 8 hours
            requireReauth: false,
            idleTimeout: 30 * 60 * 1000, // 30 minutes
          },
        };
      }

      return {
        organizationId: settings.organizationId,
        enforceSSO: settings.enforceSSO,
        allowedDomains: settings.allowedDomains,
        defaultRole: settings.defaultRole,
        autoProvision: settings.autoProvision,
        attributeMapping: settings.attributeMapping as any,
        sessionSettings: settings.sessionSettings as any,
      };
    });
  }

  /**
   * Update organization SSO settings
   */
  async updateOrganizationSSOSettings(
    organizationId: string,
    settings: Partial<OrganizationSSOSettings>,
    updatedBy: string
  ): Promise<OrganizationSSOSettings> {
    return withSpan('sso.update_org_settings', async (span) => {
      const updatedSettings = await prisma.organizationSSOSettings.upsert({
        where: { organizationId },
        create: {
          organizationId,
          enforceSSO: settings.enforceSSO || false,
          allowedDomains: settings.allowedDomains || [],
          defaultRole: settings.defaultRole || 'user',
          autoProvision: settings.autoProvision || true,
          attributeMapping: settings.attributeMapping || {},
          sessionSettings: settings.sessionSettings || {
            maxSessionDuration: 8 * 60 * 60 * 1000,
            requireReauth: false,
            idleTimeout: 30 * 60 * 1000,
          },
        },
        update: {
          enforceSSO: settings.enforceSSO,
          allowedDomains: settings.allowedDomains,
          defaultRole: settings.defaultRole,
          autoProvision: settings.autoProvision,
          attributeMapping: settings.attributeMapping,
          sessionSettings: settings.sessionSettings,
        },
      });

      // Log settings update
      await this.logSSOEvent({
        type: 'sso_settings_updated',
        organizationId,
        userId: updatedBy,
        details: {
          changes: settings,
        },
      });

      return this.getOrganizationSSOSettings(organizationId);
    });
  }

  /**
   * List SSO providers for an organization
   */
  async listSSOProviders(
    organizationId: string,
    options: {
      type?: 'saml' | 'oidc';
      enabled?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ providers: SSOProvider[]; total: number }> {
    return withSpan('sso.list_providers', async (span) => {
      const where: any = { organizationId };

      if (options.type) {
        where.type = options.type;
      }

      if (options.enabled !== undefined) {
        where.enabled = options.enabled;
      }

      const [providers, total] = await Promise.all([
        prisma.ssoProvider.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: options.limit || 20,
          skip: options.offset || 0,
        }),
        prisma.ssoProvider.count({ where }),
      ]);

      addSpanAttributes(span, {
        'providers.count': providers.length,
        'providers.total': total,
      });

      return {
        providers: providers.map(p => this.formatSSOProvider(p)),
        total,
      };
    });
  }

  /**
   * Sync users from SSO provider
   */
  async syncSSOUsers(providerId: string, syncedBy: string): Promise<{
    usersCreated: number;
    usersUpdated: number;
    errors: string[];
  }> {
    return withSpan('sso.sync_users', async (span) => {
      const provider = await this.getSSOProvider(providerId);
      if (!provider) {
        throw new Error('SSO provider not found');
      }

      let usersCreated = 0;
      let usersUpdated = 0;
      const errors: string[] = [];

      try {
        // Update sync status
        await prisma.ssoProvider.update({
          where: { id: providerId },
          data: {
            metadata: {
              ...provider.metadata,
              syncStatus: 'active',
              lastSync: new Date(),
            },
          },
        });

        // Implement actual user sync based on provider type
        if (provider.type === 'saml') {
          // SAML user sync implementation
          const result = await this.syncSAMLUsers(provider);
          usersCreated = result.usersCreated;
          usersUpdated = result.usersUpdated;
          errors.push(...result.errors);
        } else {
          // OIDC user sync implementation
          const result = await this.syncOIDCUsers(provider);
          usersCreated = result.usersCreated;
          usersUpdated = result.usersUpdated;
          errors.push(...result.errors);
        }

        // Update sync status to completed
        await prisma.ssoProvider.update({
          where: { id: providerId },
          data: {
            metadata: {
              ...provider.metadata,
              syncStatus: errors.length > 0 ? 'error' : 'active',
              lastSync: new Date(),
              errorMessage: errors.length > 0 ? errors.join(', ') : undefined,
            },
          },
        });

        // Log sync event
        await this.logSSOEvent({
          type: 'sso_user_sync',
          organizationId: provider.organizationId,
          providerId,
          userId: syncedBy,
          details: {
            usersCreated,
            usersUpdated,
            errors: errors.length,
          },
        });

        addSpanAttributes(span, {
          'sync.users_created': usersCreated,
          'sync.users_updated': usersUpdated,
          'sync.errors': errors.length,
        });

      } catch (error) {
        // Update sync status to error
        await prisma.ssoProvider.update({
          where: { id: providerId },
          data: {
            metadata: {
              ...provider.metadata,
              syncStatus: 'error',
              errorMessage: (error as Error).message,
            },
          },
        });

        throw error;
      }

      return { usersCreated, usersUpdated, errors };
    });
  }

  /**
   * Private helper methods
   */
  private async getSSOProvider(providerId: string): Promise<any> {
    return prisma.ssoProvider.findUnique({
      where: { id: providerId },
    });
  }

  private formatSSOProvider(provider: any): SSOProvider {
    return {
      id: provider.id,
      organizationId: provider.organizationId,
      type: provider.type,
      name: provider.name,
      domain: provider.domain,
      enabled: provider.enabled,
      configuration: provider.configuration,
      metadata: provider.metadata,
      createdAt: provider.createdAt,
      updatedAt: provider.updatedAt,
    };
  }

  private validateSAMLConfig(config: SAMLConfiguration): void {
    if (!config.ssoUrl) {
      throw new Error('SSO URL is required for SAML configuration');
    }
    if (!config.certificate) {
      throw new Error('Certificate is required for SAML configuration');
    }
    if (!config.attributeMapping.email) {
      throw new Error('Email attribute mapping is required');
    }
  }

  private validateOIDCConfig(config: OIDCConfiguration): void {
    if (!config.clientId) {
      throw new Error('Client ID is required for OIDC configuration');
    }
    if (!config.clientSecret) {
      throw new Error('Client Secret is required for OIDC configuration');
    }
    if (!config.issuerUrl) {
      throw new Error('Issuer URL is required for OIDC configuration');
    }
    if (!config.attributeMapping.email) {
      throw new Error('Email attribute mapping is required');
    }
  }

  private extractDomainFromConfig(config: SAMLConfiguration): string {
    // Extract domain from SSO URL or metadata
    try {
      const url = new URL(config.ssoUrl);
      return url.hostname;
    } catch {
      return 'unknown-domain.com';
    }
  }

  private extractDomainFromIssuer(issuerUrl: string): string {
    try {
      const url = new URL(issuerUrl);
      return url.hostname;
    } catch {
      return 'unknown-domain.com';
    }
  }

  private async logSSOEvent(event: {
    type: string;
    organizationId: string;
    providerId?: string;
    userId?: string;
    details: Record<string, any>;
  }): Promise<void> {
    await prisma.auditLog.create({
      data: {
        userId: event.userId,
        action: `sso.${event.type}`,
        resource: 'sso_provider',
        resourceId: event.providerId,
        details: {
          organizationId: event.organizationId,
          ...event.details,
        },
        severity: 'info',
        outcome: 'success',
      },
    });
  }

  private async updateProviderUserCount(providerId: string): Promise<void> {
    const userCount = await prisma.ssoUserMapping.count({
      where: { ssoProviderId: providerId },
    });

    await prisma.ssoProvider.update({
      where: { id: providerId },
      data: {
        metadata: {
          userCount,
          lastSync: new Date(),
          syncStatus: 'active',
        },
      },
    });
  }

  private async syncSAMLUsers(provider: any): Promise<{
    usersCreated: number;
    usersUpdated: number;
    errors: string[];
  }> {
    // Placeholder for SAML user sync
    // In a real implementation, this would connect to the SAML provider
    // and fetch user information
    return {
      usersCreated: 0,
      usersUpdated: 0,
      errors: [],
    };
  }

  private async syncOIDCUsers(provider: any): Promise<{
    usersCreated: number;
    usersUpdated: number;
    errors: string[];
  }> {
    // Placeholder for OIDC user sync
    // In a real implementation, this would connect to the OIDC provider
    // and fetch user information
    return {
      usersCreated: 0,
      usersUpdated: 0,
      errors: [],
    };
  }
}

export const ssoService = SSOService.getInstance();