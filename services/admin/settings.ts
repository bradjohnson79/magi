/**
 * Admin Settings Service
 *
 * Manages administrative settings including stack rules, feature flags,
 * and platform configurations with proper access control and auditing.
 */

import { prisma } from '@/lib/prisma';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { ProjectCategory } from '@/services/orch/classifier';
import { RecommendedStack } from '@/services/orch/recommender';

export interface AdminSettingCreate {
  key: string;
  value: any;
  type?: string;
  category?: string;
  description?: string;
  isActive?: boolean;
  priority?: number;
  conditions?: any;
  createdBy: string;
}

export interface AdminSettingUpdate {
  value?: any;
  type?: string;
  description?: string;
  isActive?: boolean;
  priority?: number;
  conditions?: any;
  updatedBy: string;
}

export interface StackRuleCreate {
  category: ProjectCategory;
  name: string;
  stack: RecommendedStack;
  priority?: number;
  conditions?: {
    userPlan?: string | string[];
    teamSize?: { min?: number; max?: number };
    requirements?: string[];
  };
  description?: string;
  createdBy: string;
}

export class AdminSettingsService {
  private static instance: AdminSettingsService;

  public static getInstance(): AdminSettingsService {
    if (!AdminSettingsService.instance) {
      AdminSettingsService.instance = new AdminSettingsService();
    }
    return AdminSettingsService.instance;
  }

  /**
   * Create a new admin setting
   */
  async createSetting(data: AdminSettingCreate): Promise<any> {
    return withSpan('admin_settings.create', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_setting_create',
          [SPAN_ATTRIBUTES.USER_ID]: data.createdBy,
          'setting.key': data.key,
          'setting.category': data.category || 'general',
        });

        // Validate admin permissions
        await this.validateAdminPermissions(data.createdBy);

        // Create the setting
        const setting = await prisma.adminSetting.create({
          data: {
            key: data.key,
            value: data.value,
            type: data.type || 'json',
            category: data.category || 'general',
            description: data.description,
            isActive: data.isActive ?? true,
            priority: data.priority || 0,
            conditions: data.conditions || {},
            createdBy: data.createdBy,
          },
        });

        // Log the creation
        await auditLogger.log({
          userId: data.createdBy,
          action: 'admin.setting_created',
          resource: 'admin_setting',
          resourceId: setting.id,
          details: {
            key: setting.key,
            category: setting.category,
            priority: setting.priority,
          },
          metadata: {
            settingType: setting.type,
            hasConditions: Object.keys(setting.conditions as any).length > 0,
          },
          severity: 'info',
          outcome: 'success',
        });

        return setting;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Update an existing admin setting
   */
  async updateSetting(id: string, data: AdminSettingUpdate): Promise<any> {
    return withSpan('admin_settings.update', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_setting_update',
          [SPAN_ATTRIBUTES.USER_ID]: data.updatedBy,
          'setting.id': id,
        });

        // Validate admin permissions
        await this.validateAdminPermissions(data.updatedBy);

        // Get existing setting for audit trail
        const existingSetting = await prisma.adminSetting.findUnique({
          where: { id },
        });

        if (!existingSetting) {
          throw new Error('Admin setting not found');
        }

        // Update the setting
        const updatedSetting = await prisma.adminSetting.update({
          where: { id },
          data: {
            ...data,
            updatedAt: new Date(),
          },
        });

        // Log the update
        await auditLogger.log({
          userId: data.updatedBy,
          action: 'admin.setting_updated',
          resource: 'admin_setting',
          resourceId: id,
          details: {
            key: updatedSetting.key,
            category: updatedSetting.category,
            changes: this.calculateChanges(existingSetting, updatedSetting),
          },
          metadata: {
            previousValue: existingSetting.value,
            newValue: updatedSetting.value,
          },
          severity: 'info',
          outcome: 'success',
        });

        return updatedSetting;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Delete an admin setting
   */
  async deleteSetting(id: string, deletedBy: string): Promise<void> {
    return withSpan('admin_settings.delete', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'admin_setting_delete',
          [SPAN_ATTRIBUTES.USER_ID]: deletedBy,
          'setting.id': id,
        });

        // Validate admin permissions
        await this.validateAdminPermissions(deletedBy);

        // Get setting for audit trail
        const setting = await prisma.adminSetting.findUnique({
          where: { id },
        });

        if (!setting) {
          throw new Error('Admin setting not found');
        }

        // Delete the setting
        await prisma.adminSetting.delete({
          where: { id },
        });

