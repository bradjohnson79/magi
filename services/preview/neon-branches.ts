/**
 * Neon Database Branching Service
 *
 * Handles creation and management of isolated database branches
 * for user preview environments and testing.
 */

import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { auditLogger } from '@/services/audit/logger';
import { activityLogger } from '@/services/activity/logger';

export interface BranchCreateOptions {
  userId: string;
  projectId: string;
  name: string;
  description?: string;
  parentBranchId?: string;
  retentionDays?: number;
}

export interface BranchInfo {
  id: string;
  name: string;
  description?: string;
  projectId: string;
  parentBranchId?: string;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  status: 'creating' | 'ready' | 'failed' | 'deleting' | 'deleted';
  connectionString: string;
  endpoint?: string;
  metadata: {
    diskUsage?: number;
    lastActivity?: Date;
    accessCount?: number;
  };
}

export interface BranchMergeOptions {
  sourceBranchId: string;
  targetBranchId: string;
  userId: string;
  strategy: 'merge' | 'squash' | 'rebase';
  deleteSourceAfterMerge?: boolean;
  conflictResolution?: 'auto' | 'manual';
}

export class NeonBranchManager {
  private static instance: NeonBranchManager;
  private neonApiKey: string;
  private neonApiUrl = 'https://console.neon.tech/api/v2';
  private projectId: string;

  private constructor() {
    this.neonApiKey = process.env.NEON_API_KEY!;
    this.projectId = process.env.NEON_PROJECT_ID!;

    if (!this.neonApiKey) {
      throw new Error('NEON_API_KEY environment variable is required');
    }

    if (!this.projectId) {
      throw new Error('NEON_PROJECT_ID environment variable is required');
    }
  }

  public static getInstance(): NeonBranchManager {
    if (!NeonBranchManager.instance) {
      NeonBranchManager.instance = new NeonBranchManager();
    }
    return NeonBranchManager.instance;
  }

  /**
   * Create a new database branch
   */
  async createBranch(options: BranchCreateOptions): Promise<BranchInfo> {
    return withSpan('neon.create_branch', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'neon_branch_create',
          [SPAN_ATTRIBUTES.USER_ID]: options.userId,
          [SPAN_ATTRIBUTES.PROJECT_ID]: options.projectId,
          'branch.name': options.name,
        });

        // Generate unique branch name
        const branchName = this.generateBranchName(options.name, options.userId);

        // Call Neon API to create branch
        const response = await this.callNeonAPI('POST', `/projects/${this.projectId}/branches`, {
          branch: {
            name: branchName,
            parent_id: options.parentBranchId,
          },
          endpoints: [
            {
              type: 'read_write',
              autoscaling_limit_min_cu: 0.25,
              autoscaling_limit_max_cu: 1,
              suspend_timeout_seconds: 300, // 5 minutes
            },
          ],
        });

        if (!response.branch) {
          throw new Error('Failed to create Neon branch');
        }

        const branch = response.branch;
        const endpoint = response.endpoints?.[0];

