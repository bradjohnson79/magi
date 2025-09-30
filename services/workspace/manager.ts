/**
 * Workspace Management Service
 *
 * Handles workspace creation, member management, and permission enforcement
 * for real-time collaboration features in Magi.
 */

import { prisma } from '@/lib/prisma';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { auditLogger } from '@/services/audit/logger';
import { nanoid } from 'nanoid';

export interface WorkspaceCreateInput {
  name: string;
  description?: string;
  slug?: string;
  isPublic?: boolean;
  settings?: Record<string, any>;
  ownerId: string;
}

export interface WorkspaceMemberInvite {
  workspaceId: string;
  email: string;
  role: WorkspaceRole;
  permissions?: WorkspacePermissions;
  invitedBy: string;
}

export enum WorkspaceRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
}

export interface WorkspacePermissions {
  canCreateProjects: boolean;
  canDeleteProjects: boolean;
  canInviteMembers: boolean;
  canManageMembers: boolean;
  canEditSettings: boolean;
  canViewActivity: boolean;
  canComment: boolean;
  canResolveComments: boolean;
  canCreateBranches: boolean;
  canMergeBranches: boolean;
}

const DEFAULT_PERMISSIONS: Record<WorkspaceRole, WorkspacePermissions> = {
  [WorkspaceRole.OWNER]: {
    canCreateProjects: true,
    canDeleteProjects: true,
    canInviteMembers: true,
    canManageMembers: true,
    canEditSettings: true,
    canViewActivity: true,
    canComment: true,
    canResolveComments: true,
    canCreateBranches: true,
    canMergeBranches: true,
  },
  [WorkspaceRole.ADMIN]: {
    canCreateProjects: true,
    canDeleteProjects: true,
    canInviteMembers: true,
    canManageMembers: true,
    canEditSettings: false,
    canViewActivity: true,
    canComment: true,
    canResolveComments: true,
    canCreateBranches: true,
    canMergeBranches: true,
  },
  [WorkspaceRole.EDITOR]: {
    canCreateProjects: true,
    canDeleteProjects: false,
    canInviteMembers: false,
    canManageMembers: false,
    canEditSettings: false,
    canViewActivity: true,
    canComment: true,
    canResolveComments: false,
    canCreateBranches: true,
    canMergeBranches: false,
  },
  [WorkspaceRole.VIEWER]: {
    canCreateProjects: false,
    canDeleteProjects: false,
    canInviteMembers: false,
    canManageMembers: false,
    canEditSettings: false,
    canViewActivity: true,
    canComment: true,
    canResolveComments: false,
    canCreateBranches: false,
    canMergeBranches: false,
  },
};

export class WorkspaceManager {
  private static instance: WorkspaceManager;

  public static getInstance(): WorkspaceManager {
    if (!WorkspaceManager.instance) {
      WorkspaceManager.instance = new WorkspaceManager();
    }
    return WorkspaceManager.instance;
  }

  /**
   * Create a new workspace
   */
  async createWorkspace(input: WorkspaceCreateInput): Promise<any> {
    return withSpan('workspace.create', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_create',
          [SPAN_ATTRIBUTES.USER_ID]: input.ownerId,
          'workspace.name': input.name,
          'workspace.is_public': input.isPublic || false,
        });

        // Generate slug if not provided
        const slug = input.slug || this.generateSlug(input.name);

        // Validate slug uniqueness
        await this.validateSlugUniqueness(slug);

