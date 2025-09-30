/**
 * Activity Logging Service
 *
 * Handles comprehensive activity tracking for workspaces and projects
 * with support for change reversions and collaborative versioning.
 */

import { prisma } from '@/lib/prisma';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { workspaceManager } from '@/services/workspace/manager';

export interface ActivityLogEntry {
  workspaceId?: string;
  projectId?: string;
  userId: string;
  action: string;
  target?: string;
  targetId?: string;
  metadata?: Record<string, any>;
  changes?: ActivityChange[];
  ipAddress?: string;
  userAgent?: string;
}

export interface ActivityChange {
  type: 'create' | 'update' | 'delete' | 'move' | 'rename';
  path: string;
  before?: any;
  after?: any;
  diff?: string;
  checksum?: string;
}

export interface ActivityFilter {
  workspaceId?: string;
  projectId?: string;
  userId?: string;
  action?: string;
  target?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface RevertOptions {
  activityId: string;
  userId: string;
  reason?: string;
  dryRun?: boolean;
}

export class ActivityLogger {
  private static instance: ActivityLogger;

  public static getInstance(): ActivityLogger {
    if (!ActivityLogger.instance) {
      ActivityLogger.instance = new ActivityLogger();
    }
    return ActivityLogger.instance;
  }

  /**
   * Log activity with optional change tracking
   */
  async logActivity(entry: ActivityLogEntry): Promise<any> {
    return withSpan('activity.log', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_log',
          [SPAN_ATTRIBUTES.USER_ID]: entry.userId,
          [SPAN_ATTRIBUTES.PROJECT_ID]: entry.projectId || 'none',
          'activity.action': entry.action,
          'activity.target': entry.target || 'none',
        });

        // Validate workspace/project access if specified
        if (entry.workspaceId) {
          await workspaceManager.validateMemberAccess(entry.workspaceId, entry.userId);
        }

