/**
 * Plugin Router and Agent Dispatcher
 *
 * Routes plugin execution requests to appropriate agents,
 * manages plugin lifecycle, and coordinates between different plugin types.
 */

import { prisma } from '@/lib/prisma';
import { pluginManager } from './manager';
import {
  PluginManifest,
  PluginExecutionContext,
  PluginExecutionResult,
  PluginValidator,
  PluginCapability,
} from './schema';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface PluginRoutingContext {
  userId: string;
  projectId?: string;
  workspaceId?: string;
  capabilities: PluginCapability[];
  requirements?: Record<string, any>;
  preferences?: {
    preferredPlugins?: string[];
    excludedPlugins?: string[];
    maxExecutionTime?: number;
    maxCost?: number;
  };
}

export interface PluginExecutionPlan {
  plugins: {
    pluginId: string;
    manifest: PluginManifest;
    priority: number;
    estimatedCost: number;
    estimatedTime: number;
  }[];
  totalEstimatedCost: number;
  totalEstimatedTime: number;
}

export interface AgentExecutor {
  execute(
    manifest: PluginManifest,
    context: PluginExecutionContext
  ): Promise<PluginExecutionResult>;
}

export class PluginRouter {
  private static instance: PluginRouter;
  private agentExecutors: Map<string, AgentExecutor> = new Map();

  public static getInstance(): PluginRouter {
    if (!PluginRouter.instance) {
      PluginRouter.instance = new PluginRouter();
    }
    return PluginRouter.instance;
  }

  constructor() {
    this.initializeAgentExecutors();
  }

