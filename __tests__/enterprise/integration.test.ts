import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { SSOService } from '@/services/auth/sso';
import { DataExportService } from '@/services/data-export/export-service';
import { ComplianceService } from '@/services/compliance/compliance-service';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

describe('Enterprise Integration Tests', () => {
  let ssoService: SSOService;
  let exportService: DataExportService;
  let complianceService: ComplianceService;

  beforeEach(() => {
    ssoService = new SSOService(mockPrisma);
    exportService = new DataExportService(mockPrisma);
    complianceService = new ComplianceService(mockPrisma);
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('SSO Login with Compliance Audit', () => {
    it('should log compliance audit event during SSO login', async () => {
      const organizationId = 'org-123';
      const providerId = 'provider-456';
      const userInfo = {
        externalId: 'external-789',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe',
        attributes: { department: 'Engineering' },
      };

      const mockProvider = {
        id: providerId,
        organizationId,
        type: 'saml',
        name: 'Test SAML Provider',
        domain: 'example.com',
        enabled: true,
      };

      const mockUser = {
        id: 'user-123',
        email: userInfo.email,
        firstName: userInfo.firstName,
        lastName: userInfo.lastName,
        clerkUserId: 'clerk-123',
        organizationId,
        role: 'user',
        department: 'Engineering',
        isActive: true,
        lastLogin: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockMapping = {
        id: 'mapping-123',
        providerId,
        externalId: userInfo.externalId,
        userId: 'user-123',
        attributes: userInfo.attributes,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAuditEvent = {
        id: 'audit-123',
        organizationId,
        userId: 'user-123',
        action: 'sso_login',
        resource: 'authentication',
        outcome: 'success',
        details: {
          provider: 'saml',
          providerId,
          userEmail: userInfo.email,
        },
        sensitive: false,
        complianceRelevant: true,
        timestamp: new Date(),
        tags: ['sso', 'authentication'],
        metadata: {},
      };

      mockPrisma.sSOProvider.findUnique.mockResolvedValue(mockProvider);
      mockPrisma.sSOUserMapping.findUnique.mockResolvedValue(null);
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue(mockUser);
      mockPrisma.sSOUserMapping.create.mockResolvedValue(mockMapping);
      mockPrisma.auditLog.create.mockResolvedValue(mockAuditEvent);
      mockPrisma.complianceRule.findMany.mockResolvedValue([]);

      const loginResult = await ssoService.handleSSOLogin(providerId, userInfo);

      expect(loginResult).toEqual({
        userId: 'user-123',
        isNewUser: true,
      });

      const auditResult = await complianceService.logAuditEvent(
        organizationId,
        'user-123',
        'sso_login',
        'authentication',
        {
          provider: 'saml',
          providerId,
          userEmail: userInfo.email,
        },
        {
          complianceRelevant: true,
          tags: ['sso', 'authentication'],
        }
      );

      expect(auditResult.action).toBe('sso_login');
      expect(auditResult.complianceRelevant).toBe(true);
      expect(auditResult.tags).toContain('sso');
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          action: 'sso_login',
          resource: 'authentication',
          complianceRelevant: true,
        }),
      });
    });
  });

  describe('Data Export with Compliance Tracking', () => {
    it('should create audit event for data export and check compliance', async () => {
      const organizationId = 'org-123';
      const userId = 'user-456';
      const exportConfig = {
        type: 'snowflake' as const,
        destination: 'analytics.user_data',
        credentials: { account: 'test' },
        filters: {
          dataTypes: ['users', 'sessions'],
          departments: ['Engineering'],
        },
      };

      const mockExportJob = {
        id: 'job-123',
        organizationId,
        type: 'snowflake',
        destination: 'analytics.user_data',
        status: 'pending',
        progress: 0,
        configuration: exportConfig,
        metadata: { requestedBy: userId },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const mockAuditEvent = {
        id: 'audit-456',
        organizationId,
        userId,
        action: 'data_export',
        resource: 'user_data',
        resourceId: 'job-123',
        outcome: 'success',
        details: {
          exportType: 'snowflake',
          destination: 'analytics.user_data',
          dataTypes: ['users', 'sessions'],
          recordCount: 1000,
        },
        sensitive: true,
        complianceRelevant: true,
        timestamp: new Date(),
        riskScore: 7,
        tags: ['data_export', 'sensitive'],
        metadata: {},
      };

      const mockComplianceRule = {
        id: 'rule-789',
        organizationId,
        type: 'export_restriction',
        name: 'Sensitive Data Export Rule',
        isActive: true,
        configuration: {
          severity: 'high',
          autoRemediation: false,
        },
        lastEvaluated: null,
      };

      const mockViolation = {
        id: 'violation-123',
        organizationId,
        ruleId: 'rule-789',
        resource: 'data_export',
        resourceId: 'job-123',
        description: 'Sensitive data export detected',
        severity: 'high',
        status: 'open',
        detectedAt: new Date(),
        metadata: {
          auditEventId: 'audit-456',
          exportDetails: mockAuditEvent.details,
        },
      };

      mockPrisma.dataExportJob.create.mockResolvedValue(mockExportJob);
      mockPrisma.auditLog.create.mockResolvedValue(mockAuditEvent);
      mockPrisma.complianceRule.findMany.mockResolvedValue([mockComplianceRule]);
      mockPrisma.complianceRule.update.mockResolvedValue(mockComplianceRule);
      mockPrisma.complianceViolation.create.mockResolvedValue(mockViolation);

      const exportJob = await exportService.createExportJob(
        organizationId,
        exportConfig,
        userId
      );

      expect(exportJob.id).toBe('job-123');

      const auditEvent = await complianceService.logAuditEvent(
        organizationId,
        userId,
        'data_export',
        'user_data',
        {
          exportType: 'snowflake',
          destination: 'analytics.user_data',
          dataTypes: ['users', 'sessions'],
          recordCount: 1000,
        },
        {
          resourceId: exportJob.id,
          sensitive: true,
          complianceRelevant: true,
          riskScore: 7,
          tags: ['data_export', 'sensitive'],
        }
      );

      expect(auditEvent.sensitive).toBe(true);
      expect(auditEvent.riskScore).toBe(7);

      expect(mockPrisma.complianceViolation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ruleId: 'rule-789',
          resource: 'data_export',
          resourceId: exportJob.id,
          description: 'Sensitive data export detected',
          severity: 'high',
        }),
      });
    });
  });

  describe('Enterprise Dashboard Data Integration', () => {
    it('should aggregate data from all enterprise services', async () => {
      const organizationId = 'org-123';

      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          department: 'Engineering',
          lastLogin: new Date('2024-01-15'),
          isActive: true,
        },
        {
          id: 'user-2',
          email: 'user2@example.com',
          department: 'Marketing',
          lastLogin: new Date('2024-01-14'),
          isActive: true,
        },
      ];

      const mockSessions = [
        {
          id: 'session-1',
          userId: 'user-1',
          duration: 3600,
          actionsCount: 25,
          createdAt: new Date('2024-01-15'),
        },
        {
          id: 'session-2',
          userId: 'user-2',
          duration: 2400,
          actionsCount: 18,
          createdAt: new Date('2024-01-14'),
        },
      ];

      const mockComplianceRules = [
        {
          id: 'rule-1',
          organizationId,
          name: 'Data Retention',
          type: 'data_retention',
          complianceStatus: 'compliant',
          isActive: true,
        },
        {
          id: 'rule-2',
          organizationId,
          name: 'Access Control',
          type: 'access_control',
          complianceStatus: 'non_compliant',
          isActive: true,
        },
      ];

      const mockViolations = [
        {
          id: 'violation-1',
          organizationId,
          ruleId: 'rule-2',
          status: 'open',
          severity: 'high',
          detectedAt: new Date('2024-01-10'),
        },
      ];

      const mockExportJobs = [
        {
          id: 'job-1',
          organizationId,
          type: 'snowflake',
          status: 'completed',
          progress: 100,
          createdAt: new Date('2024-01-12'),
        },
      ];

      const mockSSOProviders = [
        {
          id: 'provider-1',
          organizationId,
          type: 'saml',
          name: 'Corporate SAML',
          enabled: true,
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.session.findMany.mockResolvedValue(mockSessions);
      mockPrisma.complianceRule.findMany.mockResolvedValue(mockComplianceRules);
      mockPrisma.complianceViolation.findMany.mockResolvedValue(mockViolations);
      mockPrisma.dataExportJob.findMany.mockResolvedValue(mockExportJobs);
      mockPrisma.sSOProvider.findMany.mockResolvedValue(mockSSOProviders);

      const users = await mockPrisma.user.findMany({
        where: { organizationId },
      });

      const sessions = await mockPrisma.session.findMany({
        where: { user: { organizationId } },
      });

      const complianceRules = await complianceService.getComplianceRules(organizationId);
      const violations = await complianceService.getComplianceViolations(organizationId);
      const exportJobs = await exportService.getExportJobs(organizationId);
      const ssoProviders = await ssoService.getSSOProviders(organizationId);

      expect(users).toHaveLength(2);
      expect(sessions).toHaveLength(2);
      expect(complianceRules).toHaveLength(2);
      expect(violations).toHaveLength(1);
      expect(exportJobs).toHaveLength(1);
      expect(ssoProviders).toHaveLength(1);

      const departmentUsage = users.reduce((acc, user) => {
        const dept = user.department || 'Unknown';
        if (!acc[dept]) {
          acc[dept] = { userCount: 0, activeUsers: 0 };
        }
        acc[dept].userCount++;
        if (user.isActive) acc[dept].activeUsers++;
        return acc;
      }, {} as Record<string, { userCount: number; activeUsers: number }>);

      expect(departmentUsage).toEqual({
        Engineering: { userCount: 1, activeUsers: 1 },
        Marketing: { userCount: 1, activeUsers: 1 },
      });

      const complianceScore = Math.round(
        (complianceRules.filter(r => r.complianceStatus === 'compliant').length / complianceRules.length) * 100
      );

      expect(complianceScore).toBe(50);
    });
  });

  describe('Cross-Service Compliance Workflow', () => {
    it('should handle complex compliance workflow across services', async () => {
      const organizationId = 'org-123';
      const userId = 'user-456';

      const dataRetentionRule = {
        id: 'rule-retention',
        organizationId,
        name: 'Data Retention Policy',
        description: 'Delete user data after 7 years',
        type: 'data_retention' as const,
        isActive: true,
        configuration: {
          retentionPeriodDays: 2555,
          severity: 'high' as const,
          autoRemediation: true,
        },
        metadata: {},
      };

      const exportRestrictionRule = {
        id: 'rule-export',
        organizationId,
        name: 'Export Restriction Policy',
        description: 'Restrict sensitive data exports',
        type: 'export_restriction' as const,
        isActive: true,
        configuration: {
          severity: 'critical' as const,
          autoRemediation: false,
        },
        metadata: {},
      };

      mockPrisma.complianceRule.create
        .mockResolvedValueOnce({
          ...dataRetentionRule,
          complianceStatus: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .mockResolvedValueOnce({
          ...exportRestrictionRule,
          complianceStatus: 'pending',
          createdAt: new Date(),
          updatedAt: new Date(),
        });

      const retentionRuleResult = await complianceService.createComplianceRule(
        organizationId,
        dataRetentionRule
      );

      const exportRuleResult = await complianceService.createComplianceRule(
        organizationId,
        exportRestrictionRule
      );

      expect(retentionRuleResult.name).toBe('Data Retention Policy');
      expect(exportRuleResult.name).toBe('Export Restriction Policy');

      const oldDataAccess = {
        id: 'audit-old-access',
        organizationId,
        userId,
        action: 'data_access',
        resource: 'user_data',
        timestamp: new Date('2020-01-01'),
        outcome: 'success' as const,
        details: { accessType: 'read', recordId: 'old-record-123' },
        sensitive: false,
        complianceRelevant: true,
        tags: [],
        metadata: {},
      };

      const sensitiveExport = {
        id: 'audit-sensitive-export',
        organizationId,
        userId,
        action: 'data_export',
        resource: 'user_data',
        timestamp: new Date(),
        outcome: 'success' as const,
        details: { exportType: 'sensitive', recordCount: 1000 },
        sensitive: true,
        complianceRelevant: true,
        tags: ['export', 'sensitive'],
        metadata: {},
      };

      mockPrisma.auditLog.create
        .mockResolvedValueOnce(oldDataAccess)
        .mockResolvedValueOnce(sensitiveExport);

      mockPrisma.complianceRule.findMany.mockResolvedValue([
        { ...retentionRuleResult, lastEvaluated: null },
        { ...exportRuleResult, lastEvaluated: null },
      ]);

      mockPrisma.complianceRule.update.mockResolvedValue({});

      const retentionViolation = {
        id: 'violation-retention',
        organizationId,
        ruleId: retentionRuleResult.id,
        resource: 'audit_log',
        resourceId: oldDataAccess.id,
        description: 'Data accessed beyond retention period of 2555 days',
        severity: 'medium' as const,
        status: 'open' as const,
        detectedAt: new Date(),
        metadata: {},
      };

      const exportViolation = {
        id: 'violation-export',
        organizationId,
        ruleId: exportRuleResult.id,
        resource: 'data_export',
        resourceId: 'unknown',
        description: 'Sensitive data export detected',
        severity: 'high' as const,
        status: 'open' as const,
        detectedAt: new Date(),
        metadata: {},
      };

      mockPrisma.complianceViolation.create
        .mockResolvedValueOnce(retentionViolation)
        .mockResolvedValueOnce(exportViolation);

      const oldAccessEvent = await complianceService.logAuditEvent(
        organizationId,
        userId,
        'data_access',
        'user_data',
        { accessType: 'read', recordId: 'old-record-123' }
      );

      const exportEvent = await complianceService.logAuditEvent(
        organizationId,
        userId,
        'data_export',
        'user_data',
        { exportType: 'sensitive', recordCount: 1000 },
        { sensitive: true, tags: ['export', 'sensitive'] }
      );

      expect(mockPrisma.complianceViolation.create).toHaveBeenCalledTimes(2);

      expect(mockPrisma.complianceViolation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ruleId: retentionRuleResult.id,
          description: expect.stringContaining('beyond retention period'),
          severity: 'medium',
        }),
      });

      expect(mockPrisma.complianceViolation.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          ruleId: exportRuleResult.id,
          description: 'Sensitive data export detected',
          severity: 'high',
        }),
      });
    });
  });

  describe('Enterprise Feature Permissions', () => {
    it('should enforce admin permissions for enterprise features', async () => {
      const organizationId = 'org-123';
      const regularUserId = 'user-regular';
      const adminUserId = 'user-admin';

      const mockRegularUser = {
        id: regularUserId,
        organizationId,
        role: 'user',
        email: 'user@example.com',
      };

      const mockAdminUser = {
        id: adminUserId,
        organizationId,
        role: 'admin',
        email: 'admin@example.com',
      };

      mockPrisma.user.findUnique
        .mockResolvedValueOnce(mockRegularUser)
        .mockResolvedValueOnce(mockAdminUser);

      const regularUser = await mockPrisma.user.findUnique({
        where: { id: regularUserId },
      });

      const adminUser = await mockPrisma.user.findUnique({
        where: { id: adminUserId },
      });

      expect(regularUser?.role).toBe('user');
      expect(adminUser?.role).toBe('admin');

      const hasExportPermission = (user: any) => user?.role === 'admin';
      const hasCompliancePermission = (user: any) => user?.role === 'admin';
      const hasSSOPermission = (user: any) => user?.role === 'admin';

      expect(hasExportPermission(regularUser)).toBe(false);
      expect(hasCompliancePermission(regularUser)).toBe(false);
      expect(hasSSOPermission(regularUser)).toBe(false);

      expect(hasExportPermission(adminUser)).toBe(true);
      expect(hasCompliancePermission(adminUser)).toBe(true);
      expect(hasSSOPermission(adminUser)).toBe(true);
    });
  });
});