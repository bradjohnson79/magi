import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ProjectLifecycleService } from '@/lib/services/project-lifecycle';
import { SnapshotsService } from '@/lib/services/snapshots';
import { DomainsService } from '@/lib/services/domains';
import { Database } from '@/lib/database';
import { Project, ProjectStatus } from '@/lib/types/projects';

// Mock dependencies
jest.mock('@/lib/database');
jest.mock('@/lib/services/snapshots');
jest.mock('@/lib/services/domains');

const mockDb = {
  query: jest.fn(),
} as unknown as Database;

const mockSnapshotsService = {
  createSnapshot: jest.fn(),
  getProjectSnapshots: jest.fn(),
} as unknown as SnapshotsService;

const mockDomainsService = {
  getProjectDomains: jest.fn(),
  createDomain: jest.fn(),
} as unknown as DomainsService;

describe('ProjectLifecycleService', () => {
  let service: ProjectLifecycleService;
  let mockProject: Project;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Mock static getInstance methods
    (Database.getInstance as jest.Mock).mockReturnValue(mockDb);
    (SnapshotsService.getInstance as jest.Mock).mockReturnValue(mockSnapshotsService);
    (DomainsService.getInstance as jest.Mock).mockReturnValue(mockDomainsService);

    service = ProjectLifecycleService.getInstance();

    mockProject = {
      id: 'test-project-id',
      name: 'Test Project',
      slug: 'test-project',
      description: 'A test project',
      ownerId: 'test-user-id',
      projectStatus: 'active',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01')
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('archiveProject', () => {
    test('should archive an active project successfully', async () => {
      // Setup mocks
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProject] }) // getProjectById
        .mockResolvedValueOnce({ rows: [{ ...mockProject, project_status: 'archived', archived_at: new Date(), archived_by: 'test-user-id' }] }); // update

      (mockSnapshotsService.createSnapshot as jest.Mock).mockResolvedValue({
        id: 'snapshot-id',
        type: 'lifecycle'
      });

      const result = await service.archiveProject('test-project-id', 'test-user-id', {
        reason: 'Test archive',
        createSnapshot: true
      });

      expect(mockSnapshotsService.createSnapshot).toHaveBeenCalledWith(
        'test-project-id',
        expect.objectContaining({
          type: 'lifecycle',
          description: expect.stringContaining('Pre-archive snapshot'),
          metadata: expect.objectContaining({
            action: 'archive',
            userId: 'test-user-id',
            reason: 'Test archive'
          })
        })
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE projects'),
        ['test-user-id', 'test-project-id']
      );

      expect(result.projectStatus).toBe('archived');
    });

    test('should throw error when project is already archived', async () => {
      const archivedProject = { ...mockProject, projectStatus: 'archived' as ProjectStatus };
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [archivedProject] });

      await expect(
        service.archiveProject('test-project-id', 'test-user-id')
      ).rejects.toThrow('Project is already archived');
    });

    test('should throw error when project is deleted', async () => {
      const deletedProject = { ...mockProject, projectStatus: 'deleted' as ProjectStatus };
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [deletedProject] });

      await expect(
        service.archiveProject('test-project-id', 'test-user-id')
      ).rejects.toThrow('Cannot archive a deleted project');
    });

    test('should skip snapshot creation when requested', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProject] })
        .mockResolvedValueOnce({ rows: [{ ...mockProject, project_status: 'archived' }] });

      await service.archiveProject('test-project-id', 'test-user-id', {
        createSnapshot: false
      });

      expect(mockSnapshotsService.createSnapshot).not.toHaveBeenCalled();
    });
  });

  describe('cloneProject', () => {
    test('should clone a project successfully with all options', async () => {
      const cloneRequest = {
        name: 'Cloned Project',
        slug: 'cloned-project',
        description: 'A cloned project',
        includeFiles: true,
        includeSnapshots: true,
        includeDomains: true
      };

      // Setup mocks
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProject] }) // getProjectById (original)
        .mockResolvedValueOnce({ rows: [] }) // getProjectBySlug (check uniqueness)
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ ...mockProject, id: 'cloned-id', name: 'Cloned Project' }] }) // create project
        .mockResolvedValueOnce({ rows: [{ id: 'clone-record-id', original_project_id: 'test-project-id', cloned_project_id: 'cloned-id' }] }) // create clone record
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      // Mock file cloning
      service['cloneProjectFiles'] = jest.fn().mockResolvedValue(undefined);
      service['cloneProjectSnapshots'] = jest.fn().mockResolvedValue(undefined);
      service['cloneProjectDomains'] = jest.fn().mockResolvedValue(undefined);

      const result = await service.cloneProject('test-project-id', 'test-user-id', cloneRequest);

      expect(mockSnapshotsService.createSnapshot).toHaveBeenCalledWith(
        'test-project-id',
        expect.objectContaining({
          type: 'lifecycle',
          description: expect.stringContaining('Pre-clone snapshot')
        })
      );

      expect(result.project.name).toBe('Cloned Project');
      expect(result.clone).toBeDefined();
    });

    test('should generate unique slug when not provided', async () => {
      const cloneRequest = {
        name: 'Cloned Project',
        includeFiles: true
      };

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProject] }) // getProjectById
        .mockResolvedValueOnce({ rows: [] }) // getProjectBySlug check
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockResolvedValueOnce({ rows: [{ ...mockProject, id: 'cloned-id' }] }) // create
        .mockResolvedValueOnce({ rows: [{}] }) // clone record
        .mockResolvedValueOnce({ rows: [] }); // COMMIT

      service['cloneProjectFiles'] = jest.fn().mockResolvedValue(undefined);
      service['generateUniqueSlug'] = jest.fn().mockResolvedValue('cloned-project-1');

      await service.cloneProject('test-project-id', 'test-user-id', cloneRequest);

      expect(service['generateUniqueSlug']).toHaveBeenCalledWith('Cloned Project');
    });

    test('should throw error when cloning deleted project', async () => {
      const deletedProject = { ...mockProject, projectStatus: 'deleted' as ProjectStatus };
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [deletedProject] });

      await expect(
        service.cloneProject('test-project-id', 'test-user-id', { name: 'Clone' })
      ).rejects.toThrow('Cannot clone a deleted project');
    });

    test('should rollback transaction on error', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProject] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] }) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(
        service.cloneProject('test-project-id', 'test-user-id', { name: 'Clone' })
      ).rejects.toThrow('Database error');

      expect(mockDb.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('deleteProject', () => {
    test('should soft delete a project successfully', async () => {
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProject] }) // getProjectById
        .mockResolvedValueOnce({ rows: [{ ...mockProject, project_status: 'deleted', deleted_at: new Date(), deleted_by: 'test-user-id' }] }); // update

      const result = await service.deleteProject('test-project-id', 'test-user-id', {
        reason: 'Test deletion',
        createSnapshot: true
      });

      expect(mockSnapshotsService.createSnapshot).toHaveBeenCalledWith(
        'test-project-id',
        expect.objectContaining({
          type: 'lifecycle',
          description: expect.stringContaining('Pre-deletion snapshot'),
          metadata: expect.objectContaining({
            action: 'delete',
            userId: 'test-user-id',
            reason: 'Test deletion'
          })
        })
      );

      expect(result.projectStatus).toBe('deleted');
    });

    test('should throw error when project is already deleted', async () => {
      const deletedProject = { ...mockProject, projectStatus: 'deleted' as ProjectStatus };
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [deletedProject] });

      await expect(
        service.deleteProject('test-project-id', 'test-user-id')
      ).rejects.toThrow('Project is already deleted');
    });
  });

  describe('restoreProject', () => {
    test('should restore an archived project successfully', async () => {
      const archivedProject = { ...mockProject, projectStatus: 'archived' as ProjectStatus };
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [archivedProject] }) // getProjectById
        .mockResolvedValueOnce({ rows: [{ ...mockProject, project_status: 'active' }] }); // update

      const result = await service.restoreProject('test-project-id', 'test-user-id');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE projects'),
        ['test-project-id']
      );

      expect(result.projectStatus).toBe('active');
    });

    test('should restore a deleted project successfully', async () => {
      const deletedProject = { ...mockProject, projectStatus: 'deleted' as ProjectStatus };
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [deletedProject] })
        .mockResolvedValueOnce({ rows: [{ ...mockProject, project_status: 'active' }] });

      const result = await service.restoreProject('test-project-id', 'test-user-id');
      expect(result.projectStatus).toBe('active');
    });

    test('should throw error when project is already active', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [mockProject] });

      await expect(
        service.restoreProject('test-project-id', 'test-user-id')
      ).rejects.toThrow('Project is already active');
    });
  });

  describe('getProjects', () => {
    test('should filter projects by status correctly', async () => {
      const projects = [
        { ...mockProject, project_status: 'active' },
        { ...mockProject, id: 'archived-id', project_status: 'archived' },
        { ...mockProject, id: 'deleted-id', project_status: 'deleted' }
      ];

      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: projects });

      const result = await service.getProjects('test-user-id', ['active'], {
        includeArchived: false,
        includeDeleted: false
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE project_status = ANY($1)'),
        expect.arrayContaining([['active']])
      );
    });

    test('should include archived projects when requested', async () => {
      const projects = [
        { ...mockProject, project_status: 'active' },
        { ...mockProject, id: 'archived-id', project_status: 'archived' }
      ];

      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: projects });

      await service.getProjects('test-user-id', ['active', 'archived'], {
        includeArchived: true
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE project_status = ANY($1)'),
        expect.arrayContaining([['active', 'archived']])
      );
    });

    test('should apply pagination correctly', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await service.getProjects('test-user-id', ['active'], {
        limit: 10,
        offset: 20
      });

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT'),
        expect.arrayContaining([10, 20])
      );
    });
  });

  describe('getProjectClones', () => {
    test('should return clone relationships correctly', async () => {
      const clonedFromData = [
        {
          id: 'clone-1',
          original_project_id: 'original-id',
          cloned_project_id: 'test-project-id',
          original_name: 'Original Project',
          original_slug: 'original-project'
        }
      ];

      const clonedToData = [
        {
          id: 'clone-2',
          original_project_id: 'test-project-id',
          cloned_project_id: 'clone-id',
          cloned_name: 'Cloned Project',
          cloned_slug: 'cloned-project'
        }
      ];

      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: clonedFromData })
        .mockResolvedValueOnce({ rows: clonedToData });

      const result = await service.getProjectClones('test-project-id');

      expect(result.clonedFrom).toHaveLength(1);
      expect(result.clonedTo).toHaveLength(1);
      expect(result.clonedFrom[0].metadata.originalName).toBe('Original Project');
      expect(result.clonedTo[0].metadata.clonedName).toBe('Cloned Project');
    });
  });

  describe('Private helper methods', () => {
    test('generateUniqueSlug should handle conflicts', async () => {
      // Mock slug conflicts
      (mockDb.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [mockProject] }) // first slug exists
        .mockResolvedValueOnce({ rows: [mockProject] }) // second slug exists
        .mockResolvedValueOnce({ rows: [] }); // third slug is unique

      const slug = await service['generateUniqueSlug']('Test Project');
      expect(slug).toBe('test-project-2');
    });

    test('cloneProjectFiles should copy files correctly', async () => {
      (mockDb.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await service['cloneProjectFiles']('original-id', 'clone-id');

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO project_files'),
        ['clone-id', 'original-id']
      );
    });

    test('cloneProjectDomains should only clone custom domains', async () => {
      const domains = [
        { domain: 'example.com', domainType: 'custom', provider: 'vercel' },
        { domain: 'test.magi.dev', domainType: 'subdomain', provider: 'vercel' }
      ];

      (mockDomainsService.getProjectDomains as jest.Mock).mockResolvedValue(domains);

      await service['cloneProjectDomains']('original-id', 'clone-id');

      expect(mockDomainsService.createDomain).toHaveBeenCalledTimes(1);
      expect(mockDomainsService.createDomain).toHaveBeenCalledWith({
        projectId: 'clone-id',
        domain: 'clone-example.com',
        domainType: 'custom',
        provider: 'vercel'
      });
    });
  });
});

describe('Project Lifecycle Integration Tests', () => {
  test('should preserve audit trail through lifecycle transitions', async () => {
    // This would be an integration test that verifies
    // the complete lifecycle: active -> archived -> restored -> deleted
    // and ensures all audit information is preserved
  });

  test('should handle concurrent lifecycle operations safely', async () => {
    // This would test race conditions and ensure
    // database constraints prevent invalid state transitions
  });

  test('should clean up related resources on deletion', async () => {
    // This would verify that domains, files, and other
    // related resources are properly handled during deletion
  });
});