        // Create workspace
        const workspace = await prisma.workspace.create({
          data: {
            name: input.name,
            description: input.description,
            slug,
            ownerId: input.ownerId,
            isPublic: input.isPublic || false,
            settings: input.settings || {},
          },
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        // Add owner as member
        await prisma.workspaceMember.create({
          data: {
            workspaceId: workspace.id,
            userId: input.ownerId,
            role: WorkspaceRole.OWNER,
            permissions: DEFAULT_PERMISSIONS[WorkspaceRole.OWNER],
            joinedAt: new Date(),
          },
        });

        // Log activity
        await this.logActivity({
          workspaceId: workspace.id,
          userId: input.ownerId,
          action: 'workspace.created',
          target: 'workspace',
          targetId: workspace.id,
          metadata: {
            workspaceName: workspace.name,
            isPublic: workspace.isPublic,
          },
        });

        // Audit log
        await auditLogger.log({
          userId: input.ownerId,
          action: 'workspace.created',
          resource: 'workspace',
          resourceId: workspace.id,
          details: {
            name: workspace.name,
            slug: workspace.slug,
            isPublic: workspace.isPublic,
          },
          severity: 'info',
          outcome: 'success',
        });

        return workspace;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get workspace with member information
   */
  async getWorkspace(workspaceId: string, userId: string): Promise<any> {
    return withSpan('workspace.get', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_get',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'workspace.id': workspaceId,
        });

        // Check access
        await this.validateMemberAccess(workspaceId, userId);

        const workspace = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
            members: {
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
                joinedAt: 'asc',
              },
            },
            projects: {
              select: {
                id: true,
                name: true,
                category: true,
                status: true,
                createdAt: true,
                updatedAt: true,
              },
              orderBy: {
                updatedAt: 'desc',
              },
            },
            _count: {
              select: {
                members: true,
                projects: true,
              },
            },
          },
        });

        if (!workspace) {
          throw new Error('Workspace not found');
        }

        return workspace;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Update workspace
   */
  async updateWorkspace(
    workspaceId: string,
    userId: string,
    updates: Partial<WorkspaceCreateInput>
  ): Promise<any> {
    return withSpan('workspace.update', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_update',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'workspace.id': workspaceId,
        });

        // Check permissions
        await this.validatePermission(workspaceId, userId, 'canEditSettings');

        // Validate slug if being updated
        if (updates.slug) {
          await this.validateSlugUniqueness(updates.slug, workspaceId);
        }

        const workspace = await prisma.workspace.update({
          where: { id: workspaceId },
          data: {
            ...(updates.name && { name: updates.name }),
            ...(updates.description !== undefined && { description: updates.description }),
            ...(updates.slug && { slug: updates.slug }),
            ...(updates.isPublic !== undefined && { isPublic: updates.isPublic }),
            ...(updates.settings && { settings: updates.settings }),
          },
          include: {
            owner: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        // Log activity
        await this.logActivity({
          workspaceId,
          userId,
          action: 'workspace.updated',
          target: 'workspace',
          targetId: workspaceId,
          metadata: {
            changes: updates,
          },
        });

        return workspace;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Delete workspace
   */
  async deleteWorkspace(workspaceId: string, userId: string): Promise<void> {
    return withSpan('workspace.delete', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_delete',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'workspace.id': workspaceId,
        });

        // Check ownership
        const workspace = await prisma.workspace.findUnique({
          where: { id: workspaceId },
          select: { ownerId: true, name: true },
        });

        if (!workspace) {
          throw new Error('Workspace not found');
        }

        if (workspace.ownerId !== userId) {
          throw new Error('Only workspace owner can delete workspace');
        }

        // Delete workspace (cascade will handle members, projects, etc.)
        await prisma.workspace.delete({
          where: { id: workspaceId },
        });

        // Audit log
        await auditLogger.log({
          userId,
          action: 'workspace.deleted',
          resource: 'workspace',
          resourceId: workspaceId,
          details: {
            name: workspace.name,
          },
          severity: 'info',
          outcome: 'success',
        });
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Invite member to workspace
   */
  async inviteMember(invite: WorkspaceMemberInvite): Promise<any> {
    return withSpan('workspace.invite_member', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_invite_member',
          [SPAN_ATTRIBUTES.USER_ID]: invite.invitedBy,
          'workspace.id': invite.workspaceId,
          'invite.email': invite.email,
          'invite.role': invite.role,
        });

        // Check permissions
        await this.validatePermission(invite.workspaceId, invite.invitedBy, 'canInviteMembers');

        // Find user by email
        const user = await prisma.user.findUnique({
          where: { email: invite.email },
        });

        if (!user) {
          throw new Error('User not found');
        }

        // Check if already a member
        const existingMember = await prisma.workspaceMember.findUnique({
          where: {
            workspaceId_userId: {
              workspaceId: invite.workspaceId,
              userId: user.id,
            },
          },
        });

        if (existingMember) {
          throw new Error('User is already a member of this workspace');
        }

        // Create member
        const member = await prisma.workspaceMember.create({
          data: {
            workspaceId: invite.workspaceId,
            userId: user.id,
            role: invite.role,
            permissions: invite.permissions || DEFAULT_PERMISSIONS[invite.role],
            invitedBy: invite.invitedBy,
            invitedAt: new Date(),
            joinedAt: new Date(),
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        // Log activity
        await this.logActivity({
          workspaceId: invite.workspaceId,
          userId: invite.invitedBy,
          action: 'member.invited',
          target: 'user',
          targetId: user.id,
          metadata: {
            email: invite.email,
            role: invite.role,
          },
        });

        return member;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Update member role/permissions
   */
  async updateMember(
    workspaceId: string,
    memberId: string,
    userId: string,
    updates: { role?: WorkspaceRole; permissions?: WorkspacePermissions }
  ): Promise<any> {
    return withSpan('workspace.update_member', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_update_member',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'workspace.id': workspaceId,
          'member.id': memberId,
        });

        // Check permissions
        await this.validatePermission(workspaceId, userId, 'canManageMembers');

        const member = await prisma.workspaceMember.update({
          where: { id: memberId },
          data: {
            ...(updates.role && { role: updates.role }),
            ...(updates.permissions && { permissions: updates.permissions }),
          },
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        // Log activity
        await this.logActivity({
          workspaceId,
          userId,
          action: 'member.updated',
          target: 'user',
          targetId: member.userId,
          metadata: {
            changes: updates,
          },
        });

        return member;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Remove member from workspace
   */
  async removeMember(workspaceId: string, memberId: string, userId: string): Promise<void> {
    return withSpan('workspace.remove_member', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_remove_member',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'workspace.id': workspaceId,
          'member.id': memberId,
        });

        // Check permissions
        await this.validatePermission(workspaceId, userId, 'canManageMembers');

        // Get member info before deletion
        const member = await prisma.workspaceMember.findUnique({
          where: { id: memberId },
          include: {
            user: {
              select: {
                id: true,
                email: true,
              },
            },
          },
        });

        if (!member) {
          throw new Error('Member not found');
        }

        // Cannot remove workspace owner
        if (member.role === WorkspaceRole.OWNER) {
          throw new Error('Cannot remove workspace owner');
        }

        await prisma.workspaceMember.delete({
          where: { id: memberId },
        });

        // Log activity
        await this.logActivity({
          workspaceId,
          userId,
          action: 'member.removed',
          target: 'user',
          targetId: member.userId,
          metadata: {
            email: member.user.email,
            role: member.role,
          },
        });
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get user workspaces
   */
  async getUserWorkspaces(userId: string): Promise<any[]> {
    return withSpan('workspace.get_user_workspaces', async () => {
      return await prisma.workspace.findMany({
        where: {
          OR: [
            { ownerId: userId },
            {
              members: {
                some: {
                  userId,
                },
              },
            },
          ],
        },
        include: {
          owner: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          members: {
            where: { userId },
            select: {
              role: true,
              permissions: true,
            },
          },
          _count: {
            select: {
              members: true,
              projects: true,
            },
          },
        },
        orderBy: {
          updatedAt: 'desc',
        },
      });
    });
  }

  /**
   * Validate workspace member access
   */
  async validateMemberAccess(workspaceId: string, userId: string): Promise<any> {
    const member = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId,
        },
      },
      include: {
        workspace: {
          select: {
            ownerId: true,
            isPublic: true,
          },
        },
      },
    });

    if (!member && !member?.workspace.isPublic) {
      throw new Error('Access denied: Not a member of this workspace');
    }

    return member;
  }

  /**
   * Validate specific permission
   */
  async validatePermission(
    workspaceId: string,
    userId: string,
    permission: keyof WorkspacePermissions
  ): Promise<void> {
    const member = await this.validateMemberAccess(workspaceId, userId);

    if (!member) {
      throw new Error('Access denied');
    }

    const permissions = member.permissions as WorkspacePermissions;

    if (!permissions[permission]) {
      throw new Error(`Permission denied: ${permission}`);
    }
  }

  /**
   * Helper methods
   */
  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50) + '-' + nanoid(8);
  }

  private async validateSlugUniqueness(slug: string, excludeId?: string): Promise<void> {
    const existing = await prisma.workspace.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (existing && existing.id !== excludeId) {
      throw new Error('Workspace slug already exists');
    }
  }

  private async logActivity(data: {
    workspaceId: string;
    userId: string;
    action: string;
    target?: string;
    targetId?: string;
    metadata?: any;
  }): Promise<void> {
    try {
      await prisma.activityLog.create({
        data: {
          workspaceId: data.workspaceId,
          userId: data.userId,
          action: data.action,
          target: data.target,
          targetId: data.targetId,
          metadata: data.metadata || {},
        },
      });
    } catch (error) {
      console.warn('Failed to log activity:', error);
    }
  }
}

export const workspaceManager = WorkspaceManager.getInstance();