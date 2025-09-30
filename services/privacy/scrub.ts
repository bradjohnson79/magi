/**
 * Privacy and Governance Service
 *
 * Handles data scrubbing, consent management, and privacy compliance
 * for the self-evolution loop.
 */

import { prisma } from '@/lib/db';
import { redactSecretsFromObject } from '@/lib/utils/secretRedaction';

export interface ScrubConfig {
  respectUserConsent: boolean;
  deleteAfterDays?: number;
  preserveMetrics: boolean;
  logActions: boolean;
}

export interface ScrubResult {
  scrubbed: number;
  preserved: number;
  errors: string[];
  duration: number;
}

export interface ConsentStats {
  totalUsers: number;
  consentingUsers: number;
  consentRate: number;
  recentOptOuts: number;
}

export class PrivacyGovernanceService {
  private readonly config: ScrubConfig;

  constructor(config: Partial<ScrubConfig> = {}) {
    this.config = {
      respectUserConsent: true,
      preserveMetrics: true,
      logActions: true,
      ...config,
    };
  }

  /**
   * Scrub user data based on consent and retention policies
   */
  async scrubUserData(options: {
    userId?: string;
    dryRun?: boolean;
    force?: boolean;
  } = {}): Promise<ScrubResult> {
    const startTime = Date.now();
    const { userId, dryRun = false, force = false } = options;

    let scrubbed = 0;
    let preserved = 0;
    const errors: string[] = [];

    try {
      // Get users to process
      const users = await this.getUsersForScrubbing(userId, force);

      for (const user of users) {
        try {
          const userResult = await this.scrubSingleUser(user, dryRun);
          scrubbed += userResult.scrubbed;
          preserved += userResult.preserved;

          if (this.config.logActions && !dryRun) {
            await this.logScrubAction(user.id, userResult);
          }
        } catch (error) {
          const errorMsg = `Failed to scrub user ${user.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          errors.push(errorMsg);
          console.error(errorMsg);
        }
      }

      const duration = Date.now() - startTime;
      console.log(`Scrub operation completed in ${duration}ms. Scrubbed: ${scrubbed}, Preserved: ${preserved}`);

      return { scrubbed, preserved, errors, duration };

    } catch (error) {
      const errorMsg = `Scrub operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      errors.push(errorMsg);
      console.error(errorMsg);

      return {
        scrubbed,
        preserved,
        errors,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Get users that should have their data scrubbed
   */
  private async getUsersForScrubbing(userId?: string, force?: boolean) {
    const whereClause: any = {};

    if (userId) {
      whereClause.id = userId;
    } else {
      // Only process users who haven't consented or have expired retention
      whereClause.OR = [];

      if (!force && this.config.respectUserConsent) {
        whereClause.OR.push({ allowTraining: false });
      }

      if (this.config.deleteAfterDays) {
        const cutoffDate = new Date(Date.now() - this.config.deleteAfterDays * 24 * 60 * 60 * 1000);
        whereClause.OR.push({ createdAt: { lt: cutoffDate } });
      }

      // If no conditions and not forced, return empty
      if (whereClause.OR.length === 0 && !force) {
        return [];
      }
    }

    return await prisma.user.findMany({
      where: whereClause,
      select: {
        id: true,
        clerkId: true,
        allowTraining: true,
        createdAt: true,
      },
    });
  }

  /**
   * Scrub data for a single user
   */
  private async scrubSingleUser(
    user: { id: string; clerkId: string; allowTraining: boolean | null },
    dryRun: boolean
  ): Promise<{ scrubbed: number; preserved: number }> {
    let scrubbed = 0;
    let preserved = 0;

    // Get user's model runs
    const modelRuns = await prisma.modelRun.findMany({
      where: { userId: user.id },
      include: { feedback: true },
    });

    for (const run of modelRuns) {
      if (this.shouldPreserveRun(run, user)) {
        preserved++;
        continue;
      }

      if (!dryRun) {
        await this.scrubModelRun(run.id);
      }
      scrubbed++;
    }

    // Scrub feedback if user hasn't consented
    if (!user.allowTraining) {
      const feedbackCount = await prisma.feedback.count({
        where: { userId: user.id },
      });

      if (!dryRun && feedbackCount > 0) {
        await prisma.feedback.deleteMany({
          where: { userId: user.id },
        });
      }
      scrubbed += feedbackCount;
    }

    // Scrub telemetry events
    const telemetryCount = await prisma.telemetryEvent.count({
      where: { userId: user.id },
    });

    if (!dryRun && telemetryCount > 0) {
      await prisma.telemetryEvent.deleteMany({
        where: { userId: user.id },
      });
    }
    scrubbed += telemetryCount;

    return { scrubbed, preserved };
  }

  /**
   * Determine if a model run should be preserved
   */
  private shouldPreserveRun(
    run: any,
    user: { allowTraining: boolean | null }
  ): boolean {
    // Always preserve if user has consented and we're preserving metrics
    if (user.allowTraining && this.config.preserveMetrics) {
      return true;
    }

    // Preserve runs that are part of active metrics (recent successful runs)
    const isRecent = Date.now() - run.createdAt.getTime() < 7 * 24 * 60 * 60 * 1000;
    const isSuccessful = run.success;

    return this.config.preserveMetrics && isRecent && isSuccessful;
  }

  /**
   * Scrub sensitive data from a model run
   */
  private async scrubModelRun(runId: string): Promise<void> {
    await prisma.modelRun.update({
      where: { id: runId },
      data: {
        inputPayload: { scrubbed: true, timestamp: new Date().toISOString() },
        outputPayload: { scrubbed: true, timestamp: new Date().toISOString() },
        provenance: {
          scrubbed: true,
          originalId: runId,
          scrubbed_at: new Date().toISOString(),
        },
      },
    });
  }

  /**
   * Update user consent preferences
   */
  async updateUserConsent(
    userId: string,
    allowTraining: boolean,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      const user = await prisma.user.findFirst({
        where: { clerkId: userId },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      await prisma.user.update({
        where: { id: user.id },
        data: { allowTraining },
      });

      // Log consent change
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'consent_updated',
          userId: user.id,
          payload: redactSecretsFromObject({
            previousConsent: user.allowTraining,
            newConsent: allowTraining,
            reason: reason || 'user_request',
            timestamp: new Date().toISOString(),
          }),
        },
      });

      console.log(`Updated consent for user ${user.id}: allowTraining=${allowTraining}`);

      return {
        success: true,
        message: `Consent updated successfully. Training data usage: ${allowTraining ? 'enabled' : 'disabled'}`,
      };

    } catch (error) {
      console.error('Failed to update user consent:', error);
      return {
        success: false,
        message: `Failed to update consent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get consent statistics
   */
  async getConsentStats(): Promise<ConsentStats> {
    try {
      const totalUsers = await prisma.user.count();
      const consentingUsers = await prisma.user.count({
        where: { allowTraining: true },
      });

      // Get recent opt-outs (last 30 days)
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const recentOptOuts = await prisma.telemetryEvent.count({
        where: {
          eventType: 'consent_updated',
          createdAt: { gte: thirtyDaysAgo },
          payload: {
            path: ['newConsent'],
            equals: false,
          },
        },
      });

      const consentRate = totalUsers > 0 ? consentingUsers / totalUsers : 0;

      return {
        totalUsers,
        consentingUsers,
        consentRate: Math.round(consentRate * 100) / 100,
        recentOptOuts,
      };

    } catch (error) {
      console.error('Failed to get consent stats:', error);
      return {
        totalUsers: 0,
        consentingUsers: 0,
        consentRate: 0,
        recentOptOuts: 0,
      };
    }
  }

  /**
   * Export user data (GDPR compliance)
   */
  async exportUserData(userId: string): Promise<{
    success: boolean;
    data?: any;
    message: string;
  }> {
    try {
      const user = await prisma.user.findFirst({
        where: { clerkId: userId },
        include: {
          modelRuns: {
            include: { feedback: true },
            orderBy: { createdAt: 'desc' },
          },
          feedback: {
            include: { modelRun: true },
            orderBy: { createdAt: 'desc' },
          },
          telemetryEvents: {
            orderBy: { createdAt: 'desc' },
            take: 100, // Limit to recent events
          },
        },
      });

      if (!user) {
        return { success: false, message: 'User not found' };
      }

      // Redact sensitive information before export
      const exportData = {
        user: {
          id: user.id,
          clerkId: user.clerkId,
          name: user.name,
          email: user.email,
          allowTraining: user.allowTraining,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        modelRuns: user.modelRuns.map(run => ({
          id: run.id,
          success: run.success,
          confidence: run.confidence,
          costUsd: run.costUsd,
          runtimeMs: run.runtimeMs,
          createdAt: run.createdAt,
          feedbackCount: run.feedback.length,
          // Exclude potentially sensitive payloads
        })),
        feedback: user.feedback.map(fb => ({
          id: fb.id,
          rating: fb.rating,
          comment: fb.comment,
          hasCorrection: !!fb.correction,
          createdAt: fb.createdAt,
        })),
        telemetryEvents: user.telemetryEvents.map(event => ({
          eventType: event.eventType,
          createdAt: event.createdAt,
          // Exclude payload to prevent sensitive data exposure
        })),
        exportMetadata: {
          exportedAt: new Date().toISOString(),
          version: '1.0',
          totalModelRuns: user.modelRuns.length,
          totalFeedback: user.feedback.length,
        },
      };

      // Log export request
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'data_export_requested',
          userId: user.id,
          payload: {
            exportedAt: new Date().toISOString(),
            recordCount: {
              modelRuns: user.modelRuns.length,
              feedback: user.feedback.length,
              telemetryEvents: user.telemetryEvents.length,
            },
          },
        },
      });

      return {
        success: true,
        data: exportData,
        message: 'Data exported successfully',
      };

    } catch (error) {
      console.error('Failed to export user data:', error);
      return {
        success: false,
        message: `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Log scrub action for audit trail
   */
  private async logScrubAction(
    userId: string,
    result: { scrubbed: number; preserved: number }
  ): Promise<void> {
    try {
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'data_scrubbed',
          userId,
          payload: redactSecretsFromObject({
            ...result,
            timestamp: new Date().toISOString(),
            config: {
              respectUserConsent: this.config.respectUserConsent,
              preserveMetrics: this.config.preserveMetrics,
              deleteAfterDays: this.config.deleteAfterDays,
            },
          }),
        },
      });
    } catch (error) {
      console.error('Failed to log scrub action:', error);
    }
  }

  /**
   * Get governance metrics
   */
  async getGovernanceMetrics(): Promise<{
    consentStats: ConsentStats;
    recentScrubs: number;
    dataRetentionCompliance: number;
    exportRequests: number;
  }> {
    const consentStats = await this.getConsentStats();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const recentScrubs = await prisma.telemetryEvent.count({
      where: {
        eventType: 'data_scrubbed',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    const exportRequests = await prisma.telemetryEvent.count({
      where: {
        eventType: 'data_export_requested',
        createdAt: { gte: thirtyDaysAgo },
      },
    });

    // Calculate data retention compliance (simplified)
    const totalUsers = await prisma.user.count();
    const usersWithOldData = this.config.deleteAfterDays
      ? await prisma.user.count({
          where: {
            createdAt: {
              lt: new Date(Date.now() - this.config.deleteAfterDays * 24 * 60 * 60 * 1000),
            },
            allowTraining: false,
          },
        })
      : 0;

    const dataRetentionCompliance = totalUsers > 0
      ? Math.round(((totalUsers - usersWithOldData) / totalUsers) * 100) / 100
      : 1.0;

    return {
      consentStats,
      recentScrubs,
      dataRetentionCompliance,
      exportRequests,
    };
  }
}

// Export singleton instance
export const privacyGovernanceService = new PrivacyGovernanceService();

/**
 * Convenience functions for common operations
 */
export async function scrubNonConsentingUsers(dryRun: boolean = false): Promise<ScrubResult> {
  return await privacyGovernanceService.scrubUserData({ dryRun });
}

export async function updateUserTrainingConsent(
  userId: string,
  allowTraining: boolean,
  reason?: string
): Promise<{ success: boolean; message: string }> {
  return await privacyGovernanceService.updateUserConsent(userId, allowTraining, reason);
}

export async function exportUserDataRequest(userId: string) {
  return await privacyGovernanceService.exportUserData(userId);
}