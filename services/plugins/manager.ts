/**
 * Plugin Manager Service
 *
 * Handles plugin lifecycle management, installation, configuration,
 * health monitoring, and execution tracking.
 */

import { prisma } from '@/lib/prisma';
import { PluginManifest, PluginValidator, PluginRegistryEntry } from './schema';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface PluginInstallationOptions {
  source: 'marketplace' | 'local' | 'git' | 'npm';
  sourceUrl?: string;
  autoEnable?: boolean;
  config?: Record<string, any>;
}

export interface PluginListOptions {
  enabled?: boolean;
  category?: string;
  capabilities?: string[];
  search?: string;
  installedBy?: string;
  limit?: number;
  offset?: number;
}

export interface PluginHealthCheck {
  status: 'healthy' | 'warning' | 'error' | 'unknown';
  issues: string[];
  lastChecked: Date;
  metadata?: Record<string, any>;
}

export interface PluginUsageStats {
  executions: number;
  lastUsed?: Date;
  averageExecutionTime: number;
  errorRate: number;
  totalCost: number;
}

export class PluginManager {
  private static instance: PluginManager;

  public static getInstance(): PluginManager {
    if (!PluginManager.instance) {
      PluginManager.instance = new PluginManager();
    }
    return PluginManager.instance;
  }

  /**
   * Install a new plugin
   */
  async installPlugin(
    manifest: PluginManifest,
    installedBy: string,
    options: PluginInstallationOptions = { source: 'local' }
  ): Promise<PluginRegistryEntry> {
    return withSpan('plugin_manager.install', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_install',
        [SPAN_ATTRIBUTES.USER_ID]: installedBy,
        'plugin.name': manifest.name,
        'plugin.version': manifest.version,
        'plugin.source': options.source,
      });

      // Validate manifest
      const validatedManifest = PluginValidator.validateManifest(manifest);

      // Check if plugin already exists
      const existingPlugin = await prisma.plugin.findUnique({
        where: { name: validatedManifest.name },
      });

      if (existingPlugin) {
        throw new Error(`Plugin '${validatedManifest.name}' is already installed`);
      }

      // Install plugin
      const plugin = await prisma.plugin.create({
        data: {
          name: validatedManifest.name,
          displayName: validatedManifest.displayName,
          version: validatedManifest.version,
          description: validatedManifest.description,
          author: validatedManifest.author,
          category: validatedManifest.category,
          manifest: validatedManifest as any,
          config: options.config || {},
          enabled: options.autoEnable || false,
          installedBy,
          source: options.source,
          sourceUrl: options.sourceUrl,
          metadata: {
            installation: {
              installedAt: new Date().toISOString(),
              installedBy,
              version: validatedManifest.version,
              source: options.source,
              sourceUrl: options.sourceUrl,
            },
          },
        },
      });

      // Run installation hook if present
      if (validatedManifest.hooks.install) {
        await this.executeHook(plugin.id, 'install', {});
      }

      // Perform initial health check
      await this.checkPluginHealth(plugin.id);

      addSpanAttributes(span, {
        'plugin.id': plugin.id,
        'plugin.enabled': plugin.enabled,
      });

