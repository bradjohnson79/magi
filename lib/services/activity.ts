import { Database } from '@/lib/database';
import {
  ActivityEvent,
  ActivityFilter,
  Collaborator
} from '@/lib/types/collaboration';

export class ActivityService {
  private static instance: ActivityService;
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): ActivityService {
    if (!ActivityService.instance) {
      ActivityService.instance = new ActivityService();
    }
    return ActivityService.instance;
  }

  /**
   * Log a new activity event
   */
  async logActivity(
    projectId: string,
    userId: string,
    action: string,
    description: string,
    metadata: Record<string, any> = {},
    collaboratorId?: string,
    commentId?: string,
    presenceData?: Record<string, any>
  ): Promise<ActivityEvent> {
    try {
      const query = `
        INSERT INTO activity_logs (
          project_id,
          user_id,
          action,
          description,
          metadata,
          collaborator_id,
          comment_id,
          presence_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *
      `;

      const values = [
        projectId,
        userId,
        action,
        description,
        JSON.stringify(metadata),
        collaboratorId,
        commentId,
        presenceData ? JSON.stringify(presenceData) : null
      ];

      const result = await this.db.query(query, values);
      const activity = await this.getActivityById(result.rows[0].id);

      if (!activity) {
        throw new Error('Failed to retrieve created activity');
      }

      // Send real-time update
      await this.broadcastActivityUpdate(activity);

      return activity;
    } catch (error) {
      console.error('Error logging activity:', error);
      throw new Error('Failed to log activity');
    }
  }

  /**
   * Get activity by ID
   */
  async getActivityById(activityId: string): Promise<ActivityEvent | null> {
    try {
      const query = `
        SELECT
          al.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.image_url as user_avatar
        FROM activity_logs al
        JOIN users u ON al.user_id = u.id
        WHERE al.id = $1
      `;

      const result = await this.db.query(query, [activityId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapActivityFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error getting activity by ID:', error);
      throw new Error('Failed to get activity');
    }
  }

  /**
   * Get activities for a project with filtering
   */
  async getProjectActivities(
    projectId: string,
    filter: ActivityFilter = {},
    limit = 50,
    offset = 0
  ): Promise<{
    activities: ActivityEvent[];
    totalCount: number;
    hasMore: boolean;
  }> {
    try {
      let query = `
        SELECT
          al.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.image_url as user_avatar
        FROM activity_logs al
        JOIN users u ON al.user_id = u.id
        WHERE al.project_id = $1
      `;

      const params = [projectId];
      let paramIndex = 2;

      // Apply filters
      if (filter.userId) {
        query += ` AND al.user_id = $${paramIndex}`;
        params.push(filter.userId);
        paramIndex++;
      }

      if (filter.action) {
        query += ` AND al.action = $${paramIndex}`;
        params.push(filter.action);
        paramIndex++;
      }

      if (filter.collaboratorId) {
        query += ` AND al.collaborator_id = $${paramIndex}`;
        params.push(filter.collaboratorId);
        paramIndex++;
      }

      if (filter.dateFrom) {
        query += ` AND al.created_at >= $${paramIndex}`;
        params.push(filter.dateFrom);
        paramIndex++;
      }

      if (filter.dateTo) {
        query += ` AND al.created_at <= $${paramIndex}`;
        params.push(filter.dateTo);
        paramIndex++;
      }

      if (!filter.includePresence) {
        query += ` AND al.action NOT IN ('user_joined', 'user_left', 'user_online', 'user_offline')`;
      }

      // Count total without limit
      const countQuery = query.replace(
        'SELECT al.*, u.first_name || \' \' || u.last_name as user_name, u.image_url as user_avatar',
        'SELECT COUNT(*) as total'
      );

      const [activitiesResult, countResult] = await Promise.all([
        this.db.query(
          query + ` ORDER BY al.created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...params, limit, offset]
        ),
        this.db.query(countQuery, params)
      ]);

      const totalCount = parseInt(countResult.rows[0].total, 10);
      const activities = activitiesResult.rows.map(row => this.mapActivityFromRow(row));

      return {
        activities,
        totalCount,
        hasMore: offset + activities.length < totalCount
      };
    } catch (error) {
      console.error('Error getting project activities:', error);
      throw new Error('Failed to get project activities');
    }
  }

  /**
   * Get recent activities for a user across all projects
   */
  async getUserActivities(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<ActivityEvent[]> {
    try {
      const query = `
        SELECT
          al.*,
          u.first_name || ' ' || u.last_name as user_name,
          u.image_url as user_avatar,
          p.name as project_name
        FROM activity_logs al
        JOIN users u ON al.user_id = u.id
        JOIN projects p ON al.project_id = p.id
        WHERE al.user_id = $1
        OR al.collaborator_id = $1
        ORDER BY al.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [userId, limit, offset]);
      return result.rows.map(row => ({
        ...this.mapActivityFromRow(row),
        metadata: {
          ...row.metadata,
          projectName: row.project_name
        }
      }));
    } catch (error) {
      console.error('Error getting user activities:', error);
      throw new Error('Failed to get user activities');
    }
  }

  /**
   * Log presence activity
   */
  async logPresenceActivity(
    projectId: string,
    userId: string,
    action: 'user_joined' | 'user_left' | 'user_online' | 'user_offline',
    collaborator: Collaborator
  ): Promise<ActivityEvent> {
    const descriptions = {
      user_joined: `joined the project`,
      user_left: `left the project`,
      user_online: `came online`,
      user_offline: `went offline`
    };

    return this.logActivity(
      projectId,
      userId,
      action,
      descriptions[action],
      {
        collaboratorName: collaborator.userName,
        collaboratorAvatar: collaborator.avatarUrl,
        sessionId: collaborator.sessionId
      },
      collaborator.userId,
      undefined,
      {
        status: collaborator.status,
        lastSeen: collaborator.lastSeen,
        currentPage: collaborator.currentPage
      }
    );
  }

  /**
   * Log comment activity
   */
  async logCommentActivity(
    projectId: string,
    userId: string,
    action: 'comment_created' | 'comment_updated' | 'comment_resolved' | 'comment_deleted',
    commentId: string,
    metadata: Record<string, any> = {}
  ): Promise<ActivityEvent> {
    const descriptions = {
      comment_created: 'created a comment',
      comment_updated: 'updated a comment',
      comment_resolved: 'resolved a comment',
      comment_deleted: 'deleted a comment'
    };

    return this.logActivity(
      projectId,
      userId,
      action,
      descriptions[action],
      metadata,
      undefined,
      commentId
    );
  }

  /**
   * Log project activity
   */
  async logProjectActivity(
    projectId: string,
    userId: string,
    action: 'project_created' | 'project_updated' | 'project_archived' | 'project_restored',
    metadata: Record<string, any> = {}
  ): Promise<ActivityEvent> {
    const descriptions = {
      project_created: 'created the project',
      project_updated: 'updated the project',
      project_archived: 'archived the project',
      project_restored: 'restored the project'
    };

    return this.logActivity(
      projectId,
      userId,
      action,
      descriptions[action],
      metadata
    );
  }

  /**
   * Log collaboration activity
   */
  async logCollaborationActivity(
    projectId: string,
    userId: string,
    action: 'collaborator_added' | 'collaborator_removed' | 'permission_changed',
    collaboratorId: string,
    metadata: Record<string, any> = {}
  ): Promise<ActivityEvent> {
    const descriptions = {
      collaborator_added: 'added a collaborator',
      collaborator_removed: 'removed a collaborator',
      permission_changed: 'changed collaborator permissions'
    };

    return this.logActivity(
      projectId,
      userId,
      action,
      descriptions[action],
      metadata,
      collaboratorId
    );
  }

  /**
   * Get activity statistics for a project
   */
  async getActivityStats(
    projectId: string,
    timeframe: 'day' | 'week' | 'month' = 'week'
  ): Promise<{
    totalActivities: number;
    activitiesByType: Record<string, number>;
    activeUsers: number;
    mostActiveUser: string | null;
    activityTrend: { date: string; count: number }[];
  }> {
    try {
      const intervals = {
        day: '24 hours',
        week: '7 days',
        month: '30 days'
      };

      const interval = intervals[timeframe];

      const query = `
        SELECT
          COUNT(*) as total_activities,
          action,
          COUNT(*) as action_count,
          COUNT(DISTINCT user_id) as active_users,
          user_id,
          COUNT(*) as user_activity_count,
          DATE_TRUNC('${timeframe === 'day' ? 'hour' : 'day'}', created_at) as period,
          COUNT(*) as period_count
        FROM activity_logs
        WHERE project_id = $1
        AND created_at > now() - interval '${interval}'
        GROUP BY action, user_id, period
        ORDER BY period DESC
      `;

      const result = await this.db.query(query, [projectId]);

      // Process results
      const stats = {
        totalActivities: 0,
        activitiesByType: {} as Record<string, number>,
        activeUsers: 0,
        mostActiveUser: null as string | null,
        activityTrend: [] as { date: string; count: number }[]
      };

      const userActivityCounts: Record<string, number> = {};
      const periodCounts: Record<string, number> = {};

      result.rows.forEach(row => {
        stats.totalActivities += parseInt(row.action_count, 10);
        stats.activitiesByType[row.action] = parseInt(row.action_count, 10);

        const userId = row.user_id;
        const userCount = parseInt(row.user_activity_count, 10);
        userActivityCounts[userId] = (userActivityCounts[userId] || 0) + userCount;

        const period = row.period.toISOString().split('T')[0];
        const periodCount = parseInt(row.period_count, 10);
        periodCounts[period] = (periodCounts[period] || 0) + periodCount;
      });

      stats.activeUsers = Object.keys(userActivityCounts).length;

      // Find most active user
      let maxActivity = 0;
      Object.entries(userActivityCounts).forEach(([userId, count]) => {
        if (count > maxActivity) {
          maxActivity = count;
          stats.mostActiveUser = userId;
        }
      });

      // Build activity trend
      stats.activityTrend = Object.entries(periodCounts)
        .map(([date, count]) => ({ date, count }))
        .sort((a, b) => a.date.localeCompare(b.date));

      return stats;
    } catch (error) {
      console.error('Error getting activity stats:', error);
      throw new Error('Failed to get activity stats');
    }
  }

  /**
   * Clean up old activities
   */
  async cleanupOldActivities(olderThanDays = 90): Promise<number> {
    try {
      const query = `
        DELETE FROM activity_logs
        WHERE created_at < now() - interval '${olderThanDays} days'
        AND action IN ('user_online', 'user_offline', 'user_joined', 'user_left')
      `;

      const result = await this.db.query(query);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Error cleaning up old activities:', error);
      throw new Error('Failed to cleanup old activities');
    }
  }

  /**
   * Get activity summary for dashboard
   */
  async getActivitySummary(
    projectId: string,
    period: 'today' | 'week' | 'month' = 'today'
  ): Promise<{
    totalActivities: number;
    commentsActivity: number;
    presenceActivity: number;
    projectActivity: number;
    topContributors: { userId: string; userName: string; activityCount: number }[];
  }> {
    try {
      const intervals = {
        today: '24 hours',
        week: '7 days',
        month: '30 days'
      };

      const query = `
        SELECT
          COUNT(*) as total_activities,
          COUNT(CASE WHEN action LIKE 'comment_%' THEN 1 END) as comments_activity,
          COUNT(CASE WHEN action LIKE 'user_%' THEN 1 END) as presence_activity,
          COUNT(CASE WHEN action LIKE 'project_%' THEN 1 END) as project_activity,
          al.user_id,
          u.first_name || ' ' || u.last_name as user_name,
          COUNT(*) as user_activity_count
        FROM activity_logs al
        JOIN users u ON al.user_id = u.id
        WHERE al.project_id = $1
        AND al.created_at > now() - interval '${intervals[period]}'
        GROUP BY al.user_id, u.first_name, u.last_name
        ORDER BY user_activity_count DESC
      `;

      const result = await this.db.query(query, [projectId]);

      if (result.rows.length === 0) {
        return {
          totalActivities: 0,
          commentsActivity: 0,
          presenceActivity: 0,
          projectActivity: 0,
          topContributors: []
        };
      }

      const firstRow = result.rows[0];

      return {
        totalActivities: parseInt(firstRow.total_activities, 10),
        commentsActivity: parseInt(firstRow.comments_activity, 10),
        presenceActivity: parseInt(firstRow.presence_activity, 10),
        projectActivity: parseInt(firstRow.project_activity, 10),
        topContributors: result.rows.slice(0, 5).map(row => ({
          userId: row.user_id,
          userName: row.user_name,
          activityCount: parseInt(row.user_activity_count, 10)
        }))
      };
    } catch (error) {
      console.error('Error getting activity summary:', error);
      throw new Error('Failed to get activity summary');
    }
  }

  /**
   * Send real-time activity update
   */
  private async broadcastActivityUpdate(activity: ActivityEvent): Promise<void> {
    try {
      // Import WebSocketService dynamically to avoid circular dependencies
      const { WebSocketService } = await import('@/lib/services/websocket');
      const wsService = WebSocketService.getInstance();

      wsService.emitActivityUpdate(activity.projectId, {
        type: 'activity_create',
        activity
      });
    } catch (error) {
      console.error('Error broadcasting activity update:', error);
      // Don't throw error for real-time update failures
    }
  }

  /**
   * Private helper methods
   */
  private mapActivityFromRow(row: any): ActivityEvent {
    return {
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      userName: row.user_name,
      userAvatar: row.user_avatar,
      action: row.action,
      description: row.description,
      metadata: row.metadata || {},
      collaboratorId: row.collaborator_id,
      commentId: row.comment_id,
      presenceData: row.presence_data,
      createdAt: new Date(row.created_at)
    };
  }
}