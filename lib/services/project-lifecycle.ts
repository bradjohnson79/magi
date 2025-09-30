import { Database } from '@/lib/database';
import {
  Project,
  ProjectClone,
  ProjectStatus,
  ArchiveProjectRequest,
  CloneProjectRequest,
  DeleteProjectRequest
} from '@/lib/types/projects';
import { SnapshotsService } from '@/lib/services/snapshots';
import { DomainsService } from '@/lib/services/domains';

export class ProjectLifecycleService {
  private static instance: ProjectLifecycleService;
  private db: Database;
  private snapshotsService: SnapshotsService;
  private domainsService: DomainsService;

  constructor() {
    this.db = Database.getInstance();
    this.snapshotsService = SnapshotsService.getInstance();
    this.domainsService = DomainsService.getInstance();
  }

  static getInstance(): ProjectLifecycleService {
    if (!ProjectLifecycleService.instance) {
      ProjectLifecycleService.instance = new ProjectLifecycleService();
    }
    return ProjectLifecycleService.instance;
  }

  /**
   * Archive a project
   */
  async archiveProject(
    projectId: string,
    userId: string,
    options: ArchiveProjectRequest = {}
  ): Promise<Project> {
    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.projectStatus === 'archived') {
      throw new Error('Project is already archived');
    }

    if (project.projectStatus === 'deleted') {
      throw new Error('Cannot archive a deleted project');
    }

    // Create snapshot before archiving if requested
    if (options.createSnapshot !== false) {
      await this.snapshotsService.createSnapshot(projectId, {
        type: 'lifecycle',
        description: `Pre-archive snapshot - ${options.reason || 'Manual archive'}`,
        metadata: {
          action: 'archive',
          userId,
          reason: options.reason
        }
      });
    }