        const activity = await prisma.activityLog.create({
          data: {
            workspaceId: entry.workspaceId,
            projectId: entry.projectId,
            userId: entry.userId,
            action: entry.action,
            target: entry.target,
            targetId: entry.targetId,
            metadata: entry.metadata || {},
            changes: entry.changes || [],
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            workspace: {
              select: {
                id: true,
                name: true,
              },
            },
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        addSpanAttributes(span, {
          'activity.id': activity.id,
          'activity.changes_count': entry.changes?.length || 0,
        });

        return activity;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Log file change activity
   */
  async logFileChange(
    workspaceId: string | undefined,
    projectId: string,
    userId: string,
    change: ActivityChange,
    metadata?: Record<string, any>
  ): Promise<any> {
    return this.logActivity({
      workspaceId,
      projectId,
      userId,
      action: `file.${change.type}`,
      target: 'file',
      targetId: change.path,
      changes: [change],
      metadata: {
        ...metadata,
        filePath: change.path,
        changeType: change.type,
      },
    });
  }

  /**
   * Log collaboration activity
   */
  async logCollaboration(
    workspaceId: string,
    projectId: string,
    userId: string,
    action: string,
    collaboratorId?: string,
    metadata?: Record<string, any>
  ): Promise<any> {
    return this.logActivity({
      workspaceId,
      projectId,
      userId,
      action: `collaboration.${action}`,
      target: 'user',
      targetId: collaboratorId,
      metadata: {
        ...metadata,
        collaboratorId,
      },
    });
  }

  /**
   * Log template activity
   */
  async logTemplateActivity(
    userId: string,
    action: string,
    templateId: string,
    projectId?: string,
    metadata?: Record<string, any>
  ): Promise<any> {
    return this.logActivity({
      projectId,
      userId,
      action: `template.${action}`,
      target: 'template',
      targetId: templateId,
      metadata: {
        ...metadata,
        templateId,
      },
    });
  }

  /**
   * Get activity feed with filtering
   */
  async getActivityFeed(filter: ActivityFilter = {}): Promise<{
    activities: any[];
    total: number;
    hasMore: boolean;
  }> {
    return withSpan('activity.get_feed', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_get_feed',
          'filter.workspace_id': filter.workspaceId || 'none',
          'filter.project_id': filter.projectId || 'none',
          'filter.limit': filter.limit || 50,
        });

        const where: any = {};

        if (filter.workspaceId) {
          where.workspaceId = filter.workspaceId;
        }

        if (filter.projectId) {
          where.projectId = filter.projectId;
        }

        if (filter.userId) {
          where.userId = filter.userId;
        }

        if (filter.action) {
          where.action = {
            contains: filter.action,
            mode: 'insensitive',
          };
        }

        if (filter.target) {
          where.target = filter.target;
        }

        if (filter.dateFrom || filter.dateTo) {
          where.createdAt = {};
          if (filter.dateFrom) {
            where.createdAt.gte = filter.dateFrom;
          }
          if (filter.dateTo) {
            where.createdAt.lte = filter.dateTo;
          }
        }

        const limit = filter.limit || 50;
        const offset = filter.offset || 0;

        const [activities, total] = await Promise.all([
          prisma.activityLog.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              workspace: {
                select: {
                  id: true,
                  name: true,
                },
              },
              project: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: limit,
            skip: offset,
          }),
          prisma.activityLog.count({ where }),
        ]);

        return {
          activities,
          total,
          hasMore: offset + limit < total,
        };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get activity by ID
   */
  async getActivity(activityId: string, userId: string): Promise<any> {
    return withSpan('activity.get', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_get',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'activity.id': activityId,
        });

        const activity = await prisma.activityLog.findUnique({
          where: { id: activityId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            workspace: {
              select: {
                id: true,
                name: true,
              },
            },
            project: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        if (!activity) {
          throw new Error('Activity not found');
        }

        // Check access permissions
        if (activity.workspaceId) {
          await workspaceManager.validateMemberAccess(activity.workspaceId, userId);
        }

        return activity;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Revert activity changes
   */
  async revertActivity(options: RevertOptions): Promise<{
    success: boolean;
    changes: ActivityChange[];
    newActivityId?: string;
  }> {
    return withSpan('activity.revert', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_revert',
          [SPAN_ATTRIBUTES.USER_ID]: options.userId,
          'activity.id': options.activityId,
          'revert.dry_run': options.dryRun || false,
        });

        // Get the activity to revert
        const activity = await this.getActivity(options.activityId, options.userId);

        if (!activity.changes || activity.changes.length === 0) {
          throw new Error('Activity has no changes to revert');
        }

        // Check if user has permission to revert
        if (activity.workspaceId) {
          await workspaceManager.validatePermission(
            activity.workspaceId,
            options.userId,
            'canMergeBranches' // Requires merge permission to revert
          );
        }

        // Generate reverse changes
        const reverseChanges = this.generateReverseChanges(activity.changes as ActivityChange[]);

        if (options.dryRun) {
          return {
            success: true,
            changes: reverseChanges,
          };
        }

        // Apply reverse changes
        await this.applyChanges(activity.projectId!, reverseChanges);

        // Log the revert activity
        const revertActivity = await this.logActivity({
          workspaceId: activity.workspaceId,
          projectId: activity.projectId,
          userId: options.userId,
          action: 'activity.reverted',
          target: 'activity',
          targetId: options.activityId,
          changes: reverseChanges,
          metadata: {
            originalActivityId: options.activityId,
            originalAction: activity.action,
            reason: options.reason,
            revertedAt: new Date().toISOString(),
          },
        });

        addSpanAttributes(span, {
          'revert.changes_count': reverseChanges.length,
          'revert.new_activity_id': revertActivity.id,
        });

        return {
          success: true,
          changes: reverseChanges,
          newActivityId: revertActivity.id,
        };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get user activity statistics
   */
  async getUserActivityStats(
    userId: string,
    workspaceId?: string,
    dateFrom?: Date,
    dateTo?: Date
  ): Promise<{
    totalActivities: number;
    actionBreakdown: Record<string, number>;
    recentActivity: any[];
    collaborations: number;
  }> {
    return withSpan('activity.get_user_stats', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'activity_user_stats',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'stats.workspace_id': workspaceId || 'all',
        });

        const where: any = { userId };

        if (workspaceId) {
          where.workspaceId = workspaceId;
        }

        if (dateFrom || dateTo) {
          where.createdAt = {};
          if (dateFrom) where.createdAt.gte = dateFrom;
          if (dateTo) where.createdAt.lte = dateTo;
        }

        const [totalActivities, activities] = await Promise.all([
          prisma.activityLog.count({ where }),
          prisma.activityLog.findMany({
            where,
            select: {
              action: true,
              createdAt: true,
              target: true,
            },
            orderBy: { createdAt: 'desc' },
            take: 100,
          }),
        ]);

        // Calculate action breakdown
        const actionBreakdown: Record<string, number> = {};
        activities.forEach(activity => {
          const actionType = activity.action.split('.')[0];
          actionBreakdown[actionType] = (actionBreakdown[actionType] || 0) + 1;
        });

        // Count collaborations (activities involving other users)
        const collaborations = await prisma.activityLog.count({
          where: {
            ...where,
            action: {
              startsWith: 'collaboration.',
            },
          },
        });

        return {
          totalActivities,
          actionBreakdown,
          recentActivity: activities.slice(0, 10),
          collaborations,
        };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Generate reverse changes for revert operation
   */
  private generateReverseChanges(changes: ActivityChange[]): ActivityChange[] {
    return changes.map(change => {
      switch (change.type) {
        case 'create':
          return {
            type: 'delete',
            path: change.path,
            before: change.after,
            after: undefined,
          };

        case 'delete':
          return {
            type: 'create',
            path: change.path,
            before: undefined,
            after: change.before,
          };

        case 'update':
          return {
            type: 'update',
            path: change.path,
            before: change.after,
            after: change.before,
          };

        case 'rename':
          // For rename, we need to reverse the path change
          return {
            type: 'rename',
            path: change.after as string,
            before: change.after,
            after: change.before,
          };

        case 'move':
          return {
            type: 'move',
            path: change.after as string,
            before: change.after,
            after: change.before,
          };

        default:
          throw new Error(`Unsupported change type: ${change.type}`);
      }
    }).reverse(); // Reverse order to undo changes in correct sequence
  }

  /**
   * Apply changes to project files
   */
  private async applyChanges(projectId: string, changes: ActivityChange[]): Promise<void> {
    // This would integrate with the collaboration system to apply file changes
    // For now, we'll just log that changes would be applied
    console.log(`Would apply ${changes.length} changes to project ${projectId}`);

    // In a real implementation, this would:
    // 1. Load current file states
    // 2. Apply each change in sequence
    // 3. Update file contents in collaboration system
    // 4. Notify connected clients of changes
  }

  /**
   * Get activity timeline for visualization
   */
  async getActivityTimeline(
    workspaceId: string,
    userId: string,
    days = 30
  ): Promise<Array<{
    date: string;
    activities: number;
    actions: Record<string, number>;
  }>> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const activities = await prisma.activityLog.findMany({
      where: {
        workspaceId,
        createdAt: {
          gte: startDate,
        },
      },
      select: {
        action: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });

    // Group by date
    const timeline = new Map<string, { activities: number; actions: Record<string, number> }>();

    activities.forEach(activity => {
      const date = activity.createdAt.toISOString().split('T')[0];
      const actionType = activity.action.split('.')[0];

      if (!timeline.has(date)) {
        timeline.set(date, { activities: 0, actions: {} });
      }

      const dayData = timeline.get(date)!;
      dayData.activities++;
      dayData.actions[actionType] = (dayData.actions[actionType] || 0) + 1;
    });

    return Array.from(timeline.entries()).map(([date, data]) => ({
      date,
      ...data,
    }));
  }
}

export const activityLogger = ActivityLogger.getInstance();