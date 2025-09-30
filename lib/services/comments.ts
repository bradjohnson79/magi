import { Database } from '@/lib/database';
import {
  Comment,
  CreateCommentRequest,
  UpdateCommentRequest,
  CommentMention,
  CommentThread
} from '@/lib/types/collaboration';

export class CommentsService {
  private static instance: CommentsService;
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): CommentsService {
    if (!CommentsService.instance) {
      CommentsService.instance = new CommentsService();
    }
    return CommentsService.instance;
  }

  /**
   * Create a new comment
   */
  async createComment(userId: string, data: CreateCommentRequest): Promise<Comment> {
    try {
      // Process content and extract mentions
      const { content, contentHtml, mentions } = this.processCommentContent(data.content);

      const query = `
        INSERT INTO comments (
          project_id,
          parent_id,
          author_id,
          content,
          content_html,
          mentions,
          position
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const values = [
        data.projectId,
        data.parentId || null,
        userId,
        content,
        contentHtml,
        JSON.stringify(mentions),
        data.position ? JSON.stringify(data.position) : null
      ];

      const result = await this.db.query(query, values);
      const comment = await this.getCommentById(result.rows[0].id);

      if (!comment) {
        throw new Error('Failed to retrieve created comment');
      }

      return comment;
    } catch (error) {
      console.error('Error creating comment:', error);
      throw new Error('Failed to create comment');
    }
  }

  /**
   * Get comment by ID with author details
   */
  async getCommentById(commentId: string): Promise<Comment | null> {
    try {
      const query = `
        SELECT
          c.*,
          u.first_name || ' ' || u.last_name as author_name,
          u.image_url as author_avatar
        FROM comments c
        JOIN users u ON c.author_id = u.id
        WHERE c.id = $1
      `;

      const result = await this.db.query(query, [commentId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapCommentFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error getting comment by ID:', error);
      throw new Error('Failed to get comment');
    }
  }

  /**
   * Get all comments for a project
   */
  async getProjectComments(
    projectId: string,
    options: {
      includeResolved?: boolean;
      parentId?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Comment[]> {
    try {
      let query = `
        SELECT
          c.*,
          u.first_name || ' ' || u.last_name as author_name,
          u.image_url as author_avatar,
          (SELECT COUNT(*)::integer FROM comments WHERE parent_id = c.id) as reply_count
        FROM comments c
        JOIN users u ON c.author_id = u.id
        WHERE c.project_id = $1
      `;

      const params = [projectId];
      let paramIndex = 2;

      if (options.parentId !== undefined) {
        query += ` AND c.parent_id ${options.parentId ? '= $' + paramIndex : 'IS NULL'}`;
        if (options.parentId) {
          params.push(options.parentId);
          paramIndex++;
        }
      }

      if (!options.includeResolved) {
        query += ` AND c.resolved = false`;
      }

      query += ` ORDER BY c.created_at ASC`;

      if (options.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(options.offset);
      }

      const result = await this.db.query(query, params);
      return result.rows.map(row => this.mapCommentFromRow(row));
    } catch (error) {
      console.error('Error getting project comments:', error);
      throw new Error('Failed to get project comments');
    }
  }

  /**
   * Get comment thread (root comment + all replies)
   */
  async getCommentThread(commentId: string): Promise<CommentThread> {
    try {
      const query = 'SELECT * FROM get_comment_thread($1)';
      const result = await this.db.query(query, [commentId]);

      if (result.rows.length === 0) {
        throw new Error('Comment thread not found');
      }

      const comments = result.rows.map(row => this.mapCommentFromRow(row));
      const rootComment = comments[0];
      const replies = comments.slice(1);

      return {
        rootComment,
        replies,
        totalReplies: replies.length,
        unresolvedCount: comments.filter(c => !c.resolved).length
      };
    } catch (error) {
      console.error('Error getting comment thread:', error);
      throw new Error('Failed to get comment thread');
    }
  }

  /**
   * Update comment content
   */
  async updateComment(
    commentId: string,
    userId: string,
    updates: UpdateCommentRequest
  ): Promise<Comment> {
    try {
      // Check if user is author
      const comment = await this.getCommentById(commentId);
      if (!comment) {
        throw new Error('Comment not found');
      }

      if (comment.authorId !== userId) {
        throw new Error('Only the author can edit this comment');
      }

      const setClause = [];
      const values = [];
      let paramIndex = 1;

      if (updates.content !== undefined) {
        const { content, contentHtml, mentions } = this.processCommentContent(updates.content);
        setClause.push(`content = $${paramIndex}`, `content_html = $${paramIndex + 1}`, `mentions = $${paramIndex + 2}`);
        values.push(content, contentHtml, JSON.stringify(mentions));
        paramIndex += 3;
      }

      if (updates.resolved !== undefined) {
        setClause.push(`resolved = $${paramIndex}`);
        values.push(updates.resolved);
        paramIndex++;

        if (updates.resolved) {
          setClause.push(`resolved_by = $${paramIndex}`, `resolved_at = now()`);
          values.push(userId);
          paramIndex++;
        } else {
          setClause.push(`resolved_by = NULL`, `resolved_at = NULL`);
        }
      }

      if (setClause.length === 0) {
        return comment;
      }

      setClause.push(`updated_at = now()`);

      const query = `
        UPDATE comments
        SET ${setClause.join(', ')}
        WHERE id = $${paramIndex}
        RETURNING *
      `;
      values.push(commentId);

      const result = await this.db.query(query, values);
      const updatedComment = await this.getCommentById(result.rows[0].id);

      if (!updatedComment) {
        throw new Error('Failed to retrieve updated comment');
      }

      return updatedComment;
    } catch (error) {
      console.error('Error updating comment:', error);
      throw new Error('Failed to update comment');
    }
  }

  /**
   * Resolve or unresolve a comment
   */
  async resolveComment(commentId: string, userId: string, resolved = true): Promise<Comment> {
    try {
      const query = `
        UPDATE comments
        SET
          resolved = $1,
          resolved_by = CASE WHEN $1 THEN $2 ELSE NULL END,
          resolved_at = CASE WHEN $1 THEN now() ELSE NULL END,
          updated_at = now()
        WHERE id = $3
        RETURNING *
      `;

      await this.db.query(query, [resolved, userId, commentId]);
      const comment = await this.getCommentById(commentId);

      if (!comment) {
        throw new Error('Failed to retrieve resolved comment');
      }

      return comment;
    } catch (error) {
      console.error('Error resolving comment:', error);
      throw new Error('Failed to resolve comment');
    }
  }

  /**
   * Delete a comment
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    try {
      // Check if user is author or has permission
      const comment = await this.getCommentById(commentId);
      if (!comment) {
        throw new Error('Comment not found');
      }

      if (comment.authorId !== userId) {
        throw new Error('Only the author can delete this comment');
      }

      // Delete the comment and all its replies
      const query = `
        WITH RECURSIVE comment_tree AS (
          SELECT id FROM comments WHERE id = $1
          UNION ALL
          SELECT c.id FROM comments c
          JOIN comment_tree ct ON c.parent_id = ct.id
        )
        DELETE FROM comments WHERE id IN (SELECT id FROM comment_tree)
      `;

      await this.db.query(query, [commentId]);
    } catch (error) {
      console.error('Error deleting comment:', error);
      throw new Error('Failed to delete comment');
    }
  }

  /**
   * Get comments with mentions for a user
   */
  async getUserMentions(
    userId: string,
    options: {
      projectId?: string;
      unreadOnly?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Comment[]> {
    try {
      let query = `
        SELECT
          c.*,
          u.first_name || ' ' || u.last_name as author_name,
          u.image_url as author_avatar,
          (SELECT COUNT(*)::integer FROM comments WHERE parent_id = c.id) as reply_count
        FROM comments c
        JOIN users u ON c.author_id = u.id
        WHERE c.mentions @> $1
      `;

      const params = [JSON.stringify([{ userId }])];
      let paramIndex = 2;

      if (options.projectId) {
        query += ` AND c.project_id = $${paramIndex}`;
        params.push(options.projectId);
        paramIndex++;
      }

      if (options.unreadOnly) {
        // Add logic to check if user has read the comment
        // This would require a separate read_status table
      }

      query += ` ORDER BY c.created_at DESC`;

      if (options.limit) {
        query += ` LIMIT $${paramIndex}`;
        params.push(options.limit);
        paramIndex++;
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex}`;
        params.push(options.offset);
      }

      const result = await this.db.query(query, params);
      return result.rows.map(row => this.mapCommentFromRow(row));
    } catch (error) {
      console.error('Error getting user mentions:', error);
      throw new Error('Failed to get user mentions');
    }
  }

  /**
   * Get comment statistics for a project
   */
  async getCommentStats(projectId: string): Promise<{
    totalComments: number;
    unresolvedComments: number;
    activeThreads: number;
    recentComments: number;
  }> {
    try {
      const query = `
        SELECT
          COUNT(*) as total_comments,
          COUNT(CASE WHEN resolved = false THEN 1 END) as unresolved_comments,
          COUNT(CASE WHEN parent_id IS NULL THEN 1 END) as active_threads,
          COUNT(CASE WHEN created_at > now() - interval '24 hours' THEN 1 END) as recent_comments
        FROM comments
        WHERE project_id = $1
      `;

      const result = await this.db.query(query, [projectId]);
      const row = result.rows[0];

      return {
        totalComments: parseInt(row.total_comments, 10),
        unresolvedComments: parseInt(row.unresolved_comments, 10),
        activeThreads: parseInt(row.active_threads, 10),
        recentComments: parseInt(row.recent_comments, 10)
      };
    } catch (error) {
      console.error('Error getting comment stats:', error);
      throw new Error('Failed to get comment stats');
    }
  }

  /**
   * Process comment content to extract mentions and generate HTML
   */
  private processCommentContent(content: string): {
    content: string;
    contentHtml: string;
    mentions: CommentMention[];
  } {
    const mentions: CommentMention[] = [];

    // Simple mention detection: @[username](userId)
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    let match;
    let processedContent = content;
    let htmlContent = content;

    while ((match = mentionRegex.exec(content)) !== null) {
      const [fullMatch, userName, userId] = match;

      mentions.push({
        userId,
        userName,
        startIndex: match.index,
        length: fullMatch.length
      });

      // Replace in HTML with styled mention
      htmlContent = htmlContent.replace(
        fullMatch,
        `<span class="mention" data-user-id="${userId}">@${userName}</span>`
      );
    }

    // Simple HTML processing (escape other HTML, preserve line breaks)
    htmlContent = htmlContent
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>');

    // Re-apply mention HTML
    mentions.forEach(mention => {
      htmlContent = htmlContent.replace(
        new RegExp(`@\\[${mention.userName}\\]\\(${mention.userId}\\)`, 'g'),
        `<span class="mention" data-user-id="${mention.userId}">@${mention.userName}</span>`
      );
    });

    return {
      content: processedContent,
      contentHtml: htmlContent,
      mentions
    };
  }

  /**
   * Private helper methods
   */
  private mapCommentFromRow(row: any): Comment {
    return {
      id: row.id || row.comment_id,
      projectId: row.project_id,
      parentId: row.parent_id,
      authorId: row.author_id,
      authorName: row.author_name,
      authorAvatar: row.author_avatar,
      content: row.content,
      contentHtml: row.content_html,
      mentions: row.mentions || [],
      position: row.position,
      resolved: row.resolved,
      resolvedBy: row.resolved_by,
      resolvedAt: row.resolved_at ? new Date(row.resolved_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      replyCount: row.reply_count || 0
    };
  }
}