import { PrismaClient } from '@prisma/client';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('compliance-service');

export interface ComplianceRule {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: 'data_retention' | 'access_control' | 'audit_requirement' | 'encryption' | 'export_restriction';
  isActive: boolean;
  configuration: {
    retentionPeriodDays?: number;
    requiredActions?: string[];
    complianceStandard?: string;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    autoRemediation?: boolean;
    notificationChannels?: string[];
  };
  lastEvaluated?: Date;
  complianceStatus: 'compliant' | 'non_compliant' | 'pending' | 'unknown';
  metadata: Record<string, any>;
}

export interface ComplianceViolation {
  id: string;
  organizationId: string;
  ruleId: string;
  resource: string;
  resourceId: string;
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  status: 'open' | 'acknowledged' | 'resolved' | 'false_positive';
  detectedAt: Date;
  resolvedAt?: Date;
  assignedTo?: string;
  remediation?: {
    action: string;
    performedBy?: string;
    performedAt?: Date;
    notes?: string;
  };
  metadata: Record<string, any>;
}

export interface AuditEvent {
  id: string;
  organizationId: string;
  userId: string;
  sessionId?: string;
  action: string;
  resource: string;
  resourceId?: string;
  outcome: 'success' | 'failure' | 'partial';
  details: Record<string, any>;
  sensitive: boolean;
  complianceRelevant: boolean;
  timestamp: Date;
  ipAddress?: string;
  userAgent?: string;
  location?: {
    country?: string;
    region?: string;
    city?: string;
  };
  riskScore?: number;
  tags: string[];
  metadata: Record<string, any>;
}

export interface ComplianceReport {
  id: string;
  organizationId: string;
  type: 'monthly' | 'quarterly' | 'annual' | 'adhoc';
  period: {
    start: Date;
    end: Date;
  };
  status: 'generating' | 'completed' | 'failed';
  summary: {
    totalRules: number;
    compliantRules: number;
    violations: number;
    resolvedViolations: number;
    complianceScore: number;
  };
  sections: {
    name: string;
    content: any;
    status: 'compliant' | 'non_compliant' | 'warning';
  }[];
  generatedAt: Date;
  generatedBy: string;
  metadata: Record<string, any>;
}

