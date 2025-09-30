import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { PlanEnforcementService } from '@/lib/middleware/plan-enforcement';
import { BillingService } from '@/lib/services/billing';
import { UserQuotaUsage } from '@/lib/types/billing';

// Mock dependencies
jest.mock('@/lib/services/billing');

const mockBillingService = {
  getUserQuotaUsage: jest.fn(),
  checkFeatureAccess: jest.fn(),
  trackUsage: jest.fn()
} as unknown as BillingService;

describe('PlanEnforcementService', () => {
  let service: PlanEnforcementService;

  beforeEach(() => {
    jest.clearAllMocks();
    (BillingService.getInstance as jest.Mock).mockReturnValue(mockBillingService);
    service = PlanEnforcementService.getInstance();
  });

  describe('canCreateProject', () => {
    test('should allow project creation when under limit', async () => {
      const mockQuotaUsage: UserQuotaUsage = {
        currentProjects: 5,
        maxProjects: 10,
        currentCollaborators: 2,
        maxCollaborators: 5,
        currentApiCalls: 1000,
        maxApiCallsPerMonth: 10000,
        currentStorageMb: 100,
        maxStorageMb: 1024
      };

      (mockBillingService.getUserQuotaUsage as jest.Mock).mockResolvedValue(mockQuotaUsage);

      const result = await service.canCreateProject('user123');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    test('should deny project creation when at limit', async () => {
      const mockQuotaUsage: UserQuotaUsage = {
        currentProjects: 10,
        maxProjects: 10,
        currentCollaborators: 2,
        maxCollaborators: 5,
        currentApiCalls: 1000,
        maxApiCallsPerMonth: 10000,
        currentStorageMb: 100,
        maxStorageMb: 1024
      };

      (mockBillingService.getUserQuotaUsage as jest.Mock).mockResolvedValue(mockQuotaUsage);

      const result = await service.canCreateProject('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Project limit reached');
      expect(result.upgradeRequired).toBe(true);
      expect(result.currentUsage).toBe(10);
      expect(result.limit).toBe(10);
    });

    test('should handle errors gracefully', async () => {
      (mockBillingService.getUserQuotaUsage as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await service.canCreateProject('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Unable to verify project limits');
    });
  });

  describe('canAddCollaborator', () => {
    test('should allow collaborator addition when under limit', async () => {
      const mockQuotaUsage: UserQuotaUsage = {
        currentProjects: 5,
        maxProjects: 10,
        currentCollaborators: 3,
        maxCollaborators: 5,
        currentApiCalls: 1000,
        maxApiCallsPerMonth: 10000,
        currentStorageMb: 100,
        maxStorageMb: 1024
      };

      (mockBillingService.getUserQuotaUsage as jest.Mock).mockResolvedValue(mockQuotaUsage);

      const result = await service.canAddCollaborator('user123');

      expect(result.allowed).toBe(true);
    });

    test('should deny collaborator addition when at limit', async () => {
      const mockQuotaUsage: UserQuotaUsage = {
        currentProjects: 5,
        maxProjects: 10,
        currentCollaborators: 5,
        maxCollaborators: 5,
        currentApiCalls: 1000,
        maxApiCallsPerMonth: 10000,
        currentStorageMb: 100,
        maxStorageMb: 1024
      };

      (mockBillingService.getUserQuotaUsage as jest.Mock).mockResolvedValue(mockQuotaUsage);

      const result = await service.canAddCollaborator('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Collaborator limit reached');
      expect(result.upgradeRequired).toBe(true);
    });
  });

  describe('canMakeApiCall', () => {
    test('should allow API call when under limit', async () => {
      const mockQuotaUsage: UserQuotaUsage = {
        currentProjects: 5,
        maxProjects: 10,
        currentCollaborators: 3,
        maxCollaborators: 5,
        currentApiCalls: 5000,
        maxApiCallsPerMonth: 10000,
        currentStorageMb: 100,
        maxStorageMb: 1024
      };

      (mockBillingService.getUserQuotaUsage as jest.Mock).mockResolvedValue(mockQuotaUsage);

      const result = await service.canMakeApiCall('user123');

      expect(result.allowed).toBe(true);
    });

    test('should deny API call when at limit', async () => {
      const mockQuotaUsage: UserQuotaUsage = {
        currentProjects: 5,
        maxProjects: 10,
        currentCollaborators: 3,
        maxCollaborators: 5,
        currentApiCalls: 10000,
        maxApiCallsPerMonth: 10000,
        currentStorageMb: 100,
        maxStorageMb: 1024
      };

      (mockBillingService.getUserQuotaUsage as jest.Mock).mockResolvedValue(mockQuotaUsage);

      const result = await service.canMakeApiCall('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('API call limit reached');
      expect(result.upgradeRequired).toBe(true);
    });
  });

  describe('canUseTemplates', () => {
    test('should allow templates when user has access', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(true);

      const result = await service.canUseTemplates('user123');

      expect(mockBillingService.checkFeatureAccess).toHaveBeenCalledWith('user123', 'templates');
      expect(result.allowed).toBe(true);
    });

    test('should deny templates when user lacks access', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(false);

      const result = await service.canUseTemplates('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Templates are only available on the Teams plan');
      expect(result.upgradeRequired).toBe(true);
    });
  });

  describe('canUsePlugins', () => {
    test('should allow plugins when user has access', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(true);

      const result = await service.canUsePlugins('user123');

      expect(mockBillingService.checkFeatureAccess).toHaveBeenCalledWith('user123', 'plugins');
      expect(result.allowed).toBe(true);
    });

    test('should deny plugins when user lacks access', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(false);

      const result = await service.canUsePlugins('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Plugins are only available on the Teams plan');
      expect(result.upgradeRequired).toBe(true);
    });
  });

  describe('canUseCustomDomains', () => {
    test('should allow custom domains when user has access', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(true);

      const result = await service.canUseCustomDomains('user123');

      expect(mockBillingService.checkFeatureAccess).toHaveBeenCalledWith('user123', 'custom_domains');
      expect(result.allowed).toBe(true);
    });

    test('should deny custom domains when user lacks access', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(false);

      const result = await service.canUseCustomDomains('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Custom domains are only available on the Teams plan');
      expect(result.upgradeRequired).toBe(true);
    });
  });

  describe('canUseAdvancedAnalytics', () => {
    test('should allow advanced analytics when user has access', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(true);

      const result = await service.canUseAdvancedAnalytics('user123');

      expect(mockBillingService.checkFeatureAccess).toHaveBeenCalledWith('user123', 'advanced_analytics');
      expect(result.allowed).toBe(true);
    });

    test('should deny advanced analytics when user lacks access', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(false);

      const result = await service.canUseAdvancedAnalytics('user123');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Advanced analytics are only available on the Teams plan');
      expect(result.upgradeRequired).toBe(true);
    });
  });

  describe('hasPrioritySupport', () => {
    test('should return true when user has priority support', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(true);

      const result = await service.hasPrioritySupport('user123');

      expect(mockBillingService.checkFeatureAccess).toHaveBeenCalledWith('user123', 'priority_support');
      expect(result).toBe(true);
    });

    test('should return false when user lacks priority support', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockResolvedValue(false);

      const result = await service.hasPrioritySupport('user123');

      expect(result).toBe(false);
    });

    test('should return false on error', async () => {
      (mockBillingService.checkFeatureAccess as jest.Mock).mockRejectedValue(new Error('Database error'));

      const result = await service.hasPrioritySupport('user123');

      expect(result).toBe(false);
    });
  });

  describe('Usage Tracking', () => {
    test('should track project creation', async () => {
      (mockBillingService.trackUsage as jest.Mock).mockResolvedValue(undefined);

      await service.trackProjectCreation('user123');

      expect(mockBillingService.trackUsage).toHaveBeenCalledWith('user123', {
        projectsCreated: 1
      });
    });

    test('should track collaborator addition', async () => {
      (mockBillingService.trackUsage as jest.Mock).mockResolvedValue(undefined);

      await service.trackCollaboratorAddition('user123');

      expect(mockBillingService.trackUsage).toHaveBeenCalledWith('user123', {
        collaboratorsAdded: 1
      });
    });

    test('should track API call', async () => {
      (mockBillingService.trackUsage as jest.Mock).mockResolvedValue(undefined);

      await service.trackApiCall('user123');

      expect(mockBillingService.trackUsage).toHaveBeenCalledWith('user123', {
        apiCalls: 1
      });
    });

    test('should track storage usage', async () => {
      (mockBillingService.trackUsage as jest.Mock).mockResolvedValue(undefined);

      await service.trackStorageUsage('user123', 100);

      expect(mockBillingService.trackUsage).toHaveBeenCalledWith('user123', {
        storageUsedMb: 100
      });
    });

    test('should track template usage', async () => {
      (mockBillingService.trackUsage as jest.Mock).mockResolvedValue(undefined);

      await service.trackTemplateUsage('user123');

      expect(mockBillingService.trackUsage).toHaveBeenCalledWith('user123', {
        templatesUsed: 1
      });
    });

    test('should track plugin usage', async () => {
      (mockBillingService.trackUsage as jest.Mock).mockResolvedValue(undefined);

      await service.trackPluginUsage('user123');

      expect(mockBillingService.trackUsage).toHaveBeenCalledWith('user123', {
        pluginsUsed: 1
      });
    });

    test('should handle tracking errors gracefully', async () => {
      (mockBillingService.trackUsage as jest.Mock).mockRejectedValue(new Error('Tracking failed'));

      // Should not throw
      await expect(service.trackProjectCreation('user123')).resolves.toBeUndefined();
    });
  });

  describe('Helper Methods', () => {
    test('should generate appropriate upgrade messages', () => {
      const messages = {
        projects: service.getUpgradeMessage('projects'),
        collaborators: service.getUpgradeMessage('collaborators'),
        templates: service.getUpgradeMessage('templates'),
        plugins: service.getUpgradeMessage('plugins'),
        custom_domains: service.getUpgradeMessage('custom_domains'),
        advanced_analytics: service.getUpgradeMessage('advanced_analytics'),
        api_calls: service.getUpgradeMessage('api_calls'),
        unknown: service.getUpgradeMessage('unknown_feature')
      };

      expect(messages.projects).toContain('Upgrade to Teams');
      expect(messages.collaborators).toContain('team members');
      expect(messages.templates).toContain('premium templates');
      expect(messages.plugins).toContain('powerful plugins');
      expect(messages.custom_domains).toContain('custom domains');
      expect(messages.advanced_analytics).toContain('detailed analytics');
      expect(messages.api_calls).toContain('API limits');
      expect(messages.unknown).toContain('Upgrade to Teams');
    });

    test('should return plan comparison data', () => {
      const comparison = service.getPlanComparison();

      expect(comparison.solo).toContain('10 projects');
      expect(comparison.solo).toContain('1 collaborator');
      expect(comparison.teams).toContain('100 projects');
      expect(comparison.teams).toContain('20 collaborators');
      expect(comparison.teams).toContain('Templates & plugins');
    });
  });
});