        // Calculate expiration date
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + (options.retentionDays || 7));

        const branchInfo: BranchInfo = {
          id: branch.id,
          name: branchName,
          description: options.description,
          projectId: options.projectId,
          parentBranchId: options.parentBranchId,
          createdBy: options.userId,
          createdAt: new Date(branch.created_at),
          expiresAt,
          status: 'creating',
          connectionString: this.buildConnectionString(endpoint),
          endpoint: endpoint?.host,
          metadata: {
            accessCount: 0,
          },
        };

        // Store branch info in database
        await this.storeBranchInfo(branchInfo);

        // Log activity
        await activityLogger.logActivity({
          projectId: options.projectId,
          userId: options.userId,
          action: 'preview.branch_created',
          target: 'branch',
          targetId: branch.id,
          metadata: {
            branchName,
            parentBranchId: options.parentBranchId,
            retentionDays: options.retentionDays || 7,
          },
        });

        // Audit log
        await auditLogger.log({
          userId: options.userId,
          action: 'preview.branch_created',
          resource: 'neon_branch',
          resourceId: branch.id,
          details: {
            branchName,
            projectId: options.projectId,
            retentionDays: options.retentionDays || 7,
          },
          severity: 'info',
          outcome: 'success',
        });

        addSpanAttributes(span, {
          'branch.id': branch.id,
          'branch.status': branchInfo.status,
        });

        return branchInfo;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get branch information
   */
  async getBranch(branchId: string, userId: string): Promise<BranchInfo> {
    return withSpan('neon.get_branch', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'neon_branch_get',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'branch.id': branchId,
        });

        // Get branch from Neon API
        const response = await this.callNeonAPI('GET', `/projects/${this.projectId}/branches/${branchId}`);

        if (!response.branch) {
          throw new Error('Branch not found');
        }

        const branch = response.branch;

        // Get endpoints for this branch
        const endpointsResponse = await this.callNeonAPI('GET', `/projects/${this.projectId}/endpoints`);
        const endpoint = endpointsResponse.endpoints?.find((ep: any) => ep.branch_id === branchId);

        // Get stored branch info
        const storedInfo = await this.getStoredBranchInfo(branchId);

        // Check access permissions
        if (storedInfo && storedInfo.createdBy !== userId) {
          throw new Error('Access denied');
        }

        const branchInfo: BranchInfo = {
          id: branch.id,
          name: branch.name,
          description: storedInfo?.description,
          projectId: storedInfo?.projectId || 'unknown',
          parentBranchId: branch.parent_id,
          createdBy: storedInfo?.createdBy || userId,
          createdAt: new Date(branch.created_at),
          expiresAt: storedInfo?.expiresAt,
          status: this.mapNeonStatus(branch.status),
          connectionString: endpoint ? this.buildConnectionString(endpoint) : '',
          endpoint: endpoint?.host,
          metadata: {
            diskUsage: branch.current_state?.disk_usage,
            lastActivity: branch.updated_at ? new Date(branch.updated_at) : undefined,
            accessCount: storedInfo?.metadata.accessCount || 0,
          },
        };

        // Update access count
        if (storedInfo) {
          await this.updateBranchAccess(branchId);
        }

        return branchInfo;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * List user's branches
   */
  async listUserBranches(userId: string, projectId?: string): Promise<BranchInfo[]> {
    return withSpan('neon.list_user_branches', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'neon_branch_list',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          [SPAN_ATTRIBUTES.PROJECT_ID]: projectId || 'all',
        });

        // Get all branches from Neon
        const response = await this.callNeonAPI('GET', `/projects/${this.projectId}/branches`);

        if (!response.branches) {
          return [];
        }

        // Get stored branch info to filter by user
        const userBranches = await this.getUserStoredBranches(userId, projectId);
        const userBranchIds = new Set(userBranches.map(b => b.id));

        // Filter and transform branches
        const branches = response.branches
          .filter((branch: any) => userBranchIds.has(branch.id))
          .map((branch: any) => {
            const storedInfo = userBranches.find(b => b.id === branch.id);

            return {
              id: branch.id,
              name: branch.name,
              description: storedInfo?.description,
              projectId: storedInfo?.projectId || 'unknown',
              parentBranchId: branch.parent_id,
              createdBy: storedInfo?.createdBy || userId,
              createdAt: new Date(branch.created_at),
              expiresAt: storedInfo?.expiresAt,
              status: this.mapNeonStatus(branch.status),
              connectionString: '',
              metadata: {
                diskUsage: branch.current_state?.disk_usage,
                lastActivity: branch.updated_at ? new Date(branch.updated_at) : undefined,
                accessCount: storedInfo?.metadata.accessCount || 0,
              },
            } as BranchInfo;
          });

        return branches;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Delete a branch
   */
  async deleteBranch(branchId: string, userId: string): Promise<void> {
    return withSpan('neon.delete_branch', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'neon_branch_delete',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'branch.id': branchId,
        });

        // Get branch info for permission check
        const branchInfo = await this.getBranch(branchId, userId);

        // Delete from Neon
        await this.callNeonAPI('DELETE', `/projects/${this.projectId}/branches/${branchId}`);

        // Remove from local storage
        await this.removeStoredBranchInfo(branchId);

        // Log activity
        await activityLogger.logActivity({
          projectId: branchInfo.projectId,
          userId,
          action: 'preview.branch_deleted',
          target: 'branch',
          targetId: branchId,
          metadata: {
            branchName: branchInfo.name,
          },
        });

        // Audit log
        await auditLogger.log({
          userId,
          action: 'preview.branch_deleted',
          resource: 'neon_branch',
          resourceId: branchId,
          details: {
            branchName: branchInfo.name,
            projectId: branchInfo.projectId,
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
   * Merge branch changes
   */
  async mergeBranch(options: BranchMergeOptions): Promise<{ success: boolean; conflictFiles?: string[] }> {
    return withSpan('neon.merge_branch', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'neon_branch_merge',
          [SPAN_ATTRIBUTES.USER_ID]: options.userId,
          'merge.source_branch': options.sourceBranchId,
          'merge.target_branch': options.targetBranchId,
          'merge.strategy': options.strategy,
        });

        // Get branch information
        const sourceBranch = await this.getBranch(options.sourceBranchId, options.userId);
        const targetBranch = await this.getBranch(options.targetBranchId, options.userId);

        // Check merge permissions
        if (sourceBranch.createdBy !== options.userId) {
          throw new Error('Permission denied: Cannot merge branch you do not own');
        }

        // For database branches, merging typically involves schema migrations
        // This is a simplified implementation - real merging would require
        // comparing schema changes and data migrations

        // Simulate merge process
        const mergeResult = await this.performDatabaseMerge(sourceBranch, targetBranch, options);

        // Log activity
        await activityLogger.logActivity({
          projectId: sourceBranch.projectId,
          userId: options.userId,
          action: 'preview.branch_merged',
          target: 'branch',
          targetId: options.sourceBranchId,
          metadata: {
            sourceBranch: sourceBranch.name,
            targetBranch: targetBranch.name,
            strategy: options.strategy,
            success: mergeResult.success,
            conflictFiles: mergeResult.conflictFiles,
          },
        });

        // Delete source branch if requested
        if (options.deleteSourceAfterMerge && mergeResult.success) {
          await this.deleteBranch(options.sourceBranchId, options.userId);
        }

        return mergeResult;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Cleanup expired branches
   */
  async cleanupExpiredBranches(): Promise<{ cleaned: number; errors: string[] }> {
    return withSpan('neon.cleanup_expired_branches', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'neon_branch_cleanup',
        });

        const expiredBranches = await this.getExpiredBranches();
        let cleaned = 0;
        const errors: string[] = [];

        for (const branch of expiredBranches) {
          try {
            await this.deleteBranch(branch.id, branch.createdBy);
            cleaned++;
          } catch (error) {
            errors.push(`Failed to delete branch ${branch.id}: ${(error as Error).message}`);
          }
        }

        addSpanAttributes(span, {
          'cleanup.expired_count': expiredBranches.length,
          'cleanup.cleaned_count': cleaned,
          'cleanup.error_count': errors.length,
        });

        return { cleaned, errors };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Private helper methods
   */
  private async callNeonAPI(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.neonApiUrl}${path}`;
    const options: RequestInit = {
      method,
      headers: {
        'Authorization': `Bearer ${this.neonApiKey}`,
        'Content-Type': 'application/json',
      },
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Neon API error: ${response.status} - ${errorData.message || response.statusText}`);
    }

    return await response.json();
  }

  private generateBranchName(baseName: string, userId: string): string {
    const timestamp = Date.now();
    const userSuffix = userId.slice(-8);
    const safeName = baseName.toLowerCase().replace(/[^a-z0-9-]/g, '-');
    return `${safeName}-${userSuffix}-${timestamp}`;
  }

  private buildConnectionString(endpoint: any): string {
    if (!endpoint) return '';

    const dbName = process.env.NEON_DATABASE_NAME || 'neondb';
    const username = process.env.NEON_USERNAME || 'neondb_owner';

    return `postgresql://${username}:[password]@${endpoint.host}/${dbName}?sslmode=require`;
  }

  private mapNeonStatus(neonStatus: string): BranchInfo['status'] {
    const statusMap: Record<string, BranchInfo['status']> = {
      'init': 'creating',
      'ready': 'ready',
      'stopped': 'ready',
      'error': 'failed',
      'deleting': 'deleting',
    };

    return statusMap[neonStatus] || 'ready';
  }

  private async performDatabaseMerge(
    sourceBranch: BranchInfo,
    targetBranch: BranchInfo,
    options: BranchMergeOptions
  ): Promise<{ success: boolean; conflictFiles?: string[] }> {
    // This is a simplified merge implementation
    // In a real system, this would:
    // 1. Compare schema differences between branches
    // 2. Generate migration scripts
    // 3. Apply migrations to target branch
    // 4. Handle conflicts and data consistency

    // For now, we'll just simulate a successful merge
    return {
      success: true,
      conflictFiles: [],
    };
  }

  // Database operations for storing branch metadata
  private async storeBranchInfo(branchInfo: BranchInfo): Promise<void> {
    // This would store branch metadata in your main database
    // For now, we'll just log it
    console.log('Storing branch info:', branchInfo.id);
  }

  private async getStoredBranchInfo(branchId: string): Promise<BranchInfo | null> {
    // This would retrieve branch metadata from your main database
    return null;
  }

  private async getUserStoredBranches(userId: string, projectId?: string): Promise<BranchInfo[]> {
    // This would retrieve user's branches from your main database
    return [];
  }

  private async removeStoredBranchInfo(branchId: string): Promise<void> {
    // This would remove branch metadata from your main database
    console.log('Removing branch info:', branchId);
  }

  private async updateBranchAccess(branchId: string): Promise<void> {
    // This would increment access count in your main database
    console.log('Updating branch access:', branchId);
  }

  private async getExpiredBranches(): Promise<BranchInfo[]> {
    // This would get expired branches from your main database
    return [];
  }
}

export const neonBranchManager = NeonBranchManager.getInstance();