  /**
   * Execute a plugin with the given context
   */
  async executePlugin(context: PluginExecutionContext): Promise<PluginExecutionResult> {
    return withSpan('plugin_router.execute', async (span) => {
      const startTime = Date.now();

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_execution',
        [SPAN_ATTRIBUTES.USER_ID]: context.userId,
        'plugin.id': context.pluginId,
        'execution.session_id': context.sessionId,
      });

      try {
        // Get and validate plugin
        const plugin = await pluginManager.getPlugin(context.pluginId);
        if (!plugin) {
          throw new Error('Plugin not found');
        }

        if (plugin.status !== 'enabled') {
          throw new Error('Plugin is not enabled');
        }

        const manifest = plugin.manifest;

        // Validate inputs against manifest
        PluginValidator.validateInputs(context.input, manifest);

        // Check permissions
        await this.validatePermissions(manifest, context);

        // Create execution record
        const execution = await this.createExecutionRecord(context);

        addSpanAttributes(span, {
          'plugin.name': manifest.name,
          'plugin.version': manifest.version,
          'plugin.agent_type': manifest.agent.type,
          'execution.id': execution.id,
        });

        try {
          // Route to appropriate agent executor
          const executor = this.getAgentExecutor(manifest.agent.type);
          if (!executor) {
            throw new Error(`No executor available for agent type: ${manifest.agent.type}`);
          }

          // Execute plugin
          const result = await executor.execute(manifest, context);

          const executionTime = Date.now() - startTime;

          // Update execution record with success
          await this.updateExecutionRecord(execution.id, {
            status: 'completed',
            output: result.output,
            executionTime,
            memoryUsed: result.metadata.memoryUsed,
            tokensUsed: result.metadata.tokensUsed,
            cost: result.metadata.cost,
            logs: result.logs,
            completedAt: new Date(),
          });

          // Update plugin metrics
          await pluginManager.updatePluginMetrics(
            context.pluginId,
            executionTime,
            result.success,
            result.metadata.cost
          );

          addSpanAttributes(span, {
            'execution.success': result.success,
            'execution.time': executionTime,
            'execution.tokens_used': result.metadata.tokensUsed || 0,
            'execution.cost': result.metadata.cost || 0,
          });

          return {
            ...result,
            metadata: {
              ...result.metadata,
              executionTime,
            },
          };

        } catch (error) {
          const executionTime = Date.now() - startTime;

          // Update execution record with error
          await this.updateExecutionRecord(execution.id, {
            status: 'error',
            error: {
              code: 'EXECUTION_ERROR',
              message: (error as Error).message,
              details: {
                stack: (error as Error).stack,
              },
            },
            executionTime,
            completedAt: new Date(),
          });

          // Update plugin metrics with failure
          await pluginManager.updatePluginMetrics(context.pluginId, executionTime, false);

          throw error;
        }

      } catch (error) {
        span?.recordException?.(error as Error);

        const executionTime = Date.now() - startTime;

        return {
          success: false,
          error: {
            code: 'PLUGIN_EXECUTION_ERROR',
            message: (error as Error).message,
          },
          metadata: {
            executionTime,
          },
          logs: [
            {
              level: 'error',
              message: (error as Error).message,
              timestamp: new Date().toISOString(),
            },
          ],
        };
      }
    });
  }

  /**
   * Find suitable plugins for given capabilities and context
   */
  async findPluginsForCapabilities(
    routingContext: PluginRoutingContext
  ): Promise<PluginExecutionPlan> {
    return withSpan('plugin_router.find_plugins', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_discovery',
        [SPAN_ATTRIBUTES.USER_ID]: routingContext.userId,
        'capabilities.count': routingContext.capabilities.length,
      });

      // Get enabled plugins with matching capabilities
      const pluginResults = await pluginManager.listPlugins({
        enabled: true,
        capabilities: routingContext.capabilities,
        limit: 50,
      });

      const candidates = pluginResults.plugins
        .filter(plugin => {
          // Filter by preferences
          if (routingContext.preferences?.excludedPlugins?.includes(plugin.id)) {
            return false;
          }

          // Check if plugin has required capabilities
          const pluginCapabilities = plugin.manifest.capabilities;
          return routingContext.capabilities.some(cap => pluginCapabilities.includes(cap));
        })
        .map(plugin => {
          const priority = this.calculatePluginPriority(plugin, routingContext);
          const estimatedCost = this.estimatePluginCost(plugin, routingContext);
          const estimatedTime = this.estimatePluginTime(plugin, routingContext);

          return {
            pluginId: plugin.id,
            manifest: plugin.manifest,
            priority,
            estimatedCost,
            estimatedTime,
          };
        })
        .sort((a, b) => b.priority - a.priority); // Sort by priority descending

      // Apply preferences for preferred plugins
      if (routingContext.preferences?.preferredPlugins) {
        candidates.sort((a, b) => {
          const aPreferred = routingContext.preferences!.preferredPlugins!.includes(a.pluginId);
          const bPreferred = routingContext.preferences!.preferredPlugins!.includes(b.pluginId);

          if (aPreferred && !bPreferred) return -1;
          if (!aPreferred && bPreferred) return 1;
          return b.priority - a.priority;
        });
      }

      const totalEstimatedCost = candidates.reduce((sum, p) => sum + p.estimatedCost, 0);
      const totalEstimatedTime = candidates.reduce((sum, p) => sum + p.estimatedTime, 0);

      addSpanAttributes(span, {
        'plugins.candidates': candidates.length,
        'plan.estimated_cost': totalEstimatedCost,
        'plan.estimated_time': totalEstimatedTime,
      });

      return {
        plugins: candidates,
        totalEstimatedCost,
        totalEstimatedTime,
      };
    });
  }

  /**
   * Execute multiple plugins in sequence or parallel
   */
  async executePluginChain(
    contexts: PluginExecutionContext[],
    options: {
      parallel?: boolean;
      continueOnError?: boolean;
      timeout?: number;
    } = {}
  ): Promise<PluginExecutionResult[]> {
    return withSpan('plugin_router.execute_chain', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'plugin_chain_execution',
        'chain.length': contexts.length,
        'chain.parallel': options.parallel || false,
      });

      if (options.parallel) {
        // Execute all plugins in parallel
        const promises = contexts.map(context => this.executePlugin(context));

        if (options.timeout) {
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Plugin chain execution timeout')), options.timeout);
          });

          return Promise.race([Promise.allSettled(promises), timeoutPromise]).then(results => {
            if (!Array.isArray(results)) {
              throw new Error('Plugin chain execution timeout');
            }
            return results.map(result =>
              result.status === 'fulfilled' ? result.value : {
                success: false,
                error: {
                  code: 'EXECUTION_ERROR',
                  message: result.reason.message,
                },
                metadata: { executionTime: 0 },
                logs: [],
              }
            );
          });
        }

        const results = await Promise.allSettled(promises);
        return results.map(result =>
          result.status === 'fulfilled' ? result.value : {
            success: false,
            error: {
              code: 'EXECUTION_ERROR',
              message: result.reason.message,
            },
            metadata: { executionTime: 0 },
            logs: [],
          }
        );

      } else {
        // Execute plugins sequentially
        const results: PluginExecutionResult[] = [];

        for (const context of contexts) {
          try {
            const result = await this.executePlugin(context);
            results.push(result);

            // Stop on error if continueOnError is false
            if (!result.success && !options.continueOnError) {
              break;
            }
          } catch (error) {
            const errorResult: PluginExecutionResult = {
              success: false,
              error: {
                code: 'EXECUTION_ERROR',
                message: (error as Error).message,
              },
              metadata: { executionTime: 0 },
              logs: [],
            };

            results.push(errorResult);

            if (!options.continueOnError) {
              break;
            }
          }
        }

        return results;
      }
    });
  }

  /**
   * Private helper methods
   */
  private initializeAgentExecutors(): void {
    // Initialize different agent executors
    this.agentExecutors.set('openai', new OpenAIAgentExecutor());
    this.agentExecutors.set('anthropic', new AnthropicAgentExecutor());
    this.agentExecutors.set('local', new LocalAgentExecutor());
    this.agentExecutors.set('webhook', new WebhookAgentExecutor());
    this.agentExecutors.set('docker', new DockerAgentExecutor());
  }

  private getAgentExecutor(agentType: string): AgentExecutor | undefined {
    return this.agentExecutors.get(agentType);
  }

  private async validatePermissions(manifest: PluginManifest, context: PluginExecutionContext): Promise<void> {
    // Basic permission validation
    // In a real implementation, this would check user permissions,
    // workspace access, and plugin-specific permissions

    const permissions = manifest.permissions;

    // Check if plugin needs file access
    if (permissions.fileSystem.read.length > 0 || permissions.fileSystem.write.length > 0) {
      // Validate file access permissions
      // This is a placeholder - real implementation would check actual file permissions
    }

    // Check network permissions
    if (permissions.network.outbound.length > 0) {
      // Validate network access permissions
    }

    // Check API access permissions
    if (permissions.apis.length > 0) {
      // Validate API access permissions
    }
  }

  private async createExecutionRecord(context: PluginExecutionContext) {
    return prisma.pluginExecution.create({
      data: {
        pluginId: context.pluginId,
        userId: context.userId,
        projectId: context.projectId,
        workspaceId: context.workspaceId,
        sessionId: context.sessionId,
        traceId: context.traceId,
        input: context.input as any,
        config: context.config as any,
        metadata: context.metadata as any,
        status: 'running',
      },
    });
  }

  private async updateExecutionRecord(executionId: string, updates: any) {
    return prisma.pluginExecution.update({
      where: { id: executionId },
      data: updates,
    });
  }

  private calculatePluginPriority(plugin: any, context: PluginRoutingContext): number {
    let priority = 50; // Base priority

    // Boost priority based on usage stats
    priority += Math.min(plugin.usage.executions / 100, 20); // Max 20 points from usage
    priority -= plugin.usage.errorRate * 30; // Penalize high error rates

    // Boost priority for recent usage
    if (plugin.usage.lastUsed) {
      const daysSinceLastUse = (Date.now() - new Date(plugin.usage.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
      priority += Math.max(10 - daysSinceLastUse, 0); // Boost for recent usage
    }

    // Health-based adjustments
    switch (plugin.health.status) {
      case 'healthy':
        priority += 10;
        break;
      case 'warning':
        priority -= 5;
        break;
      case 'error':
        priority -= 20;
        break;
    }

    return Math.max(0, Math.min(100, priority));
  }

  private estimatePluginCost(plugin: any, context: PluginRoutingContext): number {
    const manifest = plugin.manifest as PluginManifest;

    // Base cost estimation
    let cost = 0;

    switch (manifest.agent.type) {
      case 'openai':
        // Estimate based on token usage
        cost = (manifest.agent.maxTokens || 1000) * 0.00002; // $0.02 per 1K tokens
        break;
      case 'anthropic':
        cost = (manifest.agent.maxTokens || 1000) * 0.00001; // $0.01 per 1K tokens
        break;
      case 'local':
      case 'docker':
        // Compute cost estimation
        cost = 0.001; // Minimal cost for local execution
        break;
      case 'webhook':
        cost = 0; // No direct cost for webhooks
        break;
    }

    return cost;
  }

  private estimatePluginTime(plugin: any, context: PluginRoutingContext): number {
    const manifest = plugin.manifest as PluginManifest;

    // Use average execution time if available, otherwise estimate
    if (plugin.usage.averageExecutionTime > 0) {
      return plugin.usage.averageExecutionTime;
    }

    // Estimate based on plugin type and configuration
    const configTimeout = manifest.config.timeout || 30000;
    return Math.min(configTimeout * 0.5, 30000); // Estimate 50% of timeout, max 30s
  }
}

/**
 * Agent Executor Implementations
 */
class OpenAIAgentExecutor implements AgentExecutor {
  async execute(manifest: PluginManifest, context: PluginExecutionContext): Promise<PluginExecutionResult> {
    // OpenAI agent execution implementation
    // This would integrate with OpenAI API
    return {
      success: true,
      output: { message: 'OpenAI agent execution not implemented' },
      metadata: {
        executionTime: 1000,
        tokensUsed: 100,
        cost: 0.002,
      },
      logs: [
        {
          level: 'info',
          message: 'OpenAI agent execution placeholder',
          timestamp: new Date().toISOString(),
        },
      ],
    };
  }
}

class AnthropicAgentExecutor implements AgentExecutor {
  async execute(manifest: PluginManifest, context: PluginExecutionContext): Promise<PluginExecutionResult> {
    // Anthropic agent execution implementation
    return {
      success: true,
      output: { message: 'Anthropic agent execution not implemented' },
      metadata: {
        executionTime: 1000,
        tokensUsed: 100,
        cost: 0.001,
      },
      logs: [],
    };
  }
}

class LocalAgentExecutor implements AgentExecutor {
  async execute(manifest: PluginManifest, context: PluginExecutionContext): Promise<PluginExecutionResult> {
    // Local agent execution implementation
    // This would execute local scripts/commands
    return {
      success: true,
      output: { message: 'Local agent execution not implemented' },
      metadata: {
        executionTime: 500,
      },
      logs: [],
    };
  }
}

class WebhookAgentExecutor implements AgentExecutor {
  async execute(manifest: PluginManifest, context: PluginExecutionContext): Promise<PluginExecutionResult> {
    // Webhook agent execution implementation
    // This would make HTTP requests to external services
    return {
      success: true,
      output: { message: 'Webhook agent execution not implemented' },
      metadata: {
        executionTime: 2000,
      },
      logs: [],
    };
  }
}

class DockerAgentExecutor implements AgentExecutor {
  async execute(manifest: PluginManifest, context: PluginExecutionContext): Promise<PluginExecutionResult> {
    // Docker agent execution implementation
    // This would run plugins in Docker containers
    return {
      success: true,
      output: { message: 'Docker agent execution not implemented' },
      metadata: {
        executionTime: 3000,
        memoryUsed: 256,
      },
      logs: [],
    };
  }
}

export const pluginRouter = PluginRouter.getInstance();