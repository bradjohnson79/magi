/**
 * Comments and Review Management Service
 *
 * Handles inline comments, code reviews, and collaborative discussions
 * with notification support and real-time updates.
 */

import { prisma } from '@/lib/prisma';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { activityLogger } from '@/services/activity/logger';
import { workspaceManager } from '@/services/workspace/manager';

export interface CommentCreateInput {
  projectId: string;
  userId: string;
  content: string;
  filePath?: string;
  lineNumber?: number;
  startLine?: number;
  endLine?: number;
  position?: CommentPosition;
  parentId?: string;
}

export interface CommentPosition {
  type: 'line' | 'selection' | 'file' | 'ui-element';
  coordinates?: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  selector?: string; // CSS selector for UI elements
  context?: string; // Additional context information
}

export interface CommentUpdateInput {
  content?: string;
  isResolved?: boolean;
  resolvedBy?: string;
}

export interface CommentFilter {
  projectId?: string;
  userId?: string;
  filePath?: string;
  isResolved?: boolean;
  parentId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export interface ReviewRequest {
  projectId: string;
  requestedBy: string;
  reviewers: string[];
  title: string;
  description?: string;
  files?: string[];
  deadline?: Date;
  priority: 'low' | 'medium' | 'high';
}

export interface ReviewResponse {
  reviewId: string;
  reviewerId: string;
  status: 'approved' | 'changes_requested' | 'commented';
  summary?: string;
  comments: string[];
}

export class CommentsManager {
  private static instance: CommentsManager;

  public static getInstance(): CommentsManager {
    if (!CommentsManager.instance) {
      CommentsManager.instance = new CommentsManager();
    }
    return CommentsManager.instance;
  }

  /**
   * Create a new comment
   */
  async createComment(input: CommentCreateInput): Promise<any> {
    return withSpan('comment.create', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_create',
          [SPAN_ATTRIBUTES.USER_ID]: input.userId,
          [SPAN_ATTRIBUTES.PROJECT_ID]: input.projectId,
          'comment.file_path': input.filePath || 'none',
          'comment.line_number': input.lineNumber || 0,
          'comment.is_reply': input.parentId ? true : false,
        });

        // Validate project access
        const project = await prisma.project.findUnique({
          where: { id: input.projectId },
          select: { workspaceId: true },
        });

        if (!project) {
          throw new Error('Project not found');
        }

        if (project.workspaceId) {
          await workspaceManager.validateMemberAccess(project.workspaceId, input.userId);
        }

        // Create comment
        const comment = await prisma.comment.create({
          data: {
            projectId: input.projectId,
            userId: input.userId,
            content: input.content,
            filePath: input.filePath,
            lineNumber: input.lineNumber,
            startLine: input.startLine,
            endLine: input.endLine,
            position: input.position || {},
            parentId: input.parentId,
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            parent: {
              select: {
                id: true,
                userId: true,
                content: true,
              },
            },
            replies: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        });

        // Log activity
        await activityLogger.logActivity({
          workspaceId: project.workspaceId,
          projectId: input.projectId,
          userId: input.userId,
          action: input.parentId ? 'comment.replied' : 'comment.created',
          target: 'comment',
          targetId: comment.id,
          metadata: {
            filePath: input.filePath,
            lineNumber: input.lineNumber,
            parentCommentId: input.parentId,
            contentLength: input.content.length,
          },
        });

        // Send notifications
        await this.sendCommentNotifications(comment, 'created');

        addSpanAttributes(span, {
          'comment.id': comment.id,
          'comment.replies_count': comment.replies.length,
        });

        return comment;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get comment by ID
   */
  async getComment(commentId: string, userId: string): Promise<any> {
    return withSpan('comment.get', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_get',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'comment.id': commentId,
        });

        const comment = await prisma.comment.findUnique({
          where: { id: commentId },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            parent: {
              select: {
                id: true,
                userId: true,
                content: true,
              },
            },
            replies: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
            project: {
              select: {
                id: true,
                workspaceId: true,
              },
            },
          },
        });

        if (!comment) {
          throw new Error('Comment not found');
        }

        // Validate access
        if (comment.project.workspaceId) {
          await workspaceManager.validateMemberAccess(comment.project.workspaceId, userId);
        }

        return comment;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Update comment
   */
  async updateComment(
    commentId: string,
    userId: string,
    updates: CommentUpdateInput
  ): Promise<any> {
    return withSpan('comment.update', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_update',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'comment.id': commentId,
          'update.is_resolved': updates.isResolved || false,
        });

