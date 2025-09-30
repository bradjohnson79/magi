/**
 * Preview Branches Service
 *
 * Integrates with Neon MCP to create and manage database branches for preview environments.
 * This allows testing changes in isolated database environments before merging to production.
 */

import { withSpan, addSpanAttributes } from "@/lib/observability/otel";
import { prisma } from "@/lib/db";

interface CreateBranchOptions {
  projectId: string;
  branchName: string;
  description?: string;
  sourceBranch?: string;
}

interface PreviewBranch {
  id: string;
  projectId: string;
  branchName: string;
  neonBranchId: string;
  connectionString: string;
  previewUrl?: string;
  status: 'creating' | 'ready' | 'failed' | 'deleted';
  createdAt: Date;
  expiresAt?: Date;
}

export class PreviewBranchesService {
  private neonApiKey: string;
  private neonProjectId: string;
  private neonHost: string;

  constructor() {
    this.neonApiKey = process.env.NEON_API_KEY || '';
    this.neonProjectId = process.env.NEON_PROJECT_ID || '';
    this.neonHost = process.env.NEON_HOST || '';

    if (!this.neonApiKey || !this.neonProjectId) {
      console.warn('⚠️  Neon credentials not configured - preview branches will be disabled');
    }
  }

  /**
   * Create a new preview branch with Neon MCP integration
   */
  async createPreviewBranch(options: CreateBranchOptions): Promise<PreviewBranch> {
    return withSpan(
      'preview-branches.create',
      async (span) => {
        addSpanAttributes({
          'operation.type': 'preview_branch',
          'project.id': options.projectId,
          'branch.name': options.branchName,
        });

        try {
          // Validate inputs
          if (!options.projectId || !options.branchName) {
            throw new Error('Project ID and branch name are required');
          }

          // Check if project exists
          const project = await prisma.project.findUnique({
            where: { id: options.projectId }
          });

          if (!project) {
            throw new Error('Project not found');
          }

          // Generate unique branch name with timestamp
          const timestamp = Date.now();
          const safeBranchName = options.branchName
            .toLowerCase()
            .replace(/[^a-z0-9-]/g, '-')
            .substring(0, 50);
          const uniqueBranchName = `${safeBranchName}-${timestamp}`;

          // Create Neon branch using MCP-style API call
          const neonBranch = await this.createNeonBranch({
            name: uniqueBranchName,
            parent: options.sourceBranch || 'main',
            description: options.description || `Preview branch for ${options.branchName}`,
          });

          // Store branch information in database
          const previewBranch = await prisma.projectBranch.create({
            data: {
              projectId: options.projectId,
              branchName: uniqueBranchName,
              neonBranchId: neonBranch.id,
              connectionString: neonBranch.connectionString,
              status: 'creating',
              metadata: {
                description: options.description,
                sourceBranch: options.sourceBranch || 'main',
                createdBy: 'system', // Could be enhanced with user context
                neonDetails: neonBranch,
              },
              expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
            }
          });

          // Generate preview URL (would typically point to a preview deployment)
          const previewUrl = `https://preview-${uniqueBranchName}.magi-app.dev`;

          // Update with preview URL
          await prisma.projectBranch.update({
            where: { id: previewBranch.id },
            data: {
              previewUrl,
              status: 'ready',
            }
          });

          addSpanAttributes({
            'response.status': 'success',
            'branch.id': previewBranch.id,
            'neon.branch_id': neonBranch.id,
          });

          return {
            id: previewBranch.id,
            projectId: options.projectId,
            branchName: uniqueBranchName,
            neonBranchId: neonBranch.id,
            connectionString: neonBranch.connectionString,
            previewUrl,
            status: 'ready' as const,
            createdAt: previewBranch.createdAt,
            expiresAt: previewBranch.expiresAt,
          };

        } catch (error) {
          addSpanAttributes({
            'response.status': 'error',
            'error.message': error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        }
      }
    );
  }

  /**
   * Delete a preview branch and clean up resources
   */
  async deletePreviewBranch(branchId: string): Promise<void> {
    return withSpan(
      'preview-branches.delete',
      async (span) => {
        addSpanAttributes({
          'operation.type': 'preview_branch_delete',
          'branch.id': branchId,
        });

        try {
          // Get branch information
          const branch = await prisma.projectBranch.findUnique({
            where: { id: branchId }
          });

          if (!branch) {
            throw new Error('Preview branch not found');
          }

          // Delete Neon branch
          if (branch.neonBranchId) {
            try {
              await this.deleteNeonBranch(branch.neonBranchId);
            } catch (error) {
              console.warn('⚠️  Failed to delete Neon branch:', error);
              // Continue with cleanup even if Neon deletion fails
            }
          }

          // Update status to deleted
          await prisma.projectBranch.update({
            where: { id: branchId },
            data: {
              status: 'deleted',
              deletedAt: new Date(),
            }
          });

          addSpanAttributes({
            'response.status': 'success',
            'neon.branch_id': branch.neonBranchId,
          });

        } catch (error) {
          addSpanAttributes({
            'response.status': 'error',
            'error.message': error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        }
      }
    );
  }

  /**
   * List all preview branches for a project
   */
  async listPreviewBranches(projectId: string): Promise<PreviewBranch[]> {
    return withSpan(
      'preview-branches.list',
      async (span) => {
        addSpanAttributes({
          'operation.type': 'preview_branch_list',
          'project.id': projectId,
        });

        try {
          const branches = await prisma.projectBranch.findMany({
            where: {
              projectId,
              status: { not: 'deleted' }
            },
            orderBy: { createdAt: 'desc' }
          });

          addSpanAttributes({
            'response.status': 'success',
            'branches.count': branches.length,
          });

          return branches.map(branch => ({
            id: branch.id,
            projectId: branch.projectId,
            branchName: branch.branchName,
            neonBranchId: branch.neonBranchId,
            connectionString: branch.connectionString,
            previewUrl: branch.previewUrl,
            status: branch.status as 'creating' | 'ready' | 'failed' | 'deleted',
            createdAt: branch.createdAt,
            expiresAt: branch.expiresAt,
          }));

        } catch (error) {
          addSpanAttributes({
            'response.status': 'error',
            'error.message': error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        }
      }
    );
  }

  /**
   * Clean up expired preview branches
   */
  async cleanupExpiredBranches(): Promise<number> {
    return withSpan(
      'preview-branches.cleanup',
      async (span) => {
        addSpanAttributes({
          'operation.type': 'preview_branch_cleanup',
        });

        try {
          // Find expired branches
          const expiredBranches = await prisma.projectBranch.findMany({
            where: {
              expiresAt: { lt: new Date() },
              status: { not: 'deleted' }
            }
          });

          let cleanedCount = 0;

          // Delete each expired branch
          for (const branch of expiredBranches) {
            try {
              await this.deletePreviewBranch(branch.id);
              cleanedCount++;
            } catch (error) {
              console.error(`Failed to cleanup branch ${branch.id}:`, error);
            }
          }

          addSpanAttributes({
            'response.status': 'success',
            'expired.count': expiredBranches.length,
            'cleaned.count': cleanedCount,
          });

          return cleanedCount;

        } catch (error) {
          addSpanAttributes({
            'response.status': 'error',
            'error.message': error instanceof Error ? error.message : 'Unknown error',
          });
          throw error;
        }
      }
    );
  }

  /**
   * Create a Neon database branch via API
   */
  private async createNeonBranch(options: {
    name: string;
    parent: string;
    description?: string;
  }): Promise<{ id: string; connectionString: string }> {
    if (!this.neonApiKey) {
      throw new Error('Neon API key not configured');
    }

    try {
      // For now, simulate Neon MCP API call
      // In production, this would use the actual Neon API or MCP server
      const mockBranchId = `br_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const mockConnectionString = `postgresql://user:pass@${mockBranchId}.${this.neonHost}/neondb?sslmode=require`;

      // TODO: Replace with actual Neon MCP integration
      // const response = await fetch(`https://console.neon.tech/api/v2/projects/${this.neonProjectId}/branches`, {
      //   method: 'POST',
      //   headers: {
      //     'Authorization': `Bearer ${this.neonApiKey}`,
      //     'Content-Type': 'application/json',
      //   },
      //   body: JSON.stringify({
      //     name: options.name,
      //     parent_id: options.parent,
      //     description: options.description,
      //   }),
      // });

      console.log(`🔧 Created Neon branch: ${options.name} (mock)`);

      return {
        id: mockBranchId,
        connectionString: mockConnectionString,
      };

    } catch (error) {
      console.error('Failed to create Neon branch:', error);
      throw new Error('Failed to create database branch');
    }
  }

  /**
   * Delete a Neon database branch via API
   */
  private async deleteNeonBranch(branchId: string): Promise<void> {
    if (!this.neonApiKey) {
      throw new Error('Neon API key not configured');
    }

    try {
      // TODO: Replace with actual Neon MCP integration
      // const response = await fetch(`https://console.neon.tech/api/v2/projects/${this.neonProjectId}/branches/${branchId}`, {
      //   method: 'DELETE',
      //   headers: {
      //     'Authorization': `Bearer ${this.neonApiKey}`,
      //   },
      // });

      console.log(`🗑️  Deleted Neon branch: ${branchId} (mock)`);

    } catch (error) {
      console.error('Failed to delete Neon branch:', error);
      throw new Error('Failed to delete database branch');
    }
  }
}

// Export singleton instance
export const previewBranches = new PreviewBranchesService();