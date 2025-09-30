/**
 * Audit Logger Service
 *
 * Provides comprehensive audit logging for governance, compliance, and security monitoring.
 * Records all significant user actions, system changes, and administrative operations.
 */

import { prisma } from '@/lib/db';
import { getCurrentTraceId, getCurrentSpanId } from '@/services/tracing/setup';

// Audit action types
export type AuditAction =
  // Authentication actions
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.password_reset'
  | 'auth.account_locked'

  // User management
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.plan_changed'
  | 'user.role_changed'

  // Project management
  | 'project.created'
  | 'project.updated'
  | 'project.deleted'
  | 'project.shared'
  | 'project.access_granted'
  | 'project.access_revoked'

  // Data operations
  | 'data.export'
  | 'data.import'
  | 'data.deleted'
  | 'data.backup'
  | 'data.restore'

  // Model operations
  | 'model.run'
  | 'model.trained'
  | 'model.deployed'
  | 'model.deleted'

  // Admin operations
  | 'admin.user_impersonation'
  | 'admin.system_config_changed'
  | 'admin.usage_reset'
  | 'admin.plan_override'
  | 'admin.data_cleanup'

  // Security events
  | 'security.access_denied'
  | 'security.rate_limit_exceeded'
  | 'security.suspicious_activity'
  | 'security.data_breach_attempt'

  // System events
  | 'system.startup'
  | 'system.shutdown'
  | 'system.health_check_failed'
  | 'system.backup_completed'
  | 'system.migration_applied'

  // Custom actions
  | string;

// Audit severity levels
export type AuditSeverity = 'info' | 'warning' | 'error' | 'critical';

// Audit outcomes
export type AuditOutcome = 'success' | 'failure' | 'partial';

// Resource types for audit logging
export type AuditResource =
  | 'user'
  | 'project'
  | 'model'
  | 'data'
  | 'system'
  | 'auth'
  | 'billing'
  | 'admin'
  | string;

// Audit log entry structure
export interface AuditLogEntry {
  userId?: string;
  action: AuditAction;
  resource?: AuditResource;
  resourceId?: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  severity?: AuditSeverity;
  outcome?: AuditOutcome;
}

// Request context for audit logging
export interface AuditContext {
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  traceId?: string;
  spanId?: string;
}

export class AuditLogger {
  /**
   * Log an audit event
   */
  async log(
    entry: AuditLogEntry,
    context: AuditContext = {}
  ): Promise<void> {
    try {
      // Get tracing context if available
      const traceId = context.traceId || getCurrentTraceId();
      const spanId = context.spanId || getCurrentSpanId();

      // Enhance metadata with context
      const enhancedMetadata = {
        ...entry.metadata,
        sessionId: context.sessionId,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        platform: 'magi',
      };

      // Create audit log entry
      await prisma.auditLog.create({
        data: {
          userId: entry.userId || context.userId,
          action: entry.action,
          resource: entry.resource,
          resourceId: entry.resourceId,
          details: entry.details || {},
          metadata: enhancedMetadata,
          ipAddress: entry.ipAddress || context.ipAddress,
          userAgent: entry.userAgent || context.userAgent,
          traceId,
          spanId,
          severity: entry.severity || 'info',
          outcome: entry.outcome || 'success',
        },
      });

      // Log to console for immediate visibility (can be configured per environment)
      if (process.env.NODE_ENV !== 'production' || entry.severity === 'critical') {
        console.log(`[AUDIT] ${entry.action}:`, {
          userId: entry.userId || context.userId,
          resource: entry.resource,
          resourceId: entry.resourceId,
          severity: entry.severity || 'info',
          outcome: entry.outcome || 'success',
          traceId,
        });
      }
    } catch (error) {
      // Always log audit failures to console
      console.error('Failed to write audit log:', error, {
        action: entry.action,
        userId: entry.userId || context.userId,
        resource: entry.resource,
      });

      // Don't throw - audit logging should never break application flow
    }
  }

