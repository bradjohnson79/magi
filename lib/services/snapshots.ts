import { Database } from '@/lib/database';

export interface Snapshot {
  id: string;
  projectId: string;
  type: 'manual' | 'auto' | 'lifecycle' | 'clone';
  description: string;
  metadata: Record<string, any>;
  createdAt: Date;
  createdBy?: string;
}

export interface CreateSnapshotRequest {
  type: 'manual' | 'auto' | 'lifecycle' | 'clone';
  description: string;
  metadata?: Record<string, any>;
}

export class SnapshotsService {
  private static instance: SnapshotsService;
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): SnapshotsService {
    if (!SnapshotsService.instance) {
      SnapshotsService.instance = new SnapshotsService();
    }
    return SnapshotsService.instance;
  }

  /**
   * Create a new snapshot
   */
  async createSnapshot(
    projectId: string,
    request: CreateSnapshotRequest,
    userId?: string
  ): Promise<Snapshot> {
    const query = `
      INSERT INTO project_snapshots (
        project_id,
        type,
        description,
        metadata,
        created_by
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;

    const values = [
      projectId,
      request.type,
      request.description,
      JSON.stringify(request.metadata || {}),
      userId
    ];

    const result = await this.db.query(query, values);
    return this.mapSnapshotFromRow(result.rows[0]);
  }

  /**
   * Get snapshots for a project
   */
  async getProjectSnapshots(
    projectId: string,
    options: {
      type?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<Snapshot[]> {
    let query = 'SELECT * FROM project_snapshots WHERE project_id = $1';
    const params: any[] = [projectId];

    if (options.type) {
      query += ` AND type = $${params.length + 1}`;
      params.push(options.type);
    }

    query += ' ORDER BY created_at DESC';

    if (options.limit) {
      query += ` LIMIT $${params.length + 1}`;
      params.push(options.limit);
    }

    if (options.offset) {
      query += ` OFFSET $${params.length + 1}`;
      params.push(options.offset);
    }

    const result = await this.db.query(query, params);
    return result.rows.map(row => this.mapSnapshotFromRow(row));
  }

  /**
   * Get snapshot by ID
   */
  async getSnapshotById(snapshotId: string): Promise<Snapshot | null> {
    const query = 'SELECT * FROM project_snapshots WHERE id = $1';
    const result = await this.db.query(query, [snapshotId]);

    if (result.rows.length === 0) {
      return null;
    }

    return this.mapSnapshotFromRow(result.rows[0]);
  }

  /**
   * Delete snapshot
   */
  async deleteSnapshot(snapshotId: string): Promise<void> {
    const query = 'DELETE FROM project_snapshots WHERE id = $1';
    await this.db.query(query, [snapshotId]);
  }

  /**
   * Auto-create lifecycle snapshots
   */
  async createLifecycleSnapshot(
    projectId: string,
    action: 'archive' | 'clone' | 'delete' | 'restore',
    userId: string,
    additionalMetadata: Record<string, any> = {}
  ): Promise<Snapshot> {
    const descriptions = {
      archive: 'Automatic snapshot before archiving',
      clone: 'Automatic snapshot before cloning',
      delete: 'Automatic snapshot before deletion',
      restore: 'Automatic snapshot before restoration'
    };

    return this.createSnapshot(projectId, {
      type: 'lifecycle',
      description: descriptions[action],
      metadata: {
        action,
        userId,
        timestamp: new Date().toISOString(),
        ...additionalMetadata
      }
    }, userId);
  }

  /**
   * Map database row to Snapshot object
   */
  private mapSnapshotFromRow(row: any): Snapshot {
    return {
      id: row.id,
      projectId: row.project_id,
      type: row.type,
      description: row.description,
      metadata: row.metadata || {},
      createdAt: new Date(row.created_at),
      createdBy: row.created_by
    };
  }
}