      return this.formatPluginRegistryEntry(plugin);
    });
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string, uninstalledBy: string): Promise<void> {
    return withSpan('plugin_manager.uninstall', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_uninstall',
        [SPAN_ATTRIBUTES.USER_ID]: uninstalledBy,
        'plugin.id': pluginId,
      });

      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
      });

      if (!plugin) {
        throw new Error('Plugin not found');
      }

      const manifest = plugin.manifest as PluginManifest;

      // Run uninstall hook if present
      if (manifest.hooks.uninstall) {
        await this.executeHook(pluginId, 'uninstall', {});
      }

      // Delete plugin and all related data
      await prisma.plugin.delete({
        where: { id: pluginId },
      });

      addSpanAttributes(span, {
        'plugin.name': plugin.name,
        'plugin.version': plugin.version,
      });
    });
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(pluginId: string, enabledBy: string): Promise<PluginRegistryEntry> {
    return withSpan('plugin_manager.enable', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_enable',
        [SPAN_ATTRIBUTES.USER_ID]: enabledBy,
        'plugin.id': pluginId,
      });

      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
      });

      if (!plugin) {
        throw new Error('Plugin not found');
      }

      if (plugin.enabled) {
        throw new Error('Plugin is already enabled');
      }

      const manifest = plugin.manifest as PluginManifest;

      // Run enable hook if present
      if (manifest.hooks.enable) {
        await this.executeHook(pluginId, 'enable', {});
      }

      // Update plugin status
      const updatedPlugin = await prisma.plugin.update({
        where: { id: pluginId },
        data: {
          enabled: true,
          updatedAt: new Date(),
        },
      });

      // Perform health check after enabling
      await this.checkPluginHealth(pluginId);

      return this.formatPluginRegistryEntry(updatedPlugin);
    });
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(pluginId: string, disabledBy: string): Promise<PluginRegistryEntry> {
    return withSpan('plugin_manager.disable', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_disable',
        [SPAN_ATTRIBUTES.USER_ID]: disabledBy,
        'plugin.id': pluginId,
      });

      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
      });

      if (!plugin) {
        throw new Error('Plugin not found');
      }

      if (!plugin.enabled) {
        throw new Error('Plugin is already disabled');
      }

      const manifest = plugin.manifest as PluginManifest;

      // Run disable hook if present
      if (manifest.hooks.disable) {
        await this.executeHook(pluginId, 'disable', {});
      }

      // Update plugin status
      const updatedPlugin = await prisma.plugin.update({
        where: { id: pluginId },
        data: {
          enabled: false,
          updatedAt: new Date(),
        },
      });

      return this.formatPluginRegistryEntry(updatedPlugin);
    });
  }

  /**
   * List plugins with filtering
   */
  async listPlugins(options: PluginListOptions = {}): Promise<{
    plugins: PluginRegistryEntry[];
    total: number;
    hasMore: boolean;
  }> {
    return withSpan('plugin_manager.list', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_list',
        'filter.enabled': options.enabled?.toString() || 'all',
        'filter.category': options.category || 'all',
        'options.limit': options.limit || 20,
      });

      const where: any = {};

      if (options.enabled !== undefined) {
        where.enabled = options.enabled;
      }

      if (options.category) {
        where.category = options.category;
      }

      if (options.installedBy) {
        where.installedBy = options.installedBy;
      }

      if (options.search) {
        where.OR = [
          { name: { contains: options.search, mode: 'insensitive' } },
          { displayName: { contains: options.search, mode: 'insensitive' } },
          { description: { contains: options.search, mode: 'insensitive' } },
          { author: { contains: options.search, mode: 'insensitive' } },
        ];
      }

      if (options.capabilities && options.capabilities.length > 0) {
        where.manifest = {
          path: ['capabilities'],
          array_contains: options.capabilities,
        };
      }

      const limit = Math.min(options.limit || 20, 100);
      const offset = options.offset || 0;

      const [plugins, total] = await Promise.all([
        prisma.plugin.findMany({
          where,
          orderBy: [
            { enabled: 'desc' },
            { lastUsed: 'desc' },
            { createdAt: 'desc' },
          ],
          take: limit,
          skip: offset,
        }),
        prisma.plugin.count({ where }),
      ]);

      const formattedPlugins = plugins.map(plugin => this.formatPluginRegistryEntry(plugin));

      addSpanAttributes(span, {
        'plugins.count': plugins.length,
        'plugins.total': total,
      });

      return {
        plugins: formattedPlugins,
        total,
        hasMore: offset + plugins.length < total,
      };
    });
  }

  /**
   * Get a specific plugin
   */
  async getPlugin(pluginId: string): Promise<PluginRegistryEntry | null> {
    return withSpan('plugin_manager.get', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_get',
        'plugin.id': pluginId,
      });

      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
      });

      if (!plugin) {
        return null;
      }

      return this.formatPluginRegistryEntry(plugin);
    });
  }

  /**
   * Update plugin configuration
   */
  async updatePluginConfig(
    pluginId: string,
    config: Record<string, any>,
    updatedBy: string
  ): Promise<PluginRegistryEntry> {
    return withSpan('plugin_manager.update_config', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_config_update',
        [SPAN_ATTRIBUTES.USER_ID]: updatedBy,
        'plugin.id': pluginId,
      });

      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
      });

      if (!plugin) {
        throw new Error('Plugin not found');
      }

      // Validate configuration against manifest
      const manifest = plugin.manifest as PluginManifest;
      this.validatePluginConfig(config, manifest);

      const updatedPlugin = await prisma.plugin.update({
        where: { id: pluginId },
        data: {
          config,
          updatedAt: new Date(),
        },
      });

      return this.formatPluginRegistryEntry(updatedPlugin);
    });
  }

  /**
   * Check plugin health
   */
  async checkPluginHealth(pluginId: string): Promise<PluginHealthCheck> {
    return withSpan('plugin_manager.health_check', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_health_check',
        'plugin.id': pluginId,
      });

      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
      });

      if (!plugin) {
        throw new Error('Plugin not found');
      }

      const manifest = plugin.manifest as PluginManifest;
      const issues: string[] = [];
      let status: 'healthy' | 'warning' | 'error' | 'unknown' = 'healthy';

      try {
        // Check plugin dependencies
        if (manifest.dependencies.system?.length > 0) {
          // Validate system dependencies
          for (const dep of manifest.dependencies.system) {
            // Basic validation - in real implementation, check if system tools exist
            if (!dep) {
              issues.push(`Invalid system dependency: ${dep}`);
            }
          }
        }

        // Check agent configuration
        if (manifest.agent.type === 'webhook' && !manifest.agent.endpoint) {
          issues.push('Webhook agent requires endpoint configuration');
        }

        // Check permissions
        if (manifest.permissions.fileSystem.write.length > 0 && !plugin.enabled) {
          issues.push('Plugin has file write permissions but is disabled');
        }

        // Check recent error rate
        if (plugin.errorRate > 0.1) {
          issues.push(`High error rate: ${(plugin.errorRate * 100).toFixed(1)}%`);
          status = 'warning';
        }

        if (plugin.errorRate > 0.5) {
          status = 'error';
        }

        // Check if plugin has been used recently
        if (plugin.enabled && plugin.lastUsed) {
          const daysSinceLastUse = (Date.now() - new Date(plugin.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceLastUse > 30) {
            issues.push('Plugin has not been used in over 30 days');
            status = status === 'healthy' ? 'warning' : status;
          }
        }

        if (issues.length > 5) {
          status = 'error';
        } else if (issues.length > 0 && status === 'healthy') {
          status = 'warning';
        }

      } catch (error) {
        issues.push(`Health check failed: ${(error as Error).message}`);
        status = 'error';
      }

      const healthCheck: PluginHealthCheck = {
        status,
        issues,
        lastChecked: new Date(),
      };

      // Update plugin health status
      await prisma.plugin.update({
        where: { id: pluginId },
        data: {
          healthStatus: status,
          healthCheckedAt: new Date(),
        },
      });

      addSpanAttributes(span, {
        'health.status': status,
        'health.issues_count': issues.length,
      });

      return healthCheck;
    });
  }

  /**
   * Get plugin usage statistics
   */
  async getPluginUsageStats(pluginId: string): Promise<PluginUsageStats> {
    return withSpan('plugin_manager.usage_stats', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_usage_stats',
        'plugin.id': pluginId,
      });

      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
      });

      if (!plugin) {
        throw new Error('Plugin not found');
      }

      // Get detailed execution stats
      const executionStats = await prisma.pluginExecution.aggregate({
        where: { pluginId },
        _count: { id: true },
        _avg: { executionTime: true, cost: true },
      });

      const errorCount = await prisma.pluginExecution.count({
        where: {
          pluginId,
          status: 'error',
        },
      });

      const totalCost = await prisma.pluginExecution.aggregate({
        where: { pluginId },
        _sum: { cost: true },
      });

      const stats: PluginUsageStats = {
        executions: executionStats._count.id,
        lastUsed: plugin.lastUsed ? new Date(plugin.lastUsed) : undefined,
        averageExecutionTime: executionStats._avg.executionTime || 0,
        errorRate: executionStats._count.id > 0 ? errorCount / executionStats._count.id : 0,
        totalCost: totalCost._sum.cost || 0,
      };

      addSpanAttributes(span, {
        'stats.executions': stats.executions,
        'stats.error_rate': stats.errorRate,
        'stats.total_cost': stats.totalCost,
      });

      return stats;
    });
  }

  /**
   * Update plugin usage metrics after execution
   */
  async updatePluginMetrics(
    pluginId: string,
    executionTime: number,
    success: boolean,
    cost?: number
  ): Promise<void> {
    return withSpan('plugin_manager.update_metrics', async (span) => {
      const plugin = await prisma.plugin.findUnique({
        where: { id: pluginId },
      });

      if (!plugin) {
        return;
      }

      const newExecutions = plugin.executions + 1;
      const newAvgTime = (plugin.avgExecutionTime * plugin.executions + executionTime) / newExecutions;
      const errors = success ? 0 : 1;
      const newErrorRate = (plugin.errorRate * plugin.executions + errors) / newExecutions;

      await prisma.plugin.update({
        where: { id: pluginId },
        data: {
          executions: newExecutions,
          avgExecutionTime: newAvgTime,
          errorRate: newErrorRate,
          lastUsed: new Date(),
        },
      });

      addSpanAttributes(span, {
        'plugin.id': pluginId,
        'execution.time': executionTime,
        'execution.success': success,
        'execution.cost': cost || 0,
      });
    });
  }

  /**
   * Private helper methods
   */
  private formatPluginRegistryEntry(plugin: any): PluginRegistryEntry {
    return {
      id: plugin.id,
      manifest: plugin.manifest as PluginManifest,
      status: plugin.enabled ? 'enabled' : 'disabled',
      installation: {
        installedAt: plugin.installedAt.toISOString(),
        installedBy: plugin.installedBy,
        version: plugin.version,
        source: plugin.source as any,
        sourceUrl: plugin.sourceUrl,
      },
      usage: {
        executions: plugin.executions,
        lastUsed: plugin.lastUsed?.toISOString(),
        averageExecutionTime: plugin.avgExecutionTime,
        errorRate: plugin.errorRate,
      },
      health: {
        status: plugin.healthStatus as any,
        lastChecked: plugin.healthCheckedAt?.toISOString(),
        issues: [],
      },
    };
  }

  private async executeHook(pluginId: string, hook: string, context: Record<string, any>): Promise<void> {
    // Plugin hook execution would be implemented here
    // For now, just log the hook execution
    console.log(`Executing ${hook} hook for plugin ${pluginId}`, context);
  }

  private validatePluginConfig(config: Record<string, any>, manifest: PluginManifest): void {
    // Validate configuration against manifest schema
    // This is a simplified validation - in real implementation,
    // validate against the plugin's configuration schema
    for (const [key, value] of Object.entries(config)) {
      if (typeof value === 'undefined') {
        throw new Error(`Configuration value for '${key}' cannot be undefined`);
      }
    }
  }
}

export const pluginManager = PluginManager.getInstance();