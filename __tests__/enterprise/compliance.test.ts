import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { ComplianceService } from '@/services/compliance/compliance-service';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

describe('Compliance Service', () => {
  let complianceService: ComplianceService;

  beforeEach(() => {
    complianceService = new ComplianceService(mockPrisma);
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('Compliance Rule Management', () => {
    it('should create compliance rule successfully', async () => {
      const organizationId = 'org-id';
      const ruleData = {
        name: 'Data Retention Policy',
        description: 'User data must be retained for 7 years',
        type: 'data_retention' as const,
        isActive: true,
        configuration: {
          retentionPeriodDays: 2555, // 7 years
          complianceStandard: 'GDPR',
          severity: 'high' as const,
          autoRemediation: false,
        },
        metadata: { createdBy: 'admin-123' },
      };

      const mockRule = {
        id: 'rule-123',
        organizationId,
        ...ruleData,
        complianceStatus: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.complianceRule.create.mockResolvedValue(mockRule);

      const result = await complianceService.createComplianceRule(
        organizationId,
        ruleData
      );

      expect(result).toEqual(mockRule);
      expect(mockPrisma.complianceRule.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          name: ruleData.name,
          description: ruleData.description,
          type: ruleData.type,
          isActive: ruleData.isActive,
          configuration: ruleData.configuration,
          complianceStatus: 'pending',
          metadata: ruleData.metadata,
        },
      });
    });

    it('should get compliance rules for organization', async () => {
      const organizationId = 'org-id';
      const mockRules = [
        {
          id: 'rule-1',
          organizationId,
          name: 'Data Retention',
          type: 'data_retention',
          isActive: true,
        },
        {
          id: 'rule-2',
          organizationId,
          name: 'Access Control',
          type: 'access_control',
          isActive: true,
        },
      ];

      mockPrisma.complianceRule.findMany.mockResolvedValue(mockRules);

      const result = await complianceService.getComplianceRules(organizationId);

      expect(result).toEqual(mockRules);
      expect(mockPrisma.complianceRule.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        orderBy: { name: 'asc' },
      });
    });
  });

  describe('Audit Event Logging', () => {
    it('should log audit event successfully', async () => {
      const organizationId = 'org-id';
      const userId = 'user-123';
      const action = 'user_login';
      const resource = 'authentication';
      const details = { method: 'sso', provider: 'saml' };

      const mockEvent = {
        id: 'event-123',
        organizationId,
        userId,
        action,
        resource,
        details,
        outcome: 'success',
        sensitive: false,
        complianceRelevant: true,
        timestamp: new Date(),
        tags: [],
        metadata: {},
      };

      const mockRules = [
        {
          id: 'rule-1',
          organizationId,
          type: 'audit_requirement',
          isActive: true,
          configuration: {},
          lastEvaluated: null,
        },
      ];

      mockPrisma.auditLog.create.mockResolvedValue(mockEvent);
      mockPrisma.complianceRule.findMany.mockResolvedValue(mockRules);
      mockPrisma.complianceRule.update.mockResolvedValue({});

      const result = await complianceService.logAuditEvent(
        organizationId,
        userId,
        action,
        resource,
        details
      );

      expect(result).toEqual(mockEvent);
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          userId,
          sessionId: undefined,
          action,
          resource,
          resourceId: undefined,
          outcome: 'success',
          details,
          sensitive: false,
          complianceRelevant: true,
          timestamp: expect.any(Date),
          ipAddress: undefined,
          userAgent: undefined,
          location: undefined,
          riskScore: undefined,
          tags: [],
          metadata: {},
        },
      });
    });

    it('should log sensitive audit event', async () => {
      const organizationId = 'org-id';
      const userId = 'user-123';
      const action = 'data_export';
      const resource = 'user_data';
      const details = { recordCount: 1000, destination: 'external_system' };

      const mockEvent = {
        id: 'event-123',
        organizationId,
        userId,
        action,
        resource,
        details,
        outcome: 'success',
        sensitive: true,
        complianceRelevant: true,
        timestamp: new Date(),
        riskScore: 8,
        tags: ['data_export', 'sensitive'],
        metadata: {},
      };

      mockPrisma.auditLog.create.mockResolvedValue(mockEvent);
      mockPrisma.complianceRule.findMany.mockResolvedValue([]);

      const result = await complianceService.logAuditEvent(
        organizationId,
        userId,
        action,
        resource,
        details,
        {
          sensitive: true,
          riskScore: 8,
          tags: ['data_export', 'sensitive'],
        }
      );

      expect(result.sensitive).toBe(true);
      expect(result.riskScore).toBe(8);
      expect(result.tags).toEqual(['data_export', 'sensitive']);
    });
  });

  describe('Compliance Violation Detection', () => {
    it('should detect compliance violation', async () => {
      const organizationId = 'org-id';
      const ruleId = 'rule-123';
      const resource = 'user_data';
      const resourceId = 'user-456';
      const description = 'Data accessed beyond retention period';
      const severity = 'high';
      const metadata = { retentionDays: 365, accessDate: new Date() };

      const mockViolation = {
        id: 'violation-123',
        organizationId,
        ruleId,
        resource,
        resourceId,
        description,
        severity,
        status: 'open',
        detectedAt: new Date(),
        metadata,
      };

      mockPrisma.complianceViolation.create.mockResolvedValue(mockViolation);

      const result = await complianceService.detectComplianceViolation(
        organizationId,
        ruleId,
        resource,
        resourceId,
        description,
        severity,
        metadata
      );

      expect(result).toEqual(mockViolation);
      expect(mockPrisma.complianceViolation.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          ruleId,
          resource,
          resourceId,
          description,
          severity,
          status: 'open',
          detectedAt: expect.any(Date),
          metadata,
        },
      });
    });

    it('should resolve compliance violation', async () => {
      const violationId = 'violation-123';
      const resolvedBy = 'admin-456';
      const remediation = {
        action: 'Data purged according to retention policy',
        notes: 'Automated cleanup performed',
      };

      const mockResolvedViolation = {
        id: violationId,
        status: 'resolved',
        resolvedAt: new Date(),
        remediation: {
          ...remediation,
          performedBy: resolvedBy,
          performedAt: new Date(),
        },
      };

      mockPrisma.complianceViolation.update.mockResolvedValue(mockResolvedViolation);

      const result = await complianceService.resolveComplianceViolation(
        violationId,
        resolvedBy,
        remediation
      );

      expect(result).toEqual(mockResolvedViolation);
      expect(mockPrisma.complianceViolation.update).toHaveBeenCalledWith({
        where: { id: violationId },
        data: {
          status: 'resolved',
          resolvedAt: expect.any(Date),
          remediation: {
            ...remediation,
            performedBy: resolvedBy,
            performedAt: expect.any(Date),
          },
        },
      });
    });
  });

  describe('Compliance Rule Evaluation', () => {
    it('should evaluate data retention rule', async () => {
      const organizationId = 'org-id';
      const auditEvent = {
        id: 'event-123',
        organizationId,
        userId: 'user-123',
        action: 'data_access',
        resource: 'user_data',
        timestamp: new Date('2020-01-01'), // Old access
        complianceRelevant: true,
        sensitive: false,
        outcome: 'success',
        details: {},
        tags: [],
        metadata: {},
      };

      const rule = {
        id: 'rule-123',
        organizationId,
        type: 'data_retention' as const,
        configuration: {
          retentionPeriodDays: 365, // 1 year retention
        },
        isActive: true,
        name: 'Data Retention Rule',
        description: 'Test rule',
        complianceStatus: 'compliant' as const,
        metadata: {},
      };

      mockPrisma.complianceRule.findMany.mockResolvedValue([rule]);
      mockPrisma.complianceRule.update.mockResolvedValue({});
      mockPrisma.complianceViolation.create.mockResolvedValue({
        id: 'violation-123',
        organizationId,
        ruleId: rule.id,
        resource: 'audit_log',
        resourceId: auditEvent.id,
        description: `Data accessed beyond retention period of 365 days`,
        severity: 'medium',
        status: 'open',
        detectedAt: new Date(),
        metadata: {},
      });

      await complianceService.evaluateComplianceRules(organizationId, auditEvent as any);

      expect(mockPrisma.complianceViolation.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          ruleId: rule.id,
          resource: 'audit_log',
          resourceId: auditEvent.id,
          description: expect.stringContaining('beyond retention period'),
          severity: 'medium',
          status: 'open',
          detectedAt: expect.any(Date),
          metadata: expect.any(Object),
        },
      });

      expect(mockPrisma.complianceRule.update).toHaveBeenCalledWith({
        where: { id: rule.id },
        data: { lastEvaluated: expect.any(Date) },
      });
    });

    it('should evaluate access control rule', async () => {
      const organizationId = 'org-id';
      const auditEvent = {
        id: 'event-123',
        organizationId,
        userId: 'user-123',
        action: 'unauthorized_access',
        resource: 'sensitive_data',
        resourceId: 'data-456',
        timestamp: new Date(),
        outcome: 'failure',
        complianceRelevant: true,
        sensitive: true,
        details: { reason: 'insufficient_permissions' },
        tags: ['security'],
        metadata: {},
      };

      const rule = {
        id: 'rule-123',
        organizationId,
        type: 'access_control' as const,
        configuration: {
          requiredActions: ['authorize', 'audit'],
        },
        isActive: true,
        name: 'Access Control Rule',
        description: 'Test rule',
        complianceStatus: 'compliant' as const,
        metadata: {},
      };

      mockPrisma.complianceRule.findMany.mockResolvedValue([rule]);
      mockPrisma.complianceRule.update.mockResolvedValue({});
      mockPrisma.complianceViolation.create.mockResolvedValue({
        id: 'violation-123',
        organizationId,
        ruleId: rule.id,
        resource: 'access_control',
        resourceId: auditEvent.resourceId!,
        description: 'Unauthorized access attempt detected',
        severity: 'high',
        status: 'open',
        detectedAt: new Date(),
        metadata: {},
      });

      await complianceService.evaluateComplianceRules(organizationId, auditEvent as any);

      expect(mockPrisma.complianceViolation.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          ruleId: rule.id,
          resource: 'access_control',
          resourceId: auditEvent.resourceId,
          description: 'Unauthorized access attempt detected',
          severity: 'high',
          status: 'open',
          detectedAt: expect.any(Date),
          metadata: expect.any(Object),
        },
      });
    });
  });

  describe('Compliance Reporting', () => {
    it('should generate compliance report', async () => {
      const organizationId = 'org-id';
      const reportType = 'monthly';
      const period = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      };
      const generatedBy = 'admin-123';

      const mockRules = [
        { id: 'rule-1', organizationId, complianceStatus: 'compliant' },
        { id: 'rule-2', organizationId, complianceStatus: 'compliant' },
        { id: 'rule-3', organizationId, complianceStatus: 'non_compliant' },
      ];

      const mockViolations = [
        {
          id: 'violation-1',
          organizationId,
          status: 'resolved',
          detectedAt: new Date('2024-01-15'),
        },
        {
          id: 'violation-2',
          organizationId,
          status: 'open',
          detectedAt: new Date('2024-01-20'),
        },
      ];

      const mockReport = {
        id: 'report-123',
        organizationId,
        type: reportType,
        period,
        status: 'completed',
        summary: {
          totalRules: 3,
          compliantRules: 2,
          violations: 2,
          resolvedViolations: 1,
          complianceScore: 67,
        },
        sections: [
          {
            name: 'Executive Summary',
            content: { complianceScore: 67, totalViolations: 2 },
            status: 'non_compliant',
          },
          {
            name: 'Audit Events',
            content: { totalEvents: 150 },
            status: 'compliant',
          },
          {
            name: 'Violations',
            content: {
              violations: [
                { id: 'violation-1', severity: 'medium', status: 'resolved' },
                { id: 'violation-2', severity: 'high', status: 'open' },
              ],
            },
            status: 'warning',
          },
        ],
        generatedAt: new Date(),
        generatedBy,
        metadata: {},
      };

      mockPrisma.complianceRule.findMany.mockResolvedValue(mockRules);
      mockPrisma.complianceViolation.findMany.mockResolvedValue(mockViolations);
      mockPrisma.auditLog.count.mockResolvedValue(150);
      mockPrisma.complianceReport.create.mockResolvedValue(mockReport);

      const result = await complianceService.generateComplianceReport(
        organizationId,
        reportType,
        period,
        generatedBy
      );

      expect(result).toEqual(mockReport);
      expect(mockPrisma.complianceReport.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          type: reportType,
          period,
          status: 'completed',
          summary: {
            totalRules: 3,
            compliantRules: 2,
            violations: 2,
            resolvedViolations: 1,
            complianceScore: 67,
          },
          sections: expect.any(Array),
          generatedAt: expect.any(Date),
          generatedBy,
          metadata: {},
        },
      });
    });
  });

  describe('Data Querying', () => {
    it('should get compliance violations with filters', async () => {
      const organizationId = 'org-id';
      const filters = {
        status: ['open', 'acknowledged'],
        severity: ['high', 'critical'],
        dateRange: {
          start: new Date('2024-01-01'),
          end: new Date('2024-01-31'),
        },
      };

      const mockViolations = [
        {
          id: 'violation-1',
          organizationId,
          status: 'open',
          severity: 'high',
          detectedAt: new Date('2024-01-15'),
        },
      ];

      mockPrisma.complianceViolation.findMany.mockResolvedValue(mockViolations);

      const result = await complianceService.getComplianceViolations(
        organizationId,
        filters
      );

      expect(result).toEqual(mockViolations);
      expect(mockPrisma.complianceViolation.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          status: { in: filters.status },
          severity: { in: filters.severity },
          detectedAt: {
            gte: filters.dateRange.start,
            lte: filters.dateRange.end,
          },
        },
        orderBy: { detectedAt: 'desc' },
      });
    });

    it('should get audit events with filters', async () => {
      const organizationId = 'org-id';
      const filters = {
        userId: 'user-123',
        action: ['data_access', 'data_export'],
        resource: ['user_data'],
        complianceRelevant: true,
        sensitive: true,
      };

      const mockEvents = [
        {
          id: 'event-1',
          organizationId,
          userId: 'user-123',
          action: 'data_access',
          resource: 'user_data',
          complianceRelevant: true,
          sensitive: true,
          timestamp: new Date(),
        },
      ];

      mockPrisma.auditLog.findMany.mockResolvedValue(mockEvents);

      const result = await complianceService.getAuditEvents(
        organizationId,
        filters
      );

      expect(result).toEqual(mockEvents);
      expect(mockPrisma.auditLog.findMany).toHaveBeenCalledWith({
        where: {
          organizationId,
          userId: filters.userId,
          action: { in: filters.action },
          resource: { in: filters.resource },
          complianceRelevant: filters.complianceRelevant,
          sensitive: filters.sensitive,
        },
        orderBy: { timestamp: 'desc' },
        take: 1000,
      });
    });
  });
});