export class ComplianceService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createComplianceRule(
    organizationId: string,
    rule: Omit<ComplianceRule, 'id' | 'organizationId' | 'lastEvaluated' | 'complianceStatus'>
  ): Promise<ComplianceRule> {
    return tracer.startActiveSpan('createComplianceRule', async (span) => {
      try {
        span.setAttributes({
          organizationId,
          ruleType: rule.type,
          ruleName: rule.name,
        });

        const createdRule = await this.prisma.complianceRule.create({
          data: {
            organizationId,
            name: rule.name,
            description: rule.description,
            type: rule.type,
            isActive: rule.isActive,
            configuration: rule.configuration as any,
            complianceStatus: 'pending',
            metadata: rule.metadata as any,
          },
        });

        span.addEvent('Compliance rule created', { ruleId: createdRule.id });
        return createdRule as ComplianceRule;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async logAuditEvent(
    organizationId: string,
    userId: string,
    action: string,
    resource: string,
    details: Record<string, any>,
    options: {
      sessionId?: string;
      resourceId?: string;
      outcome?: 'success' | 'failure' | 'partial';
      sensitive?: boolean;
      complianceRelevant?: boolean;
      ipAddress?: string;
      userAgent?: string;
      location?: { country?: string; region?: string; city?: string };
      riskScore?: number;
      tags?: string[];
    } = {}
  ): Promise<AuditEvent> {
    return tracer.startActiveSpan('logAuditEvent', async (span) => {
      try {
        span.setAttributes({
          organizationId,
          userId,
          action,
          resource,
          outcome: options.outcome || 'success',
          sensitive: options.sensitive || false,
          complianceRelevant: options.complianceRelevant || true,
        });

        const auditEvent = await this.prisma.auditLog.create({
          data: {
            organizationId,
            userId,
            sessionId: options.sessionId,
            action,
            resource,
            resourceId: options.resourceId,
            outcome: options.outcome || 'success',
            details: details as any,
            sensitive: options.sensitive || false,
            complianceRelevant: options.complianceRelevant || true,
            timestamp: new Date(),
            ipAddress: options.ipAddress,
            userAgent: options.userAgent,
            location: options.location as any,
            riskScore: options.riskScore,
            tags: options.tags || [],
            metadata: {} as any,
          },
        });

        await this.evaluateComplianceRules(organizationId, auditEvent);

        span.addEvent('Audit event logged', { eventId: auditEvent.id });
        return auditEvent as AuditEvent;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async detectComplianceViolation(
    organizationId: string,
    ruleId: string,
    resource: string,
    resourceId: string,
    description: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    metadata: Record<string, any> = {}
  ): Promise<ComplianceViolation> {
    return tracer.startActiveSpan('detectComplianceViolation', async (span) => {
      try {
        span.setAttributes({
          organizationId,
          ruleId,
          resource,
          severity,
        });

        const violation = await this.prisma.complianceViolation.create({
          data: {
            organizationId,
            ruleId,
            resource,
            resourceId,
            description,
            severity,
            status: 'open',
            detectedAt: new Date(),
            metadata: metadata as any,
          },
        });

        await this.triggerViolationNotifications(violation as ComplianceViolation);

        span.addEvent('Compliance violation detected', {
          violationId: violation.id,
          severity,
        });
        return violation as ComplianceViolation;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async resolveComplianceViolation(
    violationId: string,
    resolvedBy: string,
    remediation: {
      action: string;
      notes?: string;
    }
  ): Promise<ComplianceViolation> {
    return tracer.startActiveSpan('resolveComplianceViolation', async (span) => {
      try {
        span.setAttributes({ violationId, resolvedBy });

        const violation = await this.prisma.complianceViolation.update({
          where: { id: violationId },
          data: {
            status: 'resolved',
            resolvedAt: new Date(),
            remediation: {
              ...remediation,
              performedBy: resolvedBy,
              performedAt: new Date(),
            } as any,
          },
        });

        span.addEvent('Compliance violation resolved');
        return violation as ComplianceViolation;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async evaluateComplianceRules(
    organizationId: string,
    auditEvent: AuditEvent
  ): Promise<void> {
    return tracer.startActiveSpan('evaluateComplianceRules', async (span) => {
      try {
        span.setAttributes({ organizationId, eventId: auditEvent.id });

        const rules = await this.prisma.complianceRule.findMany({
          where: {
            organizationId,
            isActive: true,
          },
        });

        for (const rule of rules) {
          await this.evaluateRule(rule as ComplianceRule, auditEvent);
        }

        span.addEvent('Compliance rules evaluated', { rulesCount: rules.length });
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async evaluateRule(
    rule: ComplianceRule,
    auditEvent: AuditEvent
  ): Promise<void> {
    const { configuration } = rule;

    switch (rule.type) {
      case 'data_retention':
        await this.evaluateDataRetentionRule(rule, auditEvent);
        break;
      case 'access_control':
        await this.evaluateAccessControlRule(rule, auditEvent);
        break;
      case 'audit_requirement':
        await this.evaluateAuditRequirementRule(rule, auditEvent);
        break;
      case 'encryption':
        await this.evaluateEncryptionRule(rule, auditEvent);
        break;
      case 'export_restriction':
        await this.evaluateExportRestrictionRule(rule, auditEvent);
        break;
    }

    await this.prisma.complianceRule.update({
      where: { id: rule.id },
      data: { lastEvaluated: new Date() },
    });
  }

  private async evaluateDataRetentionRule(
    rule: ComplianceRule,
    auditEvent: AuditEvent
  ): Promise<void> {
    const retentionPeriod = rule.configuration.retentionPeriodDays || 365;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionPeriod);

    if (auditEvent.action === 'data_access' && auditEvent.timestamp < cutoffDate) {
      await this.detectComplianceViolation(
        rule.organizationId,
        rule.id,
        'audit_log',
        auditEvent.id,
        `Data accessed beyond retention period of ${retentionPeriod} days`,
        'medium',
        { retentionPeriod, accessDate: auditEvent.timestamp }
      );
    }
  }

  private async evaluateAccessControlRule(
    rule: ComplianceRule,
    auditEvent: AuditEvent
  ): Promise<void> {
    const requiredActions = rule.configuration.requiredActions || [];

    if (
      auditEvent.action === 'unauthorized_access' ||
      (auditEvent.outcome === 'failure' && auditEvent.action.includes('access'))
    ) {
      await this.detectComplianceViolation(
        rule.organizationId,
        rule.id,
        'access_control',
        auditEvent.resourceId || 'unknown',
        'Unauthorized access attempt detected',
        'high',
        { auditEventId: auditEvent.id, failedAction: auditEvent.action }
      );
    }
  }

  private async evaluateAuditRequirementRule(
    rule: ComplianceRule,
    auditEvent: AuditEvent
  ): Promise<void> {
    if (!auditEvent.complianceRelevant) {
      await this.detectComplianceViolation(
        rule.organizationId,
        rule.id,
        'audit_log',
        auditEvent.id,
        'Required audit event not marked as compliance relevant',
        'low',
        { auditEventId: auditEvent.id, action: auditEvent.action }
      );
    }
  }

  private async evaluateEncryptionRule(
    rule: ComplianceRule,
    auditEvent: AuditEvent
  ): Promise<void> {
    if (
      auditEvent.action.includes('data_transfer') &&
      !auditEvent.details.encrypted
    ) {
      await this.detectComplianceViolation(
        rule.organizationId,
        rule.id,
        'data_transfer',
        auditEvent.resourceId || 'unknown',
        'Unencrypted data transfer detected',
        'critical',
        { auditEventId: auditEvent.id, transferDetails: auditEvent.details }
      );
    }
  }

  private async evaluateExportRestrictionRule(
    rule: ComplianceRule,
    auditEvent: AuditEvent
  ): Promise<void> {
    if (auditEvent.action === 'data_export' && auditEvent.sensitive) {
      await this.detectComplianceViolation(
        rule.organizationId,
        rule.id,
        'data_export',
        auditEvent.resourceId || 'unknown',
        'Sensitive data export detected',
        'high',
        { auditEventId: auditEvent.id, exportDetails: auditEvent.details }
      );
    }
  }

  private async triggerViolationNotifications(
    violation: ComplianceViolation
  ): Promise<void> {
    console.log(`COMPLIANCE VIOLATION DETECTED:`, {
      id: violation.id,
      severity: violation.severity,
      description: violation.description,
      resource: violation.resource,
    });
  }

  async generateComplianceReport(
    organizationId: string,
    reportType: 'monthly' | 'quarterly' | 'annual' | 'adhoc',
    period: { start: Date; end: Date },
    generatedBy: string
  ): Promise<ComplianceReport> {
    return tracer.startActiveSpan('generateComplianceReport', async (span) => {
      try {
        span.setAttributes({
          organizationId,
          reportType,
          periodStart: period.start.toISOString(),
          periodEnd: period.end.toISOString(),
        });

        const rules = await this.prisma.complianceRule.findMany({
          where: { organizationId },
        });

        const violations = await this.prisma.complianceViolation.findMany({
          where: {
            organizationId,
            detectedAt: {
              gte: period.start,
              lte: period.end,
            },
          },
        });

        const resolvedViolations = violations.filter(v => v.status === 'resolved');
        const complianceScore = Math.round(
          ((rules.length - violations.length + resolvedViolations.length) / rules.length) * 100
        );

        const reportData = await this.prisma.complianceReport.create({
          data: {
            organizationId,
            type: reportType,
            period: period as any,
            status: 'completed',
            summary: {
              totalRules: rules.length,
              compliantRules: rules.filter(r => r.complianceStatus === 'compliant').length,
              violations: violations.length,
              resolvedViolations: resolvedViolations.length,
              complianceScore,
            } as any,
            sections: [
              {
                name: 'Executive Summary',
                content: { complianceScore, totalViolations: violations.length },
                status: complianceScore >= 90 ? 'compliant' : 'non_compliant',
              },
              {
                name: 'Audit Events',
                content: { totalEvents: await this.getAuditEventCount(organizationId, period) },
                status: 'compliant',
              },
              {
                name: 'Violations',
                content: { violations: violations.map(v => ({ id: v.id, severity: v.severity, status: v.status })) },
                status: violations.length === 0 ? 'compliant' : 'warning',
              },
            ] as any,
            generatedAt: new Date(),
            generatedBy,
            metadata: {} as any,
          },
        });

        span.addEvent('Compliance report generated', { reportId: reportData.id });
        return reportData as ComplianceReport;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async getAuditEventCount(
    organizationId: string,
    period: { start: Date; end: Date }
  ): Promise<number> {
    return await this.prisma.auditLog.count({
      where: {
        organizationId,
        timestamp: {
          gte: period.start,
          lte: period.end,
        },
      },
    });
  }

  async getComplianceRules(organizationId: string): Promise<ComplianceRule[]> {
    const rules = await this.prisma.complianceRule.findMany({
      where: { organizationId },
      orderBy: { name: 'asc' },
    });

    return rules as ComplianceRule[];
  }

  async getComplianceViolations(
    organizationId: string,
    filters: {
      status?: string[];
      severity?: string[];
      dateRange?: { start: Date; end: Date };
    } = {}
  ): Promise<ComplianceViolation[]> {
    const violations = await this.prisma.complianceViolation.findMany({
      where: {
        organizationId,
        ...(filters.status && { status: { in: filters.status } }),
        ...(filters.severity && { severity: { in: filters.severity } }),
        ...(filters.dateRange && {
          detectedAt: {
            gte: filters.dateRange.start,
            lte: filters.dateRange.end,
          },
        }),
      },
      orderBy: { detectedAt: 'desc' },
    });

    return violations as ComplianceViolation[];
  }

  async getAuditEvents(
    organizationId: string,
    filters: {
      userId?: string;
      action?: string[];
      resource?: string[];
      dateRange?: { start: Date; end: Date };
      complianceRelevant?: boolean;
      sensitive?: boolean;
    } = {}
  ): Promise<AuditEvent[]> {
    const events = await this.prisma.auditLog.findMany({
      where: {
        organizationId,
        ...(filters.userId && { userId: filters.userId }),
        ...(filters.action && { action: { in: filters.action } }),
        ...(filters.resource && { resource: { in: filters.resource } }),
        ...(filters.dateRange && {
          timestamp: {
            gte: filters.dateRange.start,
            lte: filters.dateRange.end,
          },
        }),
        ...(filters.complianceRelevant !== undefined && {
          complianceRelevant: filters.complianceRelevant,
        }),
        ...(filters.sensitive !== undefined && {
          sensitive: filters.sensitive,
        }),
      },
      orderBy: { timestamp: 'desc' },
      take: 1000,
    });

    return events as AuditEvent[];
  }
}