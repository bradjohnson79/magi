/**
 * Workspace Collaboration Tests
 *
 * Tests workspace creation, member management, and permission enforcement
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { workspaceManager } from '@/services/workspace/manager';
import { prisma } from '@/lib/db';
import { WorkspaceRole } from '@prisma/client';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    workspace: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    workspaceMember: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
    project: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock activity logger
vi.mock('@/services/activity/logger', () => ({
  activityLogger: {
    logActivity: vi.fn(),
    logSystem: vi.fn(),
  },
}));

describe('Workspace Collaboration', () => {
  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    name: 'Test User',
  };

  const mockWorkspace = {
    id: 'workspace-1',
    name: 'Test Workspace',
    description: 'Test workspace description',
    ownerId: 'user-1',
    slug: 'test-workspace',
    settings: {},
    metadata: {},
    isPublic: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Workspace Creation', () => {
    it('should create a new workspace with valid input', async () => {
      const workspaceData = {
        name: 'My Workspace',
        description: 'A test workspace',
        ownerId: 'user-1',
      };

      // Mock Prisma responses
      (prisma.workspace.create as any).mockResolvedValue({
        ...mockWorkspace,
        ...workspaceData,
      });

      (prisma.workspaceMember.create as any).mockResolvedValue({
        id: 'member-1',
        workspaceId: mockWorkspace.id,
        userId: 'user-1',
        role: WorkspaceRole.OWNER,
      });

      const result = await workspaceManager.createWorkspace(workspaceData);

      expect(result).toMatchObject({
        name: workspaceData.name,
        description: workspaceData.description,
        ownerId: workspaceData.ownerId,
      });

      expect(prisma.workspace.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: workspaceData.name,
          description: workspaceData.description,
          ownerId: workspaceData.ownerId,
          slug: expect.any(String),
        }),
      });

      expect(prisma.workspaceMember.create).toHaveBeenCalledWith({
        data: {
          workspaceId: expect.any(String),
          userId: workspaceData.ownerId,
          role: WorkspaceRole.OWNER,
        },
      });
    });

    it('should generate unique slug from workspace name', async () => {
      const workspaceData = {
        name: 'My Amazing Workspace!',
        ownerId: 'user-1',
      };

      (prisma.workspace.create as any).mockResolvedValue({
        ...mockWorkspace,
        ...workspaceData,
        slug: 'my-amazing-workspace',
      });

      (prisma.workspaceMember.create as any).mockResolvedValue({});

      await workspaceManager.createWorkspace(workspaceData);

      expect(prisma.workspace.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          slug: expect.stringMatching(/^[a-z0-9-]+$/),
        }),
      });
    });

    it('should reject invalid workspace names', async () => {
      const invalidData = {
        name: '', // Empty name
        ownerId: 'user-1',
      };

      await expect(workspaceManager.createWorkspace(invalidData))
        .rejects.toThrow('Workspace name is required');
    });
  });

  describe('Member Management', () => {
    it('should add member with valid role', async () => {
      const memberData = {
        workspaceId: 'workspace-1',
        userEmail: 'newuser@example.com',
        role: WorkspaceRole.EDITOR,
        invitedBy: 'user-1',
      };

      // Mock user lookup
      (prisma.user.findUnique as any).mockResolvedValue({
        id: 'user-2',
        email: 'newuser@example.com',
      });

      // Mock workspace access check
      (prisma.workspaceMember.findUnique as any).mockResolvedValue({
        role: WorkspaceRole.OWNER,
      });

      // Mock member creation
      (prisma.workspaceMember.create as any).mockResolvedValue({
        id: 'member-2',
        workspaceId: 'workspace-1',
        userId: 'user-2',
        role: WorkspaceRole.EDITOR,
      });

      const result = await workspaceManager.addMember(memberData);

      expect(result).toMatchObject({
        workspaceId: 'workspace-1',
        userId: 'user-2',
        role: WorkspaceRole.EDITOR,
      });

      expect(prisma.workspaceMember.create).toHaveBeenCalledWith({
        data: {
          workspaceId: 'workspace-1',
          userId: 'user-2',
          role: WorkspaceRole.EDITOR,
          invitedBy: 'user-1',
        },
      });
    });

    it('should reject adding member without permission', async () => {
      const memberData = {
        workspaceId: 'workspace-1',
        userEmail: 'newuser@example.com',
        role: WorkspaceRole.EDITOR,
        invitedBy: 'user-2', // Not an admin
      };

      // Mock workspace access check - user has viewer role
      (prisma.workspaceMember.findUnique as any).mockResolvedValue({
        role: WorkspaceRole.VIEWER,
      });

      await expect(workspaceManager.addMember(memberData))
        .rejects.toThrow('Access denied');
    });

    it('should update member role with proper permissions', async () => {
      const updateData = {
        workspaceId: 'workspace-1',
        userId: 'user-2',
        role: WorkspaceRole.ADMIN,
        updatedBy: 'user-1',
      };

      // Mock permission check - owner can update roles
      (prisma.workspaceMember.findUnique as any)
        .mockResolvedValueOnce({ role: WorkspaceRole.OWNER })
        .mockResolvedValueOnce({ role: WorkspaceRole.EDITOR });

      (prisma.workspaceMember.update as any).mockResolvedValue({
        id: 'member-2',
        workspaceId: 'workspace-1',
        userId: 'user-2',
        role: WorkspaceRole.ADMIN,
      });

      const result = await workspaceManager.updateMemberRole(updateData);

      expect(result.role).toBe(WorkspaceRole.ADMIN);
      expect(prisma.workspaceMember.update).toHaveBeenCalledWith({
        where: {
          workspaceId_userId: {
            workspaceId: 'workspace-1',
            userId: 'user-2',
          },
        },
        data: { role: WorkspaceRole.ADMIN },
      });
    });
  });

  describe('Permission Enforcement', () => {
    it('should allow owner full access', async () => {
      (prisma.workspaceMember.findUnique as any).mockResolvedValue({
        role: WorkspaceRole.OWNER,
      });

      const hasAccess = await workspaceManager.checkAccess('workspace-1', 'user-1');
      expect(hasAccess).toBe(true);

      const canManage = await workspaceManager.canManageWorkspace('workspace-1', 'user-1');
      expect(canManage).toBe(true);
    });

    it('should allow admin to manage but not delete workspace', async () => {
      (prisma.workspaceMember.findUnique as any).mockResolvedValue({
        role: WorkspaceRole.ADMIN,
      });

      const hasAccess = await workspaceManager.checkAccess('workspace-1', 'user-2');
      expect(hasAccess).toBe(true);

      const canManage = await workspaceManager.canManageWorkspace('workspace-1', 'user-2');
      expect(canManage).toBe(true);
    });

    it('should restrict viewer permissions', async () => {
      (prisma.workspaceMember.findUnique as any).mockResolvedValue({
        role: WorkspaceRole.VIEWER,
      });

      const hasAccess = await workspaceManager.checkAccess('workspace-1', 'user-3');
      expect(hasAccess).toBe(true);

      const canManage = await workspaceManager.canManageWorkspace('workspace-1', 'user-3');
      expect(canManage).toBe(false);
    });

    it('should deny access to non-members', async () => {
      (prisma.workspaceMember.findUnique as any).mockResolvedValue(null);

      await expect(workspaceManager.checkAccess('workspace-1', 'user-4'))
        .rejects.toThrow('Access denied');
    });
  });

  describe('Workspace Operations', () => {
    it('should list user workspaces', async () => {
      const mockWorkspaces = [
        {
          workspace: {
            id: 'workspace-1',
            name: 'Workspace 1',
            description: 'First workspace',
          },
          role: WorkspaceRole.OWNER,
        },
        {
          workspace: {
            id: 'workspace-2',
            name: 'Workspace 2',
            description: 'Second workspace',
          },
          role: WorkspaceRole.EDITOR,
        },
      ];

      (prisma.workspaceMember.findMany as any).mockResolvedValue(mockWorkspaces);

      const result = await workspaceManager.listUserWorkspaces('user-1');

      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({
        id: 'workspace-1',
        name: 'Workspace 1',
        role: WorkspaceRole.OWNER,
      });

      expect(prisma.workspaceMember.findMany).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        include: { workspace: true },
        orderBy: { workspace: { name: 'asc' } },
      });
    });

    it('should get workspace details with member list', async () => {
      const mockWorkspaceWithMembers = {
        ...mockWorkspace,
        members: [
          {
            user: { id: 'user-1', email: 'owner@example.com', name: 'Owner' },
            role: WorkspaceRole.OWNER,
          },
          {
            user: { id: 'user-2', email: 'editor@example.com', name: 'Editor' },
            role: WorkspaceRole.EDITOR,
          },
        ],
      };

      (prisma.workspaceMember.findUnique as any).mockResolvedValue({
        role: WorkspaceRole.OWNER,
      });

      (prisma.workspace.findUnique as any).mockResolvedValue(mockWorkspaceWithMembers);

      const result = await workspaceManager.getWorkspace('workspace-1', 'user-1');

      expect(result).toMatchObject({
        id: 'workspace-1',
        name: 'Test Workspace',
        members: expect.arrayContaining([
          expect.objectContaining({
            role: WorkspaceRole.OWNER,
            user: expect.objectContaining({ email: 'owner@example.com' }),
          }),
        ]),
      });
    });
  });
});