  /**
   * Log authentication events
   */
  async logAuth(
    action: Extract<AuditAction, `auth.${string}`>,
    userId?: string,
    details?: Record<string, any>,
    context: AuditContext = {}
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'auth',
      details,
      severity: action.includes('failed') || action.includes('locked') ? 'warning' : 'info',
      outcome: action.includes('failed') || action.includes('locked') ? 'failure' : 'success',
    }, context);
  }

  /**
   * Log user management events
   */
  async logUser(
    action: Extract<AuditAction, `user.${string}`>,
    userId: string,
    targetUserId?: string,
    details?: Record<string, any>,
    context: AuditContext = {}
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'user',
      resourceId: targetUserId || userId,
      details,
      severity: action.includes('deleted') ? 'warning' : 'info',
    }, context);
  }

  /**
   * Log project operations
   */
  async logProject(
    action: Extract<AuditAction, `project.${string}`>,
    userId: string,
    projectId: string,
    details?: Record<string, any>,
    context: AuditContext = {}
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'project',
      resourceId: projectId,
      details,
      severity: action.includes('deleted') ? 'warning' : 'info',
    }, context);
  }

  /**
   * Log data operations
   */
  async logData(
    action: Extract<AuditAction, `data.${string}`>,
    userId: string,
    details?: Record<string, any>,
    context: AuditContext = {}
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'data',
      details,
      severity: action.includes('deleted') || action.includes('export') ? 'warning' : 'info',
    }, context);
  }

  /**
   * Log model operations
   */
  async logModel(
    action: Extract<AuditAction, `model.${string}`>,
    userId: string,
    modelId?: string,
    details?: Record<string, any>,
    context: AuditContext = {}
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'model',
      resourceId: modelId,
      details,
      severity: action.includes('deleted') ? 'warning' : 'info',
    }, context);
  }

  /**
   * Log administrative actions
   */
  async logAdmin(
    action: Extract<AuditAction, `admin.${string}`>,
    adminUserId: string,
    targetUserId?: string,
    details?: Record<string, any>,
    context: AuditContext = {}
  ): Promise<void> {
    await this.log({
      userId: adminUserId,
      action,
      resource: 'admin',
      resourceId: targetUserId,
      details,
      severity: 'warning', // All admin actions are warnings for visibility
    }, context);
  }

  /**
   * Log security events
   */
  async logSecurity(
    action: Extract<AuditAction, `security.${string}`>,
    userId?: string,
    details?: Record<string, any>,
    context: AuditContext = {}
  ): Promise<void> {
    await this.log({
      userId,
      action,
      resource: 'auth',
      details,
      severity: 'error', // All security events are errors
      outcome: 'failure',
    }, context);
  }

  /**
   * Log system events
   */
  async logSystem(
    action: Extract<AuditAction, `system.${string}`>,
    details?: Record<string, any>,
    context: AuditContext = {}
  ): Promise<void> {
    await this.log({
      action,
      resource: 'system',
      details,
      severity: action.includes('failed') ? 'error' : 'info',
      outcome: action.includes('failed') ? 'failure' : 'success',
    }, context);
  }

  /**
   * Get audit logs with filtering and pagination
   */
  async getLogs(options: {
    userId?: string;
    action?: string;
    resource?: string;
    severity?: AuditSeverity;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
    traceId?: string;
  } = {}) {
    const where: any = {};

    if (options.userId) where.userId = options.userId;
    if (options.action) where.action = { contains: options.action, mode: 'insensitive' };
    if (options.resource) where.resource = options.resource;
    if (options.severity) where.severity = options.severity;
    if (options.traceId) where.traceId = options.traceId;

    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
              role: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit || 50,
        skip: options.offset || 0,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return {
      logs,
      total,
      limit: options.limit || 50,
      offset: options.offset || 0,
    };
  }

  /**
   * Get audit statistics
   */
  async getStats(options: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
  } = {}) {
    const where: any = {};

    if (options.userId) where.userId = options.userId;
    if (options.startDate || options.endDate) {
      where.createdAt = {};
      if (options.startDate) where.createdAt.gte = options.startDate;
      if (options.endDate) where.createdAt.lte = options.endDate;
    }

    const [
      total,
      byAction,
      bySeverity,
      byOutcome,
      byResource,
    ] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.groupBy({
        by: ['action'],
        where,
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
        take: 10,
      }),
      prisma.auditLog.groupBy({
        by: ['severity'],
        where,
        _count: { severity: true },
      }),
      prisma.auditLog.groupBy({
        by: ['outcome'],
        where,
        _count: { outcome: true },
      }),
      prisma.auditLog.groupBy({
        by: ['resource'],
        where,
        _count: { resource: true },
        orderBy: { _count: { resource: 'desc' } },
        take: 10,
      }),
    ]);

    return {
      total,
      byAction: byAction.map(item => ({
        action: item.action,
        count: item._count.action,
      })),
      bySeverity: bySeverity.map(item => ({
        severity: item.severity,
        count: item._count.severity,
      })),
      byOutcome: byOutcome.map(item => ({
        outcome: item.outcome,
        count: item._count.outcome,
      })),
      byResource: byResource.map(item => ({
        resource: item.resource,
        count: item._count.resource,
      })),
    };
  }

  /**
   * Clean up old audit logs (for data retention)
   */
  async cleanup(daysToKeep: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

    const result = await prisma.auditLog.deleteMany({
      where: {
        createdAt: {
          lt: cutoffDate,
        },
        // Keep critical security events longer
        severity: {
          not: 'critical',
        },
      },
    });

    if (result.count > 0) {
      await this.logSystem('system.audit_cleanup', {
        deletedCount: result.count,
        cutoffDate: cutoffDate.toISOString(),
        daysToKeep,
      });
    }

    return result.count;
  }
}

