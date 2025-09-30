/**
 * Comments and Review System Tests
 *
 * Tests comment creation, threading, resolution, and review workflows
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { commentsManager } from '@/services/comments/manager';
import { prisma } from '@/lib/db';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    comment: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    review: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    reviewSubmission: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
    },
    workspaceMember: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock workspace manager
vi.mock('@/services/workspace/manager', () => ({
  workspaceManager: {
    checkAccess: vi.fn(),
    canEdit: vi.fn(),
  },
}));

// Mock activity logger
vi.mock('@/services/activity/logger', () => ({
  activityLogger: {
    logActivity: vi.fn(),
  },
}));

describe('Comments and Review System', () => {
  const mockProject = {
    id: 'project-1',
    workspaceId: 'workspace-1',
    name: 'Test Project',
  };

  const mockComment = {
    id: 'comment-1',
    projectId: 'project-1',
    userId: 'user-1',
    content: 'This is a test comment',
    filePath: '/src/components/Button.tsx',
    lineNumber: 42,
    isResolved: false,
    position: {
      type: 'line',
      line: 42,
      column: 15,
    },
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReview = {
    id: 'review-1',
    projectId: 'project-1',
    authorId: 'user-1',
    title: 'Code Review Request',
    description: 'Please review the new button component',
    status: 'pending',
    priority: 'medium',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock project access
    (prisma.project.findUnique as any).mockResolvedValue(mockProject);

    // Mock workspace access
    const { workspaceManager } = require('@/services/workspace/manager');
    workspaceManager.checkAccess.mockResolvedValue(true);
    workspaceManager.canEdit.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Comment Creation', () => {
    it('should create a line comment with valid input', async () => {
      const commentData = {
        projectId: 'project-1',
        userId: 'user-1',
        content: 'This looks good!',
        filePath: '/src/components/Button.tsx',
        lineNumber: 42,
      };

      (prisma.comment.create as any).mockResolvedValue({
        ...mockComment,
        ...commentData,
      });

      const result = await commentsManager.createComment(commentData);

      expect(result).toMatchObject({
        projectId: commentData.projectId,
        userId: commentData.userId,
        content: commentData.content,
        filePath: commentData.filePath,
        lineNumber: commentData.lineNumber,
      });

      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: commentData.projectId,
          userId: commentData.userId,
          content: commentData.content,
          filePath: commentData.filePath,
          lineNumber: commentData.lineNumber,
        }),
      });
    });

    it('should create a selection comment with position data', async () => {
      const commentData = {
        projectId: 'project-1',
        userId: 'user-1',
        content: 'Consider using a more descriptive variable name',
        filePath: '/src/utils/helpers.ts',
        startLine: 15,
        endLine: 17,
        position: {
          type: 'selection',
          startLine: 15,
          endLine: 17,
          startColumn: 5,
          endColumn: 20,
        },
      };

      (prisma.comment.create as any).mockResolvedValue({
        ...mockComment,
        ...commentData,
      });

      const result = await commentsManager.createComment(commentData);

      expect(result.position).toMatchObject({
        type: 'selection',
        startLine: 15,
        endLine: 17,
      });
    });

    it('should create a threaded reply comment', async () => {
      const parentComment = { ...mockComment, id: 'parent-comment' };
      const replyData = {
        projectId: 'project-1',
        userId: 'user-2',
        content: 'I agree with this suggestion',
        parentId: 'parent-comment',
      };

      (prisma.comment.findUnique as any).mockResolvedValue(parentComment);
      (prisma.comment.create as any).mockResolvedValue({
        ...mockComment,
        id: 'reply-comment',
        ...replyData,
      });

      const result = await commentsManager.createComment(replyData);

      expect(result.parentId).toBe('parent-comment');
      expect(prisma.comment.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          parentId: 'parent-comment',
        }),
      });
    });

    it('should reject empty comment content', async () => {
      const invalidData = {
        projectId: 'project-1',
        userId: 'user-1',
        content: '', // Empty content
      };

      await expect(commentsManager.createComment(invalidData))
        .rejects.toThrow('Comment content is required');
    });

    it('should validate project access before creating comment', async () => {
      const { workspaceManager } = require('@/services/workspace/manager');
      workspaceManager.checkAccess.mockRejectedValue(new Error('Access denied'));

      const commentData = {
        projectId: 'project-1',
        userId: 'unauthorized-user',
        content: 'This should fail',
      };

      await expect(commentsManager.createComment(commentData))
        .rejects.toThrow('Access denied');
    });
  });

  describe('Comment Management', () => {
    it('should update comment content', async () => {
      const updateData = {
        commentId: 'comment-1',
        userId: 'user-1',
        content: 'Updated comment content',
      };

      (prisma.comment.findUnique as any).mockResolvedValue({
        ...mockComment,
        userId: 'user-1', // Same user can edit
      });

      (prisma.comment.update as any).mockResolvedValue({
        ...mockComment,
        content: updateData.content,
        updatedAt: new Date(),
      });

      const result = await commentsManager.updateComment(updateData);

      expect(result.content).toBe(updateData.content);
      expect(prisma.comment.update).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
        data: { content: updateData.content },
      });
    });

    it('should prevent unauthorized comment updates', async () => {
      const updateData = {
        commentId: 'comment-1',
        userId: 'user-2', // Different user
        content: 'Unauthorized update',
      };

      (prisma.comment.findUnique as any).mockResolvedValue({
        ...mockComment,
        userId: 'user-1', // Original author
      });

      await expect(commentsManager.updateComment(updateData))
        .rejects.toThrow('Access denied');
    });

    it('should delete comment and its replies', async () => {
      (prisma.comment.findUnique as any).mockResolvedValue({
        ...mockComment,
        userId: 'user-1',
      });

      (prisma.comment.delete as any).mockResolvedValue({ id: 'comment-1' });

      await commentsManager.deleteComment('comment-1', 'user-1');

      expect(prisma.comment.delete).toHaveBeenCalledWith({
        where: { id: 'comment-1' },
      });
    });
  });

  describe('Comment Resolution', () => {
    it('should resolve comment with proper permissions', async () => {
      (prisma.comment.findUnique as any).mockResolvedValue({
        ...mockComment,
        isResolved: false,
      });

      (prisma.comment.update as any).mockResolvedValue({
        ...mockComment,
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: 'user-1',
      });

      const result = await commentsManager.resolveComment('comment-1', 'user-1');

      expect(result.isResolved).toBe(true);
      expect(result.resolvedBy).toBe('user-1');
    });

    it('should unresolve comment', async () => {
      (prisma.comment.findUnique as any).mockResolvedValue({
        ...mockComment,
        isResolved: true,
        resolvedBy: 'user-1',
      });

      (prisma.comment.update as any).mockResolvedValue({
        ...mockComment,
        isResolved: false,
        resolvedAt: null,
        resolvedBy: null,
      });

      const result = await commentsManager.unresolveComment('comment-1', 'user-1');

      expect(result.isResolved).toBe(false);
      expect(result.resolvedBy).toBeNull();
    });
  });

  describe('Comment Listing and Filtering', () => {
    it('should list comments with filters', async () => {
      const mockComments = [
        { ...mockComment, id: 'comment-1' },
        { ...mockComment, id: 'comment-2', isResolved: true },
      ];

      (prisma.comment.findMany as any).mockResolvedValue(mockComments);
      (prisma.comment.count as any).mockResolvedValue(2);

      const filter = {
        projectId: 'project-1',
        filePath: '/src/components/Button.tsx',
        isResolved: false,
        limit: 50,
        offset: 0,
      };

      const result = await commentsManager.listComments(filter);

      expect(result.comments).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(prisma.comment.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          projectId: 'project-1',
          filePath: '/src/components/Button.tsx',
          isResolved: false,
        }),
        include: expect.any(Object),
        orderBy: expect.any(Object),
        take: 50,
        skip: 0,
      });
    });

    it('should include comment replies in listing', async () => {
      const parentComment = { ...mockComment, id: 'parent-1' };
      const replyComment = {
        ...mockComment,
        id: 'reply-1',
        parentId: 'parent-1',
        content: 'This is a reply',
      };

      const mockCommentsWithReplies = [
        {
          ...parentComment,
          replies: [replyComment],
        },
      ];

      (prisma.comment.findMany as any).mockResolvedValue(mockCommentsWithReplies);
      (prisma.comment.count as any).mockResolvedValue(1);

      const result = await commentsManager.listComments({
        projectId: 'project-1',
        parentId: null, // Top-level comments only
      });

      expect(result.comments[0].replies).toHaveLength(1);
      expect(result.comments[0].replies[0].content).toBe('This is a reply');
    });
  });

  describe('Review System', () => {
    it('should create review request', async () => {
      const reviewData = {
        projectId: 'project-1',
        authorId: 'user-1',
        title: 'Review New Feature',
        description: 'Please review the authentication implementation',
        reviewerIds: ['user-2', 'user-3'],
        files: ['/src/auth/login.ts', '/src/auth/middleware.ts'],
        priority: 'high' as const,
      };

      (prisma.review.create as any).mockResolvedValue({
        ...mockReview,
        ...reviewData,
      });

      const result = await commentsManager.createReview(reviewData);

      expect(result).toMatchObject({
        projectId: reviewData.projectId,
        authorId: reviewData.authorId,
        title: reviewData.title,
        description: reviewData.description,
      });

      expect(prisma.review.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          projectId: reviewData.projectId,
          authorId: reviewData.authorId,
          title: reviewData.title,
          reviewerIds: reviewData.reviewerIds,
        }),
      });
    });

    it('should submit review with approval', async () => {
      (prisma.review.findUnique as any).mockResolvedValue({
        ...mockReview,
        reviewerIds: ['user-2', 'user-3'],
      });

      (prisma.reviewSubmission.findUnique as any).mockResolvedValue(null); // No existing submission

      (prisma.reviewSubmission.create as any).mockResolvedValue({
        id: 'submission-1',
        reviewId: 'review-1',
        reviewerId: 'user-2',
        status: 'approved',
        feedback: 'Looks good to me!',
        submittedAt: new Date(),
      });

      const result = await commentsManager.submitReview(
        'review-1',
        'user-2',
        'approved',
        'Looks good to me!'
      );

      expect(result.status).toBe('approved');
      expect(prisma.reviewSubmission.create).toHaveBeenCalledWith({
        data: {
          reviewId: 'review-1',
          reviewerId: 'user-2',
          status: 'approved',
          feedback: 'Looks good to me!',
        },
      });
    });

    it('should reject review submission from non-reviewer', async () => {
      (prisma.review.findUnique as any).mockResolvedValue({
        ...mockReview,
        reviewerIds: ['user-2', 'user-3'], // user-4 not in list
      });

      await expect(commentsManager.submitReview(
        'review-1',
        'user-4',
        'approved',
        'Unauthorized review'
      )).rejects.toThrow('not a reviewer');
    });

    it('should prevent duplicate review submissions', async () => {
      (prisma.review.findUnique as any).mockResolvedValue({
        ...mockReview,
        reviewerIds: ['user-2'],
      });

      (prisma.reviewSubmission.findUnique as any).mockResolvedValue({
        id: 'existing-submission',
        reviewerId: 'user-2',
        status: 'approved',
      });

      await expect(commentsManager.submitReview(
        'review-1',
        'user-2',
        'approved',
        'Second review'
      )).rejects.toThrow('already submitted');
    });
  });

  describe('Review Management', () => {
    it('should update review details', async () => {
      const updateData = {
        reviewId: 'review-1',
        userId: 'user-1', // Author
        title: 'Updated Review Title',
        description: 'Updated description',
        reviewerIds: ['user-2', 'user-3', 'user-4'],
      };

      (prisma.review.findUnique as any).mockResolvedValue({
        ...mockReview,
        authorId: 'user-1', // Same author
      });

      (prisma.review.update as any).mockResolvedValue({
        ...mockReview,
        title: updateData.title,
        description: updateData.description,
        reviewerIds: updateData.reviewerIds,
      });

      const result = await commentsManager.updateReview(updateData);

      expect(result.title).toBe(updateData.title);
      expect(result.reviewerIds).toEqual(updateData.reviewerIds);
    });

    it('should list reviews with filtering', async () => {
      const mockReviews = [
        { ...mockReview, id: 'review-1', status: 'pending' },
        { ...mockReview, id: 'review-2', status: 'approved' },
      ];

      (prisma.review.findMany as any).mockResolvedValue(mockReviews);
      (prisma.review.count as any).mockResolvedValue(2);

      const filter = {
        projectId: 'project-1',
        status: 'pending' as const,
        reviewerId: 'user-2',
        limit: 20,
        offset: 0,
      };

      const result = await commentsManager.listReviews(filter);

      expect(result.reviews).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(prisma.review.findMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          projectId: 'project-1',
          status: 'pending',
        }),
        include: expect.any(Object),
        orderBy: expect.any(Object),
        take: 20,
        skip: 0,
      });
    });
  });

  describe('Statistics and Analytics', () => {
    it('should get comment statistics for project', async () => {
      const mockStats = {
        totalComments: 25,
        resolvedComments: 15,
        unresolvedComments: 10,
        commentsByFile: [
          { filePath: '/src/components/Button.tsx', count: 8 },
          { filePath: '/src/utils/helpers.ts', count: 5 },
        ],
        commentsByUser: [
          { userId: 'user-1', count: 12 },
          { userId: 'user-2', count: 8 },
        ],
      };

      // Mock the database queries that would generate these stats
      (prisma.comment.count as any)
        .mockResolvedValueOnce(25) // total
        .mockResolvedValueOnce(15) // resolved
        .mockResolvedValueOnce(10); // unresolved

      const result = await commentsManager.getCommentStats('project-1');

      expect(result.totalComments).toBe(25);
      expect(result.resolvedComments).toBe(15);
      expect(result.unresolvedComments).toBe(10);
    });

    it('should get review statistics for project', async () => {
      const mockReviewStats = {
        totalReviews: 12,
        pendingReviews: 3,
        approvedReviews: 7,
        rejectedReviews: 2,
        averageReviewTime: 2.5, // days
      };

      (prisma.review.count as any)
        .mockResolvedValueOnce(12) // total
        .mockResolvedValueOnce(3)  // pending
        .mockResolvedValueOnce(7)  // approved
        .mockResolvedValueOnce(2); // rejected

      const result = await commentsManager.getReviewStats('project-1');

      expect(result.totalReviews).toBe(12);
      expect(result.pendingReviews).toBe(3);
      expect(result.approvedReviews).toBe(7);
      expect(result.rejectedReviews).toBe(2);
    });
  });
});