export type ProjectStatus = 'active' | 'archived' | 'deleted';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description?: string;
  ownerId: string;
  projectStatus: ProjectStatus;
  archivedAt?: Date;
  archivedBy?: string;
  deletedAt?: Date;
  deletedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectClone {
  id: string;
  originalProjectId: string;
  clonedProjectId: string;
  clonedAt: Date;
  clonedBy: string;
  cloneType: 'manual' | 'auto';
  metadata: Record<string, any>;
}

export interface CreateProjectRequest {
  name: string;
  slug?: string;
  description?: string;
  ownerId: string;
}

export interface UpdateProjectRequest {
  name?: string;
  slug?: string;
  description?: string;
  projectStatus?: ProjectStatus;
}

export interface ArchiveProjectRequest {
  reason?: string;
  createSnapshot?: boolean;
}

export interface CloneProjectRequest {
  name: string;
  slug?: string;
  description?: string;
  includeFiles?: boolean;
  includeSnapshots?: boolean;
  includeDomains?: boolean;
}

export interface DeleteProjectRequest {
  reason?: string;
  createSnapshot?: boolean;
}