// Export singleton instance
export const auditLogger = new AuditLogger();

// Utility functions for common audit patterns
export const audit = {
  /**
   * Extract context from Next.js request
   */
  contextFromRequest(req: any): AuditContext {
    return {
      ipAddress: req.ip || req.headers['x-forwarded-for'] || req.headers['x-real-ip'],
      userAgent: req.headers['user-agent'],
    };
  },

  /**
   * Create middleware for automatic audit logging
   */
  middleware(action: AuditAction, resource?: AuditResource) {
    return function auditMiddleware<T extends (...args: any[]) => Promise<any>>(
      handler: T,
      options: {
        skipSuccess?: boolean;
        extractResourceId?: (args: any[]) => string;
        extractDetails?: (args: any[], result?: any) => Record<string, any>;
      } = {}
    ): T {
      return (async (...args: any[]) => {
        const [request] = args;
        const context = audit.contextFromRequest(request);
        let success = false;
        let result: any;

        try {
          result = await handler(...args);
          success = true;
          return result;
        } catch (error) {
          await auditLogger.log({
            action,
            resource,
            resourceId: options.extractResourceId?.(args),
            details: {
              error: error instanceof Error ? error.message : 'Unknown error',
              ...options.extractDetails?.(args),
            },
            severity: 'error',
            outcome: 'failure',
          }, context);
          throw error;
        } finally {
          if (success && !options.skipSuccess) {
            await auditLogger.log({
              action,
              resource,
              resourceId: options.extractResourceId?.(args),
              details: options.extractDetails?.(args, result),
              severity: 'info',
              outcome: 'success',
            }, context);
          }
        }
      }) as T;
    };
  },
};

// Export types for external use
export type {
  AuditAction,
  AuditSeverity,
  AuditOutcome,
  AuditResource,
  AuditLogEntry,
  AuditContext,
};