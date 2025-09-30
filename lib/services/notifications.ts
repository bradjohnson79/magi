import { Database } from '@/lib/database';
import {
  Notification,
  NotificationType,
  NotificationPreferences,
  DEFAULT_NOTIFICATION_PREFERENCES
} from '@/lib/types/collaboration';

export class NotificationService {
  private static instance: NotificationService;
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }
    return NotificationService.instance;
  }

  /**
   * Create a new notification
   */
  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    content?: string,
    data: Record<string, any> = {},
    projectId?: string,
    commentId?: string,
    mentionedBy?: string
  ): Promise<Notification> {
    try {
      const query = `
        SELECT create_notification($1, $2, $3, $4, $5, $6, $7, $8) as notification_id
      `;

      const values = [
        userId,
        type,
        title,
        content,
        JSON.stringify(data),
        projectId,
        commentId,
        mentionedBy
      ];

      const result = await this.db.query(query, values);
      const notificationId = result.rows[0].notification_id;

      const notification = await this.getNotificationById(notificationId);
      if (!notification) {
        throw new Error('Failed to retrieve created notification');
      }

      // Send real-time notification if user is online
      await this.sendRealTimeNotification(notification);

      // Queue email notification if enabled
      await this.queueEmailNotification(notification);

      return notification;
    } catch (error) {
      console.error('Error creating notification:', error);
      throw new Error('Failed to create notification');
    }
  }

  /**
   * Get notification by ID
   */
  async getNotificationById(notificationId: string): Promise<Notification | null> {
    try {
      const query = `
        SELECT * FROM notifications
        WHERE id = $1
      `;

      const result = await this.db.query(query, [notificationId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapNotificationFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error getting notification by ID:', error);
      throw new Error('Failed to get notification');
    }
  }

  /**
   * Get notifications for a user
   */
  async getUserNotifications(
    userId: string,
    options: {
      unreadOnly?: boolean;
      type?: NotificationType;
      projectId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{
    notifications: Notification[];
    unreadCount: number;
    totalCount: number;
  }> {
    try {
      let query = `
        SELECT * FROM notifications
        WHERE user_id = $1
      `;

      const params = [userId];
      let paramIndex = 2;

      if (options.unreadOnly) {
        query += ` AND read = false`;
      }

      if (options.type) {
        query += ` AND type = $${paramIndex}`;
        params.push(options.type);
        paramIndex++;
      }

      if (options.projectId) {
        query += ` AND project_id = $${paramIndex}`;
        params.push(options.projectId);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC`;

      if (options.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(options.offset);
      }

      const [notificationsResult, countsResult] = await Promise.all([
        this.db.query(query, params),
        this.getUserNotificationCounts(userId, options.projectId)
      ]);

      return {
        notifications: notificationsResult.rows.map(row => this.mapNotificationFromRow(row)),
        unreadCount: countsResult.unreadCount,
        totalCount: countsResult.totalCount
      };
    } catch (error) {
      console.error('Error getting user notifications:', error);
      throw new Error('Failed to get user notifications');
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string, userId: string): Promise<Notification> {
    try {
      const query = `
        UPDATE notifications
        SET read = true, read_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;

      const result = await this.db.query(query, [notificationId, userId]);

      if (result.rows.length === 0) {
        throw new Error('Notification not found or access denied');
      }

      return this.mapNotificationFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw new Error('Failed to mark notification as read');
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string, projectId?: string): Promise<number> {
    try {
      let query = `
        UPDATE notifications
        SET read = true, read_at = now()
        WHERE user_id = $1 AND read = false
      `;

      const params = [userId];

      if (projectId) {
        query += ` AND project_id = $2`;
        params.push(projectId);
      }

      const result = await this.db.query(query, params);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw new Error('Failed to mark all notifications as read');
    }
  }

  /**
   * Delete notification
   */
  async deleteNotification(notificationId: string, userId: string): Promise<void> {
    try {
      const query = `
        DELETE FROM notifications
        WHERE id = $1 AND user_id = $2
      `;

      const result = await this.db.query(query, [notificationId, userId]);

      if (result.rowCount === 0) {
        throw new Error('Notification not found or access denied');
      }
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw new Error('Failed to delete notification');
    }
  }

  /**
   * Get notification counts for a user
   */
  async getUserNotificationCounts(userId: string, projectId?: string): Promise<{
    unreadCount: number;
    totalCount: number;
  }> {
    try {
      let query = `
        SELECT
          COUNT(*) as total_count,
          COUNT(CASE WHEN read = false THEN 1 END) as unread_count
        FROM notifications
        WHERE user_id = $1
      `;

      const params = [userId];

      if (projectId) {
        query += ` AND project_id = $2`;
        params.push(projectId);
      }

      const result = await this.db.query(query, params);
      const row = result.rows[0];

      return {
        unreadCount: parseInt(row.unread_count, 10),
        totalCount: parseInt(row.total_count, 10)
      };
    } catch (error) {
      console.error('Error getting notification counts:', error);
      throw new Error('Failed to get notification counts');
    }
  }

  /**
   * Create comment mention notification
   */
  async createCommentMentionNotification(
    mentionedUserId: string,
    mentioningUserId: string,
    commentId: string,
    projectId: string,
    projectName: string
  ): Promise<Notification> {
    return this.createNotification(
      mentionedUserId,
      'comment_mention',
      `You were mentioned in ${projectName}`,
      'Someone mentioned you in a comment',
      {
        commentId,
        projectId,
        projectName,
        mentioningUserId
      },
      projectId,
      commentId,
      mentioningUserId
    );
  }

  /**
   * Create comment reply notification
   */
  async createCommentReplyNotification(
    originalAuthorId: string,
    replyingUserId: string,
    commentId: string,
    parentCommentId: string,
    projectId: string,
    projectName: string
  ): Promise<Notification> {
    return this.createNotification(
      originalAuthorId,
      'comment_reply',
      `New reply in ${projectName}`,
      'Someone replied to your comment',
      {
        commentId,
        parentCommentId,
        projectId,
        projectName,
        replyingUserId
      },
      projectId,
      commentId,
      replyingUserId
    );
  }

  /**
   * Create presence notification
   */
  async createPresenceNotification(
    userId: string,
    joinedUserId: string,
    projectId: string,
    projectName: string,
    type: 'presence_joined' | 'presence_left'
  ): Promise<Notification> {
    const action = type === 'presence_joined' ? 'joined' : 'left';

    return this.createNotification(
      userId,
      type,
      `User ${action} ${projectName}`,
      `A collaborator ${action} the project`,
      {
        projectId,
        projectName,
        joinedUserId,
        action
      },
      projectId,
      undefined,
      joinedUserId
    );
  }

  /**
   * Get notification preferences for a user
   */
  async getUserNotificationPreferences(userId: string): Promise<NotificationPreferences> {
    try {
      // This would typically be stored in a user_preferences table
      // For now, return default preferences
      return DEFAULT_NOTIFICATION_PREFERENCES;
    } catch (error) {
      console.error('Error getting notification preferences:', error);
      return DEFAULT_NOTIFICATION_PREFERENCES;
    }
  }

  /**
   * Update notification preferences for a user
   */
  async updateUserNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences> {
    try {
      // Implementation would update user_preferences table
      // For now, return updated preferences
      const currentPreferences = await this.getUserNotificationPreferences(userId);
      return { ...currentPreferences, ...preferences };
    } catch (error) {
      console.error('Error updating notification preferences:', error);
      throw new Error('Failed to update notification preferences');
    }
  }

  /**
   * Clean up old notifications
   */
  async cleanupOldNotifications(olderThanDays = 90): Promise<number> {
    try {
      const query = `
        DELETE FROM notifications
        WHERE created_at < now() - interval '${olderThanDays} days'
        AND read = true
      `;

      const result = await this.db.query(query);
      return result.rowCount || 0;
    } catch (error) {
      console.error('Error cleaning up old notifications:', error);
      throw new Error('Failed to cleanup old notifications');
    }
  }

  /**
   * Get notification statistics
   */
  async getNotificationStats(
    userId?: string,
    projectId?: string
  ): Promise<{
    totalNotifications: number;
    unreadNotifications: number;
    notificationsByType: Record<NotificationType, number>;
    recentNotifications: number;
  }> {
    try {
      let query = `
        SELECT
          COUNT(*) as total_notifications,
          COUNT(CASE WHEN read = false THEN 1 END) as unread_notifications,
          COUNT(CASE WHEN created_at > now() - interval '24 hours' THEN 1 END) as recent_notifications,
          type,
          COUNT(*) as type_count
        FROM notifications
        WHERE 1=1
      `;

      const params: any[] = [];
      let paramIndex = 1;

      if (userId) {
        query += ` AND user_id = $${paramIndex}`;
        params.push(userId);
        paramIndex++;
      }

      if (projectId) {
        query += ` AND project_id = $${paramIndex}`;
        params.push(projectId);
        paramIndex++;
      }

      query += ` GROUP BY type`;

      const result = await this.db.query(query, params);

      const stats = {
        totalNotifications: 0,
        unreadNotifications: 0,
        recentNotifications: 0,
        notificationsByType: {} as Record<NotificationType, number>
      };

      if (result.rows.length > 0) {
        stats.totalNotifications = parseInt(result.rows[0].total_notifications, 10);
        stats.unreadNotifications = parseInt(result.rows[0].unread_notifications, 10);
        stats.recentNotifications = parseInt(result.rows[0].recent_notifications, 10);

        result.rows.forEach(row => {
          stats.notificationsByType[row.type as NotificationType] = parseInt(row.type_count, 10);
        });
      }

      return stats;
    } catch (error) {
      console.error('Error getting notification stats:', error);
      throw new Error('Failed to get notification stats');
    }
  }

  /**
   * Send real-time notification via WebSocket
   */
  private async sendRealTimeNotification(notification: Notification): Promise<void> {
    try {
      // Import WebSocketService dynamically to avoid circular dependencies
      const { WebSocketService } = await import('@/lib/services/websocket');
      const wsService = WebSocketService.getInstance();

      wsService.emitNotification(notification.userId, {
        type: 'notification_create',
        notification
      });
    } catch (error) {
      console.error('Error sending real-time notification:', error);
      // Don't throw error for real-time notification failures
    }
  }

  /**
   * Queue email notification
   */
  private async queueEmailNotification(notification: Notification): Promise<void> {
    try {
      // Check user preferences first
      const preferences = await this.getUserNotificationPreferences(notification.userId);

      if (!preferences.emailNotifications) {
        return;
      }

      // Check if this notification type should send emails
      const shouldSendEmail = this.shouldSendEmailForType(notification.type, preferences);

      if (!shouldSendEmail) {
        return;
      }

      // Queue email (implementation would depend on your email service)
      // For now, just log
      console.log(`Queuing email notification for user ${notification.userId}: ${notification.title}`);
    } catch (error) {
      console.error('Error queuing email notification:', error);
      // Don't throw error for email notification failures
    }
  }

  /**
   * Check if email should be sent for notification type
   */
  private shouldSendEmailForType(
    type: NotificationType,
    preferences: NotificationPreferences
  ): boolean {
    switch (type) {
      case 'comment_mention':
        return preferences.commentMentions;
      case 'comment_reply':
        return preferences.commentReplies;
      case 'project_invite':
        return preferences.projectInvites;
      case 'project_update':
        return preferences.projectUpdates;
      case 'presence_joined':
      case 'presence_left':
        return preferences.presenceEvents;
      default:
        return false;
    }
  }

  /**
   * Private helper methods
   */
  private mapNotificationFromRow(row: any): Notification {
    return {
      id: row.id,
      userId: row.user_id,
      type: row.type,
      title: row.title,
      content: row.content,
      data: row.data || {},
      read: row.read,
      readAt: row.read_at ? new Date(row.read_at) : undefined,
      projectId: row.project_id,
      commentId: row.comment_id,
      mentionedBy: row.mentioned_by,
      createdAt: new Date(row.created_at)
    };
  }
}