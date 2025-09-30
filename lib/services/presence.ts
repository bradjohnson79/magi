import { Database } from '@/lib/database';
import {
  UserPresence,
  Collaborator,
  PresenceStatus,
  PresenceUpdateData,
  CursorPosition,
  DEFAULT_PRESENCE_CONFIG
} from '@/lib/types/collaboration';

export class PresenceService {
  private static instance: PresenceService;
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): PresenceService {
    if (!PresenceService.instance) {
      PresenceService.instance = new PresenceService();
    }
    return PresenceService.instance;
  }

  /**
   * Update user presence for a project
   */
  async updatePresence(
    userId: string,
    projectId: string,
    data: PresenceUpdateData & { sessionId: string }
  ): Promise<UserPresence> {
    try {
      const query = `
        INSERT INTO user_presence (
          user_id,
          project_id,
          status,
          cursor_position,
          current_page,
          session_id,
          last_seen
        ) VALUES ($1, $2, $3, $4, $5, $6, now())
        ON CONFLICT (user_id, project_id, session_id)
        DO UPDATE SET
          status = EXCLUDED.status,
          cursor_position = EXCLUDED.cursor_position,
          current_page = EXCLUDED.current_page,
          last_seen = now(),
          updated_at = now()
        RETURNING *
      `;

      const values = [
        userId,
        projectId,
        data.status,
        data.cursorPosition ? JSON.stringify(data.cursorPosition) : null,
        data.currentPage,
        data.sessionId
      ];

      const result = await this.db.query(query, values);
      return this.mapPresenceFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error updating presence:', error);
      throw new Error('Failed to update presence');
    }
  }

  /**
   * Get all active collaborators for a project
   */
  async getProjectCollaborators(projectId: string): Promise<Collaborator[]> {
    try {
      const query = 'SELECT * FROM get_project_collaborators($1)';
      const result = await this.db.query(query, [projectId]);

      return result.rows.map(row => ({
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        avatarUrl: row.avatar_url,
        status: row.status,
        lastSeen: new Date(row.last_seen),
        cursorPosition: row.cursor_position,
        currentPage: row.current_page,
        sessionId: row.session_id
      }));
    } catch (error) {
      console.error('Error getting project collaborators:', error);
      throw new Error('Failed to get project collaborators');
    }
  }

  /**
   * Get user presence across all projects
   */
  async getUserPresence(userId: string): Promise<UserPresence[]> {
    try {
      const query = `
        SELECT * FROM user_presence
        WHERE user_id = $1
        AND status IN ('online', 'away')
        ORDER BY updated_at DESC
      `;

      const result = await this.db.query(query, [userId]);
      return result.rows.map(row => this.mapPresenceFromRow(row));
    } catch (error) {
      console.error('Error getting user presence:', error);
      throw new Error('Failed to get user presence');
    }
  }

  /**
   * Update heartbeat to keep user online
   */
  async updateHeartbeat(userId: string, projectId: string, sessionId: string): Promise<void> {
    try {
      const query = `
        UPDATE user_presence
        SET last_seen = now(), updated_at = now()
        WHERE user_id = $1 AND project_id = $2 AND session_id = $3
      `;

      await this.db.query(query, [userId, projectId, sessionId]);
    } catch (error) {
      console.error('Error updating heartbeat:', error);
      // Don't throw error for heartbeat failures
    }
  }

  /**
   * Set user status to offline
   */
  async setUserOffline(userId: string, projectId: string, sessionId: string): Promise<void> {
    try {
      const query = `
        UPDATE user_presence
        SET status = 'offline', updated_at = now()
        WHERE user_id = $1 AND project_id = $2 AND session_id = $3
      `;

      await this.db.query(query, [userId, projectId, sessionId]);
    } catch (error) {
      console.error('Error setting user offline:', error);
      throw new Error('Failed to set user offline');
    }
  }

  /**
   * Update cursor position for user
   */
  async updateCursorPosition(
    userId: string,
    projectId: string,
    sessionId: string,
    position: CursorPosition,
    currentPage?: string
  ): Promise<void> {
    try {
      const query = `
        UPDATE user_presence
        SET
          cursor_position = $4,
          current_page = $5,
          last_seen = now(),
          updated_at = now()
        WHERE user_id = $1 AND project_id = $2 AND session_id = $3
      `;

      const values = [
        userId,
        projectId,
        sessionId,
        JSON.stringify(position),
        currentPage
      ];

      await this.db.query(query, values);
    } catch (error) {
      console.error('Error updating cursor position:', error);
      // Don't throw error for cursor position failures
    }
  }

  /**
   * Get cursor positions for all users in a project
   */
  async getProjectCursors(projectId: string): Promise<{
    userId: string;
    sessionId: string;
    position: CursorPosition;
    currentPage?: string;
    userName: string;
    avatarUrl?: string;
  }[]> {
    try {
      const query = `
        SELECT
          up.user_id,
          up.session_id,
          up.cursor_position,
          up.current_page,
          u.first_name || ' ' || u.last_name as user_name,
          u.image_url as avatar_url
        FROM user_presence up
        JOIN users u ON up.user_id = u.id
        WHERE up.project_id = $1
        AND up.status = 'online'
        AND up.cursor_position IS NOT NULL
        ORDER BY up.updated_at DESC
      `;

      const result = await this.db.query(query, [projectId]);

      return result.rows.map(row => ({
        userId: row.user_id,
        sessionId: row.session_id,
        position: row.cursor_position,
        currentPage: row.current_page,
        userName: row.user_name,
        avatarUrl: row.avatar_url
      }));
    } catch (error) {
      console.error('Error getting project cursors:', error);
      throw new Error('Failed to get project cursors');
    }
  }

  /**
   * Clean up old presence records
   */
  async cleanupOldPresence(): Promise<void> {
    try {
      await this.db.query('SELECT cleanup_old_presence()');
    } catch (error) {
      console.error('Error cleaning up old presence:', error);
      // Don't throw error for cleanup failures
    }
  }

  /**
   * Get presence statistics for a project
   */
  async getPresenceStats(projectId: string): Promise<{
    totalCollaborators: number;
    onlineCount: number;
    awayCount: number;
    recentActivity: Date;
  }> {
    try {
      const query = `
        SELECT
          COUNT(*) as total_collaborators,
          COUNT(CASE WHEN status = 'online' THEN 1 END) as online_count,
          COUNT(CASE WHEN status = 'away' THEN 1 END) as away_count,
          MAX(updated_at) as recent_activity
        FROM user_presence
        WHERE project_id = $1
        AND status IN ('online', 'away')
      `;

      const result = await this.db.query(query, [projectId]);
      const row = result.rows[0];

      return {
        totalCollaborators: parseInt(row.total_collaborators, 10),
        onlineCount: parseInt(row.online_count, 10),
        awayCount: parseInt(row.away_count, 10),
        recentActivity: row.recent_activity ? new Date(row.recent_activity) : new Date()
      };
    } catch (error) {
      console.error('Error getting presence stats:', error);
      throw new Error('Failed to get presence stats');
    }
  }

  /**
   * Check if user is currently online in a project
   */
  async isUserOnlineInProject(userId: string, projectId: string): Promise<boolean> {
    try {
      const query = `
        SELECT COUNT(*) as count
        FROM user_presence
        WHERE user_id = $1 AND project_id = $2
        AND status = 'online'
        AND last_seen > now() - interval '${DEFAULT_PRESENCE_CONFIG.offlineThreshold / 1000} seconds'
      `;

      const result = await this.db.query(query, [userId, projectId]);
      return parseInt(result.rows[0].count, 10) > 0;
    } catch (error) {
      console.error('Error checking user online status:', error);
      return false;
    }
  }

  /**
   * Get user's current active projects
   */
  async getUserActiveProjects(userId: string): Promise<{
    projectId: string;
    projectName: string;
    status: PresenceStatus;
    lastSeen: Date;
  }[]> {
    try {
      const query = `
        SELECT
          up.project_id,
          p.name as project_name,
          up.status,
          up.last_seen
        FROM user_presence up
        JOIN projects p ON up.project_id = p.id
        WHERE up.user_id = $1
        AND up.status IN ('online', 'away')
        ORDER BY up.last_seen DESC
      `;

      const result = await this.db.query(query, [userId]);

      return result.rows.map(row => ({
        projectId: row.project_id,
        projectName: row.project_name,
        status: row.status,
        lastSeen: new Date(row.last_seen)
      }));
    } catch (error) {
      console.error('Error getting user active projects:', error);
      throw new Error('Failed to get user active projects');
    }
  }

  /**
   * Bulk update user status across all projects
   */
  async bulkUpdateUserStatus(userId: string, status: PresenceStatus): Promise<void> {
    try {
      const query = `
        UPDATE user_presence
        SET status = $2, updated_at = now()
        WHERE user_id = $1
      `;

      await this.db.query(query, [userId, status]);
    } catch (error) {
      console.error('Error bulk updating user status:', error);
      throw new Error('Failed to update user status');
    }
  }

  /**
   * Get collaborator suggestions for mentions
   */
  async getCollaboratorSuggestions(projectId: string, query?: string): Promise<{
    userId: string;
    userName: string;
    userEmail: string;
    avatarUrl?: string;
    isOnline: boolean;
  }[]> {
    try {
      let sql = `
        SELECT DISTINCT
          u.id as user_id,
          u.first_name || ' ' || u.last_name as user_name,
          u.email_addresses[1] as user_email,
          u.image_url as avatar_url,
          CASE WHEN up.status = 'online' THEN true ELSE false END as is_online
        FROM users u
        LEFT JOIN user_presence up ON u.id = up.user_id AND up.project_id = $1
        WHERE u.id IN (
          SELECT DISTINCT owner_id FROM projects WHERE id = $1
          UNION
          SELECT DISTINCT user_id FROM user_presence WHERE project_id = $1
        )
      `;

      const params = [projectId];

      if (query) {
        sql += ` AND (u.first_name ILIKE $2 OR u.last_name ILIKE $2 OR u.email_addresses[1] ILIKE $2)`;
        params.push(`%${query}%`);
      }

      sql += ` ORDER BY is_online DESC, user_name ASC LIMIT 10`;

      const result = await this.db.query(sql, params);

      return result.rows.map(row => ({
        userId: row.user_id,
        userName: row.user_name,
        userEmail: row.user_email,
        avatarUrl: row.avatar_url,
        isOnline: row.is_online
      }));
    } catch (error) {
      console.error('Error getting collaborator suggestions:', error);
      throw new Error('Failed to get collaborator suggestions');
    }
  }

  /**
   * Private helper methods
   */
  private mapPresenceFromRow(row: any): UserPresence {
    return {
      id: row.id,
      userId: row.user_id,
      projectId: row.project_id,
      status: row.status,
      lastSeen: new Date(row.last_seen),
      cursorPosition: row.cursor_position,
      currentPage: row.current_page,
      sessionId: row.session_id,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}