    // Update project status
    const query = `
      UPDATE projects
      SET
        project_status = 'archived',
        archived_at = now(),
        archived_by = $1,
        updated_at = now()
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [userId, projectId]);
    return this.mapProjectFromRow(result.rows[0]);
  }

  /**
   * Clone a project
   */
  async cloneProject(
    originalProjectId: string,
    userId: string,
    options: CloneProjectRequest
  ): Promise<{ project: Project; clone: ProjectClone }> {
    const originalProject = await this.getProjectById(originalProjectId);
    if (!originalProject) {
      throw new Error('Original project not found');
    }

    if (originalProject.projectStatus === 'deleted') {
      throw new Error('Cannot clone a deleted project');
    }

    // Generate unique slug if not provided
    let slug = options.slug;
    if (!slug) {
      slug = await this.generateUniqueSlug(options.name);
    }

    // Validate slug is unique
    const existingProject = await this.getProjectBySlug(slug);
    if (existingProject) {
      throw new Error(`Project with slug '${slug}' already exists`);
    }

    // Create snapshot of original project before cloning
    await this.snapshotsService.createSnapshot(originalProjectId, {
      type: 'lifecycle',
      description: `Pre-clone snapshot - Cloning to '${options.name}'`,
      metadata: {
        action: 'clone',
        userId,
        targetName: options.name
      }
    });

    // Begin transaction for cloning
    await this.db.query('BEGIN');

    try {
      // Create new project
      const createQuery = `
        INSERT INTO projects (name, slug, description, owner_id, project_status)
        VALUES ($1, $2, $3, $4, 'active')
        RETURNING *
      `;

      const projectResult = await this.db.query(createQuery, [
        options.name,
        slug,
        options.description || `Clone of ${originalProject.name}`,
        userId
      ]);

      const newProject = this.mapProjectFromRow(projectResult.rows[0]);

      // Record clone relationship
      const cloneQuery = `
        INSERT INTO project_clones (
          original_project_id,
          cloned_project_id,
          cloned_by,
          clone_type,
          metadata
        )
        VALUES ($1, $2, $3, 'manual', $4)
        RETURNING *
      `;

      const cloneMetadata = {
        includeFiles: options.includeFiles ?? true,
        includeSnapshots: options.includeSnapshots ?? false,
        includeDomains: options.includeDomains ?? false,
        originalName: originalProject.name,
        originalSlug: originalProject.slug
      };

      const cloneResult = await this.db.query(cloneQuery, [
        originalProjectId,
        newProject.id,
        userId,
        JSON.stringify(cloneMetadata)
      ]);

      const cloneRecord = this.mapCloneFromRow(cloneResult.rows[0]);

      // Clone project files if requested
      if (options.includeFiles !== false) {
        await this.cloneProjectFiles(originalProjectId, newProject.id);
      }

      // Clone snapshots if requested
      if (options.includeSnapshots) {
        await this.cloneProjectSnapshots(originalProjectId, newProject.id);
      }

      // Clone domains if requested
      if (options.includeDomains) {
        await this.cloneProjectDomains(originalProjectId, newProject.id);
      }

      await this.db.query('COMMIT');

      return {
        project: newProject,
        clone: cloneRecord
      };

    } catch (error) {
      await this.db.query('ROLLBACK');
      throw error;
    }
  }

  /**
   * Soft delete a project
   */
  async deleteProject(
    projectId: string,
    userId: string,
    options: DeleteProjectRequest = {}
  ): Promise<Project> {
    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.projectStatus === 'deleted') {
      throw new Error('Project is already deleted');
    }

    // Create snapshot before deletion if requested
    if (options.createSnapshot !== false) {
      await this.snapshotsService.createSnapshot(projectId, {
        type: 'lifecycle',
        description: `Pre-deletion snapshot - ${options.reason || 'Manual deletion'}`,
        metadata: {
          action: 'delete',
          userId,
          reason: options.reason
        }
      });
    }

    // Soft delete project
    const query = `
      UPDATE projects
      SET
        project_status = 'deleted',
        deleted_at = now(),
        deleted_by = $1,
        updated_at = now()
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.db.query(query, [userId, projectId]);
    return this.mapProjectFromRow(result.rows[0]);
  }

  /**
   * Restore a project from archived or deleted status
   */
  async restoreProject(projectId: string, userId: string): Promise<Project> {
    const project = await this.getProjectById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    if (project.projectStatus === 'active') {
      throw new Error('Project is already active');
    }

    const query = `
      UPDATE projects
      SET
        project_status = 'active',
        archived_at = NULL,
        archived_by = NULL,
        deleted_at = NULL,
        deleted_by = NULL,
        updated_at = now()
      WHERE id = $1
      RETURNING *
    `;

    const result = await this.db.query(query, [projectId]);
    return this.mapProjectFromRow(result.rows[0]);
  }

  /**
   * Get project clone history
   */
  async getProjectClones(projectId: string): Promise<{
    clonedFrom: ProjectClone[];
    clonedTo: ProjectClone[];
  }> {
    // Projects this one was cloned from
    const clonedFromQuery = `
      SELECT pc.*, p.name as original_name, p.slug as original_slug
      FROM project_clones pc
      JOIN projects p ON pc.original_project_id = p.id
      WHERE pc.cloned_project_id = $1
      ORDER BY pc.cloned_at DESC
    `;

    // Projects cloned from this one
    const clonedToQuery = `
      SELECT pc.*, p.name as cloned_name, p.slug as cloned_slug
      FROM project_clones pc
      JOIN projects p ON pc.cloned_project_id = p.id
      WHERE pc.original_project_id = $1
      ORDER BY pc.cloned_at DESC
    `;

    const [clonedFromResult, clonedToResult] = await Promise.all([
      this.db.query(clonedFromQuery, [projectId]),
      this.db.query(clonedToQuery, [projectId])
    ]);

    return {
      clonedFrom: clonedFromResult.rows.map(row => ({
        ...this.mapCloneFromRow(row),
        metadata: {
          ...row.metadata,
          originalName: row.original_name,
          originalSlug: row.original_slug
        }
      })),
      clonedTo: clonedToResult.rows.map(row => ({
        ...this.mapCloneFromRow(row),
        metadata: {
          ...row.metadata,
          clonedName: row.cloned_name,
          clonedSlug: row.cloned_slug
        }
      }))
    };
  }

  /**
   * Get projects with status filtering
   */
  async getProjects(
    userId?: string,
    statuses: ProjectStatus[] = ['active'],
    options: {
      includeArchived?: boolean;
      includeDeleted?: boolean;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Project[]> {
    // Build status filter
    const statusFilter = [];
    if (options.includeArchived !== false && !statuses.includes('archived')) {
      statusFilter.push('active');
    }
    if (options.includeArchived) {
      statusFilter.push('archived');
    }
    if (options.includeDeleted) {
      statusFilter.push('deleted');
    }

    const finalStatuses = statuses.length > 0 ? statuses : statusFilter;

    let query = `
      SELECT * FROM projects
      WHERE project_status = ANY($1)
    `;
    const params: any[] = [finalStatuses];

    if (userId) {
      query += ` AND owner_id = $${params.length + 1}`;
      params.push(userId);
    }

    query += ` ORDER BY updated_at DESC`;

    if (options.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await this.db.query(query, params);
    return result.rows.map(row => this.mapProjectFromRow(row));
  }

  /**
   * Get project by ID (including archived/deleted)
   */
  async getProjectById(projectId: string): Promise<Project | null> {
    const query = 'SELECT * FROM projects WHERE id = $1';
    const result = await this.db.query(query, [projectId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapProjectFromRow(result.rows[0]);
  }

  /**
   * Get project by slug (active only by default)
   */
  async getProjectBySlug(slug: string, includeInactive = false): Promise<Project | null> {
    let query = 'SELECT * FROM projects WHERE slug = $1';
    const params = [slug];

    if (!includeInactive) {
      query += ` AND project_status = 'active'`;
    }

    const result = await this.db.query(query, params);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapProjectFromRow(result.rows[0]);
  }

  /**
   * Private helper methods
   */
  private async generateUniqueSlug(name: string): Promise<string> {
    let baseSlug = name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');

    let slug = baseSlug;
    let counter = 1;

    while (await this.getProjectBySlug(slug, true)) {
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    return slug;
  }

  private async cloneProjectFiles(originalProjectId: string, newProjectId: string): Promise<void> {
    const query = `
      INSERT INTO project_files (project_id, file_path, content, file_type, created_at, updated_at)
      SELECT $1, file_path, content, file_type, now(), now()
      FROM project_files
      WHERE project_id = $2
    `;

    await this.db.query(query, [newProjectId, originalProjectId]);
  }

  private async cloneProjectSnapshots(originalProjectId: string, newProjectId: string): Promise<void> {
    // Clone snapshots by creating new ones with copied data
    const snapshotsQuery = `
      SELECT * FROM project_snapshots
      WHERE project_id = $1
      ORDER BY created_at DESC
      LIMIT 10
    `;

    const snapshots = await this.db.query(snapshotsQuery, [originalProjectId]);

    for (const snapshot of snapshots.rows) {
      await this.snapshotsService.createSnapshot(newProjectId, {
        type: 'clone',
        description: `Cloned: ${snapshot.description}`,
        metadata: {
          ...snapshot.metadata,
          clonedFrom: originalProjectId,
          originalSnapshotId: snapshot.id
        }
      });
    }
  }

  private async cloneProjectDomains(originalProjectId: string, newProjectId: string): Promise<void> {
    const domains = await this.domainsService.getProjectDomains(originalProjectId);

    for (const domain of domains) {
      // Only clone custom domains (subdomains will be auto-generated)
      if (domain.domainType === 'custom') {
        // Create a new domain with a suffix to avoid conflicts
        const newDomainName = `clone-${domain.domain}`;

        await this.domainsService.createDomain({
          projectId: newProjectId,
          domain: newDomainName,
          domainType: 'custom',
          provider: domain.provider
        });
      }
    }
  }

  private mapProjectFromRow(row: any): Project {
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      ownerId: row.owner_id,
      projectStatus: row.project_status,
      archivedAt: row.archived_at ? new Date(row.archived_at) : undefined,
      archivedBy: row.archived_by,
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
      deletedBy: row.deleted_by,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapCloneFromRow(row: any): ProjectClone {
    return {
      id: row.id,
      originalProjectId: row.original_project_id,
      clonedProjectId: row.cloned_project_id,
      clonedAt: new Date(row.cloned_at),
      clonedBy: row.cloned_by,
      cloneType: row.clone_type,
      metadata: row.metadata || {}
    };
  }
}