        // Get existing comment
        const existingComment = await this.getComment(commentId, userId);

        // Check permissions
        const canEdit = existingComment.userId === userId;
        const canResolve = canEdit || updates.isResolved !== undefined;

        if (!canEdit && updates.content) {
          throw new Error('Permission denied: Can only edit your own comments');
        }

        if (!canResolve && updates.isResolved !== undefined) {
          // Check workspace permissions for resolving others' comments
          if (existingComment.project.workspaceId) {
            await workspaceManager.validatePermission(
              existingComment.project.workspaceId,
              userId,
              'canResolveComments'
            );
          }
        }

        // Prepare update data
        const updateData: any = {};
        if (updates.content !== undefined) updateData.content = updates.content;
        if (updates.isResolved !== undefined) {
          updateData.isResolved = updates.isResolved;
          updateData.resolvedBy = updates.isResolved ? (updates.resolvedBy || userId) : null;
          updateData.resolvedAt = updates.isResolved ? new Date() : null;
        }

        const comment = await prisma.comment.update({
          where: { id: commentId },
          data: updateData,
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            replies: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'asc',
              },
            },
          },
        });

        // Log activity
        const action = updates.isResolved ? 'comment.resolved' : 'comment.updated';
        await activityLogger.logActivity({
          workspaceId: existingComment.project.workspaceId,
          projectId: existingComment.projectId,
          userId,
          action,
          target: 'comment',
          targetId: commentId,
          metadata: {
            changes: updates,
            resolvedBy: updates.resolvedBy,
          },
        });

        // Send notifications
        if (updates.isResolved) {
          await this.sendCommentNotifications(comment, 'resolved');
        } else if (updates.content) {
          await this.sendCommentNotifications(comment, 'updated');
        }

        return comment;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Delete comment
   */
  async deleteComment(commentId: string, userId: string): Promise<void> {
    return withSpan('comment.delete', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_delete',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'comment.id': commentId,
        });

        // Get comment for permission check
        const comment = await this.getComment(commentId, userId);

        // Check permissions - can only delete own comments
        if (comment.userId !== userId) {
          throw new Error('Permission denied: Can only delete your own comments');
        }

        await prisma.comment.delete({
          where: { id: commentId },
        });

        // Log activity
        await activityLogger.logActivity({
          workspaceId: comment.project.workspaceId,
          projectId: comment.projectId,
          userId,
          action: 'comment.deleted',
          target: 'comment',
          targetId: commentId,
          metadata: {
            filePath: comment.filePath,
            lineNumber: comment.lineNumber,
          },
        });
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * List comments with filtering
   */
  async listComments(filter: CommentFilter): Promise<{
    comments: any[];
    total: number;
    hasMore: boolean;
  }> {
    return withSpan('comment.list', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_list',
          [SPAN_ATTRIBUTES.PROJECT_ID]: filter.projectId || 'none',
          'filter.file_path': filter.filePath || 'all',
          'filter.is_resolved': filter.isResolved?.toString() || 'all',
        });

        const where: any = {};

        if (filter.projectId) {
          where.projectId = filter.projectId;
        }

        if (filter.userId) {
          where.userId = filter.userId;
        }

        if (filter.filePath) {
          where.filePath = filter.filePath;
        }

        if (filter.isResolved !== undefined) {
          where.isResolved = filter.isResolved;
        }

        if (filter.parentId !== undefined) {
          where.parentId = filter.parentId;
        }

        if (filter.dateFrom || filter.dateTo) {
          where.createdAt = {};
          if (filter.dateFrom) where.createdAt.gte = filter.dateFrom;
          if (filter.dateTo) where.createdAt.lte = filter.dateTo;
        }

        const limit = filter.limit || 50;
        const offset = filter.offset || 0;

        const [comments, total] = await Promise.all([
          prisma.comment.findMany({
            where,
            include: {
              user: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
              replies: {
                include: {
                  user: {
                    select: {
                      id: true,
                      name: true,
                      email: true,
                    },
                  },
                },
                orderBy: {
                  createdAt: 'asc',
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
            take: limit,
            skip: offset,
          }),
          prisma.comment.count({ where }),
        ]);

        return {
          comments,
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
   * Get comments for a specific file
   */
  async getFileComments(
    projectId: string,
    filePath: string,
    userId: string
  ): Promise<any[]> {
    const result = await this.listComments({
      projectId,
      filePath,
      parentId: null, // Only root comments
    });

    return result.comments;
  }

  /**
   * Create review request
   */
  async createReviewRequest(request: ReviewRequest): Promise<any> {
    return withSpan('review.create_request', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'review_request_create',
          [SPAN_ATTRIBUTES.USER_ID]: request.requestedBy,
          [SPAN_ATTRIBUTES.PROJECT_ID]: request.projectId,
          'review.reviewers_count': request.reviewers.length,
          'review.priority': request.priority,
        });

        // This would create a review request in the database
        // For now, we'll just log the activity and send notifications

        // Log activity
        await activityLogger.logActivity({
          projectId: request.projectId,
          userId: request.requestedBy,
          action: 'review.requested',
          target: 'project',
          targetId: request.projectId,
          metadata: {
            title: request.title,
            reviewers: request.reviewers,
            files: request.files,
            priority: request.priority,
            deadline: request.deadline?.toISOString(),
          },
        });

        // Send notifications to reviewers
        await this.sendReviewNotifications(request);

        return {
          id: `review-${Date.now()}`,
          ...request,
          status: 'pending',
          createdAt: new Date(),
        };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Submit review response
   */
  async submitReview(response: ReviewResponse): Promise<any> {
    return withSpan('review.submit', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'review_submit',
          [SPAN_ATTRIBUTES.USER_ID]: response.reviewerId,
          'review.id': response.reviewId,
          'review.status': response.status,
        });

        // This would update the review in the database
        // For now, we'll just log the activity

        // Log activity
        await activityLogger.logActivity({
          userId: response.reviewerId,
          action: `review.${response.status}`,
          target: 'review',
          targetId: response.reviewId,
          metadata: {
            status: response.status,
            summary: response.summary,
            commentsCount: response.comments.length,
          },
        });

        return {
          ...response,
          submittedAt: new Date(),
        };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get comment statistics
   */
  async getCommentStats(
    projectId: string,
    userId?: string,
    days = 30
  ): Promise<{
    totalComments: number;
    resolvedComments: number;
    unresolvedComments: number;
    commentsByFile: Array<{ filePath: string; count: number }>;
    recentActivity: number;
  }> {
    return withSpan('comment.stats', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'comment_stats',
          [SPAN_ATTRIBUTES.PROJECT_ID]: projectId,
          'stats.days': days,
        });

        const dateFrom = new Date();
        dateFrom.setDate(dateFrom.getDate() - days);

        const where: any = { projectId };
        if (userId) where.userId = userId;

        const [totalComments, resolvedComments, recentComments, commentsByFile] = await Promise.all([
          prisma.comment.count({ where }),
          prisma.comment.count({ where: { ...where, isResolved: true } }),
          prisma.comment.count({ where: { ...where, createdAt: { gte: dateFrom } } }),
          prisma.comment.groupBy({
            by: ['filePath'],
            where: { ...where, filePath: { not: null } },
            _count: true,
            orderBy: {
              _count: {
                filePath: 'desc',
              },
            },
            take: 10,
          }),
        ]);

        const unresolvedComments = totalComments - resolvedComments;

        return {
          totalComments,
          resolvedComments,
          unresolvedComments,
          commentsByFile: commentsByFile.map(item => ({
            filePath: item.filePath!,
            count: item._count,
          })),
          recentActivity: recentComments,
        };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Send comment notifications
   */
  private async sendCommentNotifications(comment: any, action: string): Promise<void> {
    try {
      // This would integrate with your notification system
      // For now, we'll just log the notification

      const notificationTargets = new Set<string>();

      // Notify comment author (if not the actor)
      if (comment.parent && comment.parent.userId !== comment.userId) {
        notificationTargets.add(comment.parent.userId);
      }

      // Notify all participants in the thread
      comment.replies?.forEach((reply: any) => {
        if (reply.userId !== comment.userId) {
          notificationTargets.add(reply.userId);
        }
      });

      console.log(`Would send ${action} notification for comment ${comment.id} to:`, Array.from(notificationTargets));
    } catch (error) {
      console.warn('Failed to send comment notifications:', error);
    }
  }

  /**
   * Send review notifications
   */
  private async sendReviewNotifications(request: ReviewRequest): Promise<void> {
    try {
      // This would send notifications to reviewers
      console.log(`Would send review request notifications for project ${request.projectId} to:`, request.reviewers);
    } catch (error) {
      console.warn('Failed to send review notifications:', error);
    }
  }
}

export const commentsManager = CommentsManager.getInstance();