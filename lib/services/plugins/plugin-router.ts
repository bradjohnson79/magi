import { PluginLoader } from './plugin-loader';
import { MarketplaceService } from '@/lib/services/marketplace';
import {
  PluginContext,
  PluginExecutionResult,
  ExecutePluginRequest,
  MarketplaceInstallation,
  PluginManifest
} from '@/lib/types/marketplace';

export class PluginRouter {
  private static instance: PluginRouter;
  private pluginLoader: PluginLoader;
  private marketplaceService: MarketplaceService;

  constructor() {
    this.pluginLoader = PluginLoader.getInstance();
    this.marketplaceService = MarketplaceService.getInstance();
  }

  static getInstance(): PluginRouter {
    if (!PluginRouter.instance) {
      PluginRouter.instance = new PluginRouter();
    }
    return PluginRouter.instance;
  }

  /**
   * Execute plugin by installation ID
   */
  async executePlugin(
    userId: string,
    request: ExecutePluginRequest
  ): Promise<PluginExecutionResult> {
    try {
      // Get installation and verify ownership
      const installation = await this.getAndVerifyInstallation(
        request.installationId,
        userId,
        request.projectId
      );

      // Create plugin context
      const context = await this.createPluginContext(userId, request.projectId);

      // Execute plugin
      const result = await this.pluginLoader.executePlugin(
        installation,
        request.inputs,
        context
      );

      // Update usage statistics
      await this.updateUsageStats(installation.id);

      return result;
    } catch (error) {
      console.error('Error executing plugin:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Route task to appropriate plugin based on task type and inputs
   */
  async routeTask(
    userId: string,
    projectId: string,
    taskType: string,
    inputs: Record<string, any>
  ): Promise<PluginExecutionResult> {
    try {
      // Find matching plugins for the task
      const matchingPlugins = await this.findMatchingPlugins(
        userId,
        projectId,
        taskType,
        inputs
      );

      if (matchingPlugins.length === 0) {
        return {
          success: false,
          error: `No plugins found for task type: ${taskType}`
        };
      }

      // Use the best matching plugin (first one for now)
      const bestPlugin = matchingPlugins[0];

      // Execute the plugin
      return this.executePlugin(userId, {
        installationId: bestPlugin.installation.id,
        inputs,
        projectId
      });
    } catch (error) {
      console.error('Error routing task:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get available plugins for a user/project
   */
  async getAvailablePlugins(
    userId: string,
    projectId?: string
  ): Promise<AvailablePlugin[]> {
    try {
      const installations = await this.marketplaceService.getUserInstallations(
        userId,
        projectId
      );

      const availablePlugins: AvailablePlugin[] = [];

      for (const installation of installations) {
        if (!installation.isActive) continue;

        const item = await this.marketplaceService.getItemById(installation.itemId);
        if (!item || item.type !== 'plugin') continue;

        const manifest = item.manifest as PluginManifest;

        availablePlugins.push({
          installation,
          manifest,
          capabilities: this.extractCapabilities(manifest),
          lastUsed: installation.lastUsedAt,
          usageCount: installation.usageCount
        });
      }

      return availablePlugins.sort((a, b) => {
        // Sort by usage count and last used
        if (a.usageCount !== b.usageCount) {
          return b.usageCount - a.usageCount;
        }

        if (a.lastUsed && b.lastUsed) {
          return b.lastUsed.getTime() - a.lastUsed.getTime();
        }

        return 0;
      });
    } catch (error) {
      console.error('Error getting available plugins:', error);
      throw new Error('Failed to get available plugins');
    }
  }

  /**
   * Match task requirements to plugin capabilities
   */
  async matchTaskToPlugins(
    userId: string,
    projectId: string,
    taskRequirements: TaskRequirements
  ): Promise<PluginMatch[]> {
    try {
      const availablePlugins = await this.getAvailablePlugins(userId, projectId);
      const matches: PluginMatch[] = [];

      for (const plugin of availablePlugins) {
        const score = this.calculateMatchScore(taskRequirements, plugin);

        if (score > 0) {
          matches.push({
            plugin,
            score,
            confidence: this.calculateConfidence(score, plugin)
          });
        }
      }

      return matches.sort((a, b) => b.score - a.score);
    } catch (error) {
      console.error('Error matching task to plugins:', error);
      throw new Error('Failed to match task to plugins');
    }
  }

  /**
   * Register plugin event handlers
   */
  registerPluginHandler(
    eventType: string,
    handler: PluginEventHandler
  ): void {
    // Plugin event handling would be implemented here
    // This allows plugins to respond to system events
  }

  /**
   * Dispatch event to relevant plugins
   */
  async dispatchEvent(
    userId: string,
    projectId: string,
    eventType: string,
    eventData: any
  ): Promise<void> {
    try {
      const availablePlugins = await this.getAvailablePlugins(userId, projectId);

      // Find plugins that handle this event type
      const handlerPlugins = availablePlugins.filter(plugin =>
        this.pluginHandlesEvent(plugin.manifest, eventType)
      );

      // Execute handlers in parallel
      const promises = handlerPlugins.map(plugin =>
        this.executePluginHandler(plugin.installation, eventType, eventData, userId, projectId)
      );

      await Promise.allSettled(promises);
    } catch (error) {
      console.error('Error dispatching event:', error);
    }
  }

  /**
   * Private helper methods
   */
  private async getAndVerifyInstallation(
    installationId: string,
    userId: string,
    projectId?: string
  ): Promise<MarketplaceInstallation> {
    const installations = await this.marketplaceService.getUserInstallations(userId, projectId);

    const installation = installations.find(inst => inst.id === installationId);

    if (!installation) {
      throw new Error('Plugin installation not found or access denied');
    }

    if (!installation.isActive) {
      throw new Error('Plugin installation is not active');
    }

    return installation;
  }

  private async createPluginContext(
    userId: string,
    projectId?: string
  ): Promise<Partial<PluginContext>> {
    // This would integrate with your user and project services
    // For now, return mock context

    return {
      user: {
        id: userId,
        name: 'Test User',
        email: 'test@example.com'
      },
      project: projectId ? {
        id: projectId,
        name: 'Test Project',
        path: `/projects/${projectId}`
      } : undefined
    };
  }

  private async updateUsageStats(installationId: string): Promise<void> {
    // Update usage statistics in database
    // This helps with plugin recommendations and analytics
  }

  private async findMatchingPlugins(
    userId: string,
    projectId: string,
    taskType: string,
    inputs: Record<string, any>
  ): Promise<{ installation: MarketplaceInstallation; manifest: PluginManifest; score: number }[]> {
    const availablePlugins = await this.getAvailablePlugins(userId, projectId);
    const matches: { installation: MarketplaceInstallation; manifest: PluginManifest; score: number }[] = [];

    for (const plugin of availablePlugins) {
      const score = this.scorePluginForTask(plugin.manifest, taskType, inputs);

      if (score > 0) {
        matches.push({
          installation: plugin.installation,
          manifest: plugin.manifest,
          score
        });
      }
    }

    return matches.sort((a, b) => b.score - a.score);
  }

  private scorePluginForTask(
    manifest: PluginManifest,
    taskType: string,
    inputs: Record<string, any>
  ): number {
    let score = 0;

    // Check if plugin category matches task type
    if (manifest.category === taskType) {
      score += 50;
    }

    // Check if plugin tags match task type
    if (manifest.tags.includes(taskType)) {
      score += 30;
    }

    // Check if plugin can handle the required inputs
    const inputCompatibility = this.checkInputCompatibility(manifest.inputs, inputs);
    score += inputCompatibility * 20;

    // Bonus for well-documented plugins
    if (manifest.documentation) {
      score += 5;
    }

    // Penalty for high-risk permissions
    if (manifest.permissions.some(p => p.includes('execute:') || p.includes('delete'))) {
      score -= 10;
    }

    return Math.max(0, score);
  }

  private checkInputCompatibility(
    pluginInputs: Record<string, any>,
    taskInputs: Record<string, any>
  ): number {
    const pluginInputNames = Object.keys(pluginInputs);
    const taskInputNames = Object.keys(taskInputs);

    if (pluginInputNames.length === 0) return 1;

    const compatibleInputs = pluginInputNames.filter(name =>
      taskInputNames.includes(name)
    );

    return compatibleInputs.length / pluginInputNames.length;
  }

  private extractCapabilities(manifest: PluginManifest): PluginCapability[] {
    const capabilities: PluginCapability[] = [];

    // Extract capabilities from manifest
    for (const [inputName, inputSchema] of Object.entries(manifest.inputs)) {
      capabilities.push({
        type: 'input',
        name: inputName,
        dataType: inputSchema.type,
        required: inputSchema.required
      });
    }

    for (const [outputName, outputSchema] of Object.entries(manifest.outputs)) {
      capabilities.push({
        type: 'output',
        name: outputName,
        dataType: outputSchema.type
      });
    }

    // Extract capabilities from permissions
    for (const permission of manifest.permissions) {
      capabilities.push({
        type: 'permission',
        name: permission
      });
    }

    return capabilities;
  }

  private calculateMatchScore(
    requirements: TaskRequirements,
    plugin: AvailablePlugin
  ): number {
    let score = 0;

    // Check category match
    if (requirements.category && plugin.manifest.category === requirements.category) {
      score += 40;
    }

    // Check tag matches
    const tagMatches = requirements.tags?.filter(tag =>
      plugin.manifest.tags.includes(tag)
    ).length || 0;

    score += tagMatches * 10;

    // Check input compatibility
    if (requirements.inputs) {
      const inputScore = this.checkInputCompatibility(
        plugin.manifest.inputs,
        requirements.inputs
      );
      score += inputScore * 30;
    }

    // Check output requirements
    if (requirements.expectedOutputs) {
      const outputMatches = requirements.expectedOutputs.filter(output =>
        Object.keys(plugin.manifest.outputs).includes(output)
      ).length;

      score += (outputMatches / requirements.expectedOutputs.length) * 20;
    }

    return score;
  }

  private calculateConfidence(score: number, plugin: AvailablePlugin): number {
    let confidence = Math.min(score / 100, 1);

    // Adjust confidence based on plugin usage history
    if (plugin.usageCount > 10) {
      confidence += 0.1;
    }

    if (plugin.lastUsed && Date.now() - plugin.lastUsed.getTime() < 7 * 24 * 60 * 60 * 1000) {
      confidence += 0.05;
    }

    return Math.min(confidence, 1);
  }

  private pluginHandlesEvent(manifest: PluginManifest, eventType: string): boolean {
    // Check if plugin manifest declares support for this event type
    // This would be defined in the plugin manifest
    return false; // Placeholder implementation
  }

  private async executePluginHandler(
    installation: MarketplaceInstallation,
    eventType: string,
    eventData: any,
    userId: string,
    projectId: string
  ): Promise<void> {
    try {
      const context = await this.createPluginContext(userId, projectId);

      await this.pluginLoader.executePlugin(
        installation,
        { eventType, eventData },
        context
      );
    } catch (error) {
      console.error(`Error executing plugin handler for ${eventType}:`, error);
    }
  }
}

// Type definitions
interface AvailablePlugin {
  installation: MarketplaceInstallation;
  manifest: PluginManifest;
  capabilities: PluginCapability[];
  lastUsed?: Date;
  usageCount: number;
}

interface PluginCapability {
  type: 'input' | 'output' | 'permission';
  name: string;
  dataType?: string;
  required?: boolean;
}

interface TaskRequirements {
  category?: string;
  tags?: string[];
  inputs?: Record<string, any>;
  expectedOutputs?: string[];
  permissions?: string[];
}

interface PluginMatch {
  plugin: AvailablePlugin;
  score: number;
  confidence: number;
}

interface PluginEventHandler {
  (eventType: string, eventData: any, context: PluginContext): Promise<void>;
}

export { AvailablePlugin, PluginCapability, TaskRequirements, PluginMatch };