        // Log the deletion
        await auditLogger.log({
          userId: deletedBy,
          action: 'admin.setting_deleted',
          resource: 'admin_setting',
          resourceId: id,
          details: {
            key: setting.key,
            category: setting.category,
            deletedValue: setting.value,
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
   * Get admin settings by category
   */
  async getSettingsByCategory(category: string): Promise<any[]> {
    return withSpan('admin_settings.get_by_category', async () => {
      return await prisma.adminSetting.findMany({
        where: { category },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
          updater: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });
  }

  /**
   * Create a stack rule override
   */
  async createStackRule(data: StackRuleCreate): Promise<any> {
    const key = `stack_override_${data.category}_${data.name.toLowerCase().replace(/\s+/g, '_')}`;

    return this.createSetting({
      key,
      value: data.stack,
      type: 'stack_rule',
      category: 'stack_rules',
      description: data.description || `Stack rule for ${data.category}: ${data.name}`,
      priority: data.priority || 0,
      conditions: data.conditions || {},
      createdBy: data.createdBy,
    });
  }

  /**
   * Get all stack rules
   */
  async getStackRules(): Promise<any[]> {
    return this.getSettingsByCategory('stack_rules');
  }

  /**
   * Get stack rules for a specific category
   */
  async getStackRulesForCategory(category: ProjectCategory): Promise<any[]> {
    return withSpan('admin_settings.get_stack_rules_for_category', async () => {
      return await prisma.adminSetting.findMany({
        where: {
          category: 'stack_rules',
          key: {
            startsWith: `stack_override_${category}`,
          },
          isActive: true,
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' },
        ],
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });
    });
  }

  /**
   * Validate that the user has admin permissions
   */
  private async validateAdminPermissions(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== 'admin') {
      throw new Error('Insufficient permissions: Admin role required');
    }
  }

  /**
   * Calculate changes between old and new settings
   */
  private calculateChanges(oldSetting: any, newSetting: any): string[] {
    const changes: string[] = [];

    if (oldSetting.value !== newSetting.value) {
      changes.push('value');
    }
    if (oldSetting.isActive !== newSetting.isActive) {
      changes.push('isActive');
    }
    if (oldSetting.priority !== newSetting.priority) {
      changes.push('priority');
    }
    if (JSON.stringify(oldSetting.conditions) !== JSON.stringify(newSetting.conditions)) {
      changes.push('conditions');
    }
    if (oldSetting.description !== newSetting.description) {
      changes.push('description');
    }

    return changes;
  }

  /**
   * Export all settings for backup
   */
  async exportSettings(): Promise<any[]> {
    return withSpan('admin_settings.export', async () => {
      return await prisma.adminSetting.findMany({
        include: {
          creator: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: [
          { category: 'asc' },
          { key: 'asc' },
        ],
      });
    });
  }

  /**
   * Import settings from backup
   */
  async importSettings(settings: any[], importedBy: string): Promise<{ imported: number; skipped: number; errors: string[] }> {
    return withSpan('admin_settings.import', async (span) => {
      try {
        // Validate admin permissions
        await this.validateAdminPermissions(importedBy);

        let imported = 0;
        let skipped = 0;
        const errors: string[] = [];

        for (const setting of settings) {
          try {
            // Check if setting already exists
            const existing = await prisma.adminSetting.findUnique({
              where: { key: setting.key },
            });

            if (existing) {
              skipped++;
              continue;
            }

            // Create new setting
            await this.createSetting({
              key: setting.key,
              value: setting.value,
              type: setting.type,
              category: setting.category,
              description: setting.description,
              isActive: setting.isActive,
              priority: setting.priority,
              conditions: setting.conditions,
              createdBy: importedBy,
            });

            imported++;
          } catch (error) {
            errors.push(`Failed to import ${setting.key}: ${(error as Error).message}`);
          }
        }

        addSpanAttributes(span, {
          'import.total': settings.length,
          'import.imported': imported,
          'import.skipped': skipped,
          'import.errors': errors.length,
        });

        // Log the import operation
        await auditLogger.log({
          userId: importedBy,
          action: 'admin.settings_imported',
          resource: 'admin_settings',
          details: {
            total: settings.length,
            imported,
            skipped,
            errorCount: errors.length,
          },
          severity: 'info',
          outcome: errors.length === 0 ? 'success' : 'partial_success',
        });

        return { imported, skipped, errors };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }
}

export const adminSettingsService = AdminSettingsService.getInstance();