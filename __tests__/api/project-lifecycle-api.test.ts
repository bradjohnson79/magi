import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { createMocks } from 'node-mocks-http';
import { NextApiRequest, NextApiResponse } from 'next';
import archiveHandler from '@/pages/api/v1/projects/[id]/archive';
import cloneHandler from '@/pages/api/v1/projects/[id]/clone';
import deleteHandler from '@/pages/api/v1/projects/[id]/delete';
import restoreHandler from '@/pages/api/v1/projects/[id]/restore';

// Mock dependencies
jest.mock('@clerk/nextjs/server', () => ({
  getAuth: jest.fn()
}));

jest.mock('@/lib/services/project-lifecycle', () => ({
  ProjectLifecycleService: {
    getInstance: jest.fn()
  }
}));

const mockAuth = require('@clerk/nextjs/server').getAuth;
const mockLifecycleService = require('@/lib/services/project-lifecycle').ProjectLifecycleService;

describe('Project Lifecycle API Endpoints', () => {
  let mockService: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockService = {
      getProjectById: jest.fn(),
      archiveProject: jest.fn(),
      cloneProject: jest.fn(),
      deleteProject: jest.fn(),
      restoreProject: jest.fn()
    };

    mockLifecycleService.getInstance.mockReturnValue(mockService);
  });

  describe('POST /api/v1/projects/[id]/archive', () => {
    test('should archive project successfully', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        name: 'Test Project',
        ownerId: 'test-user-id',
        projectStatus: 'active'
      };

      const archivedProject = {
        ...mockProject,
        projectStatus: 'archived',
        archivedAt: new Date()
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.archiveProject.mockResolvedValue(archivedProject);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' },
        body: {
          reason: 'Test archive',
          createSnapshot: true
        }
      });

      await archiveHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.data.project.projectStatus).toBe('archived');
    });

    test('should return 401 when user not authenticated', async () => {
      mockAuth.mockReturnValue({ userId: null });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' }
      });

      await archiveHandler(req, res);

      expect(res._getStatusCode()).toBe(401);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Unauthorized');
    });

    test('should return 403 when user does not own project', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        ownerId: 'other-user-id',
        projectStatus: 'active'
      };

      mockService.getProjectById.mockResolvedValue(mockProject);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' }
      });

      await archiveHandler(req, res);

      expect(res._getStatusCode()).toBe(403);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Forbidden');
    });

    test('should return 405 for non-POST methods', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
        query: { id: 'test-project-id' }
      });

      await archiveHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res.getHeader('Allow')).toEqual(['POST']);
    });

    test('should return 409 when project is already archived', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        ownerId: 'test-user-id',
        projectStatus: 'active'
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.archiveProject.mockRejectedValue(new Error('Project is already archived'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' }
      });

      await archiveHandler(req, res);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Conflict');
    });
  });

  describe('POST /api/v1/projects/[id]/clone', () => {
    test('should clone project successfully', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        name: 'Test Project',
        ownerId: 'test-user-id',
        projectStatus: 'active'
      };

      const clonedProject = {
        id: 'cloned-project-id',
        name: 'Cloned Project',
        ownerId: 'test-user-id',
        projectStatus: 'active'
      };

      const cloneRecord = {
        id: 'clone-record-id',
        originalProjectId: 'test-project-id',
        clonedProjectId: 'cloned-project-id'
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.cloneProject.mockResolvedValue({
        project: clonedProject,
        clone: cloneRecord
      });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' },
        body: {
          name: 'Cloned Project',
          includeFiles: true,
          includeSnapshots: false,
          includeDomains: false
        }
      });

      await cloneHandler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.data.project.name).toBe('Cloned Project');
    });

    test('should return 400 when name is missing', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' },
        body: {}
      });

      await cloneHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Bad Request');
      expect(data.message).toContain('name is required');
    });

    test('should return 400 for invalid slug format', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' },
        body: {
          name: 'Test Project',
          slug: 'INVALID_SLUG!'
        }
      });

      await cloneHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('Slug must contain only lowercase');
    });

    test('should return 409 when slug already exists', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        ownerId: 'test-user-id',
        projectStatus: 'active'
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.cloneProject.mockRejectedValue(new Error('Project with slug \'test\' already exists'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' },
        body: {
          name: 'Test Project',
          slug: 'test'
        }
      });

      await cloneHandler(req, res);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Conflict');
    });
  });

  describe('DELETE /api/v1/projects/[id]', () => {
    test('should delete project successfully', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        name: 'Test Project',
        ownerId: 'test-user-id',
        projectStatus: 'active'
      };

      const deletedProject = {
        ...mockProject,
        projectStatus: 'deleted',
        deletedAt: new Date()
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.deleteProject.mockResolvedValue(deletedProject);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'DELETE',
        query: { id: 'test-project-id' },
        body: {
          reason: 'Test deletion',
          createSnapshot: true
        }
      });

      await deleteHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.data.project.projectStatus).toBe('deleted');
      expect(data.data.note).toContain('soft delete');
    });

    test('should return 405 for non-DELETE methods', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' }
      });

      await deleteHandler(req, res);

      expect(res._getStatusCode()).toBe(405);
      expect(res.getHeader('Allow')).toEqual(['DELETE']);
    });

    test('should return 409 when project is already deleted', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        ownerId: 'test-user-id',
        projectStatus: 'active'
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.deleteProject.mockRejectedValue(new Error('Project is already deleted'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'DELETE',
        query: { id: 'test-project-id' }
      });

      await deleteHandler(req, res);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Conflict');
    });
  });

  describe('POST /api/v1/projects/[id]/restore', () => {
    test('should restore archived project successfully', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        name: 'Test Project',
        ownerId: 'test-user-id',
        projectStatus: 'archived'
      };

      const restoredProject = {
        ...mockProject,
        projectStatus: 'active'
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.restoreProject.mockResolvedValue(restoredProject);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' }
      });

      await restoreHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
      expect(data.data.project.projectStatus).toBe('active');
    });

    test('should restore deleted project successfully', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        ownerId: 'test-user-id',
        projectStatus: 'deleted'
      };

      const restoredProject = {
        ...mockProject,
        projectStatus: 'active'
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.restoreProject.mockResolvedValue(restoredProject);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' }
      });

      await restoreHandler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());
      expect(data.success).toBe(true);
    });

    test('should return 409 when project is already active', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const mockProject = {
        id: 'test-project-id',
        ownerId: 'test-user-id',
        projectStatus: 'active'
      };

      mockService.getProjectById.mockResolvedValue(mockProject);
      mockService.restoreProject.mockRejectedValue(new Error('Project is already active'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' }
      });

      await restoreHandler(req, res);

      expect(res._getStatusCode()).toBe(409);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Conflict');
    });
  });

  describe('Error Handling', () => {
    test('should handle missing project ID', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: {}
      });

      await archiveHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('Project ID is required');
    });

    test('should handle project not found', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });
      mockService.getProjectById.mockResolvedValue(null);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'nonexistent-id' }
      });

      await archiveHandler(req, res);

      expect(res._getStatusCode()).toBe(404);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Not Found');
    });

    test('should handle internal server errors', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });
      mockService.getProjectById.mockRejectedValue(new Error('Database connection failed'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' }
      });

      await archiveHandler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Internal Server Error');
    });
  });

  describe('Input Validation', () => {
    test('should validate project name length in clone request', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const longName = 'a'.repeat(101);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' },
        body: {
          name: longName
        }
      });

      await cloneHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('100 characters');
    });

    test('should validate slug length in clone request', async () => {
      mockAuth.mockReturnValue({ userId: 'test-user-id' });

      const longSlug = 'a'.repeat(51);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        query: { id: 'test-project-id' },
        body: {
          name: 'Valid Name',
          slug: longSlug
        }
      });

      await cloneHandler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.message).toContain('1-50 characters');
    });
  });
});