/**
 * AI Model Registry Service
 *
 * Manages the registry of available AI models with role-based selection,
 * version management, and configuration for the AI orchestration layer.
 * Updated for 2025 model versions with enhanced capabilities.
 */

import { prisma } from '@/lib/db';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  role: string;
  version?: string;
  versionTag?: string;
  config: Record<string, any>;
  capabilities: string[];
  status: 'stable' | 'canary' | 'disabled';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface ModelFilter {
  provider?: string;
  role?: string;
  status?: string;
  versionTag?: string;
  capabilities?: string[];
  isActive?: boolean;
}

export interface ModelSelectionCriteria {
  role?: string;
  provider?: string;
  status?: 'stable' | 'canary' | 'disabled';
  capabilities?: string[];
  preferredVersionTag?: string;
}

export enum ModelRole {
  CODE_ARCHITECT = 'Code Architect & Guardrails',
  CONVERSATIONAL_UX = 'Conversational UX & Generalist',
  MULTIMODAL_DESIGNER = 'Multimodal Designer',
  SYSTEMS_DEBUGGER = 'Systems Debugger & Infra',
  RESEARCH_FETCHER = 'Research Fetcher',
  CODE_GENERATOR = 'Code Generator & Optimizer',
  SECURITY_CHECKER = 'Security & Policy Checker',
  KNOWLEDGE_SYNTHESIZER = 'Knowledge Base Synthesizer',
  RETRIEVER_ENGINE = 'Retriever & Context Engine',
  CREATIVE_GENERATOR = 'Creative Asset Generator',
}

export enum ModelProvider {
  ANTHROPIC = 'Anthropic',
  OPENAI = 'OpenAI',
  GOOGLE = 'Google',
  XAI = 'xAI',
  PERPLEXITY = 'Perplexity',
  DEEPSEEK = 'DeepSeek',
  MISTRAL = 'Mistral',
  META = 'Meta',
  COHERE = 'Cohere',
  STABILITY = 'Stability',
}

export class ModelRegistry {
  private modelCache = new Map<string, ModelConfig>();
  private lastSync: Date | null = null;
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    // Initialize cache on startup
    this.syncFromDatabase().catch(error => {
      console.error('Failed to initialize model registry:', error);
    });
  }

  /**
   * Get all models matching the filter
   */
  async getModels(filter: ModelFilter = {}): Promise<ModelConfig[]> {
    return await withSpan('model_registry.get_models', async (span) => {
      await this.ensureFreshCache();

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'model_registry_get_models',
        'filter.provider': filter.provider || 'any',
        'filter.role': filter.role || 'any',
        'filter.status': filter.status || 'any',
      });

      const models = Array.from(this.modelCache.values());

      const filteredModels = models.filter(model => {
        if (filter.provider && model.provider !== filter.provider) return false;
        if (filter.role && model.role !== filter.role) return false;
        if (filter.status && model.status !== filter.status) return false;
        if (filter.versionTag && model.versionTag !== filter.versionTag) return false;
        if (filter.isActive !== undefined && model.isActive !== filter.isActive) return false;
        if (filter.capabilities && !filter.capabilities.every(cap => model.capabilities.includes(cap))) return false;
        return true;
      });

      addSpanAttributes(span, { 'models.filtered_count': filteredModels.length });
      return filteredModels;
    });
  }

  /**
   * Get model by specific role with intelligent selection
   */
  async getModelByRole(
    role: string,
    criteria: Omit<ModelSelectionCriteria, 'role'> = {}
  ): Promise<ModelConfig | null> {
    return await withSpan('model_registry.get_by_role', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'model_registry_get_by_role',
          'model.role': role,
          'model.provider': criteria.provider || 'any',
          'model.status': criteria.status || 'stable',
        });

        const models = await this.getModels({
          role,
          provider: criteria.provider,
          status: criteria.status || 'stable',
          isActive: true
        });

        if (models.length === 0) {
          // Fallback to canary if no stable models found
          const canaryModels = await this.getModels({
            role,
            provider: criteria.provider,
            status: 'canary',
            isActive: true
          });

          if (canaryModels.length === 0) {
            console.warn(`No models found for role: ${role}`);
            return null;
          }

          return canaryModels[0];
        }

        // If preferred version tag specified, try to find it
        if (criteria.preferredVersionTag) {
          const preferredModel = models.find(
            m => m.versionTag === criteria.preferredVersionTag
          );
          if (preferredModel) {
            addSpanAttributes(span, {
              'model.selected_version': preferredModel.versionTag || 'unknown',
            });
            return preferredModel;
          }
        }

        // Return first stable model (sorted by creation date desc)
        const selectedModel = models[0];
        addSpanAttributes(span, {
          'model.selected_id': selectedModel.id,
          'model.selected_version': selectedModel.versionTag || 'unknown',
        });

        return selectedModel;

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error(`Failed to get model by role ${role}:`, error);
        return null;
      }
    });
  }

  /**
   * Select best model based on criteria with intelligent fallback
   */
  async selectModel(criteria: ModelSelectionCriteria): Promise<ModelConfig | null> {
    return await withSpan('model_registry.select_model', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'model_registry_select_model',
          'criteria': JSON.stringify(criteria),
        });

        if (criteria.role) {
          return await this.getModelByRole(criteria.role, criteria);
        }

        // If no role specified, find best general model
        const models = await this.getModels({
          provider: criteria.provider,
          status: criteria.status,
          isActive: true,
        });

        if (models.length === 0) {
          return null;
        }

        // Prefer models with better capabilities match
        if (criteria.capabilities && criteria.capabilities.length > 0) {
          const scoredModels = models.map(model => {
            const matchingCapabilities = criteria.capabilities!.filter(cap =>
              model.capabilities.includes(cap)
            );
            return {
              model,
              score: matchingCapabilities.length / criteria.capabilities!.length,
            };
          });

          scoredModels.sort((a, b) => b.score - a.score);

          if (scoredModels[0].score > 0) {
            const selectedModel = scoredModels[0].model;
            addSpanAttributes(span, {
              'model.capability_match_score': scoredModels[0].score,
            });
            return selectedModel;
          }
        }

        // Default to first available model
        return models[0];

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to select model:', error);
        return null;
      }
    });
  }

  /**
   * Get a specific model by ID
   */
  async getModel(id: string): Promise<ModelConfig | null> {
    await this.ensureFreshCache();
    return this.modelCache.get(id) || null;
  }

  /**
   * Get models by role with status priority (stable first, then canary)
   */
  async getModelsByRole(role: string): Promise<ModelConfig[]> {
    const models = await this.getModels({ role, isActive: true });

    // Sort by status priority: stable > canary > disabled
    return models.sort((a, b) => {
      const statusPriority = { stable: 3, canary: 2, disabled: 1 };
      return statusPriority[b.status] - statusPriority[a.status];
    });
  }

  /**
   * Get stable models for a role
   */
  async getStableModels(role: string): Promise<ModelConfig[]> {
    return this.getModels({ role, status: 'stable', isActive: true });
  }

  /**
   * Get canary models for a role
   */
  async getCanaryModels(role: string): Promise<ModelConfig[]> {
    return this.getModels({ role, status: 'canary', isActive: true });
  }

  /**
   * Update model status
   */
  async updateModelStatus(id: string, status: 'stable' | 'canary' | 'disabled'): Promise<boolean> {
    try {
      const model = await prisma.model.update({
        where: { id },
        data: { status },
      });

      // Update cache
      const cachedModel = this.modelCache.get(id);
      if (cachedModel) {
        cachedModel.status = status;
        cachedModel.updatedAt = model.updatedAt;
      }

      console.log(`Updated model ${id} status to ${status}`);
      return true;

    } catch (error) {
      console.error(`Failed to update model ${id} status:`, error);
      return false;
    }
  }

  /**
   * Promote canary model to stable
   */
  async promoteCanaryToStable(canaryId: string): Promise<{ success: boolean; message: string }> {
    try {
      const canaryModel = await this.getModel(canaryId);
      if (!canaryModel) {
        return { success: false, message: 'Canary model not found' };
      }

      if (canaryModel.status !== 'canary') {
        return { success: false, message: 'Model is not in canary status' };
      }

      // Get current stable models for the same role
      const stableModels = await this.getStableModels(canaryModel.role);

      // Start transaction to promote canary and demote current stable
      await prisma.$transaction(async (tx) => {
        // Demote current stable models to disabled
        for (const stableModel of stableModels) {
          await tx.model.update({
            where: { id: stableModel.id },
            data: { status: 'disabled' },
          });
        }

        // Promote canary to stable
        await tx.model.update({
          where: { id: canaryId },
          data: { status: 'stable' },
        });
      });

      // Refresh cache
      await this.syncFromDatabase(true);

      console.log(`Promoted canary model ${canaryId} to stable for role ${canaryModel.role}`);

      return {
        success: true,
        message: `Successfully promoted ${canaryModel.name} to stable`
      };

    } catch (error) {
      console.error(`Failed to promote canary model ${canaryId}:`, error);
      return {
        success: false,
        message: `Failed to promote model: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Add a new model to the registry
   */
  async addModel(modelData: {
    name: string;
    provider: string;
    role: string;
    version?: string;
    versionTag?: string;
    config: Record<string, any>;
    capabilities: string[];
    status?: 'stable' | 'canary' | 'disabled';
  }): Promise<ModelConfig | null> {
    try {
      const model = await prisma.model.create({
        data: {
          name: modelData.name,
          provider: modelData.provider,
          role: modelData.role,
          version: modelData.version,
          versionTag: modelData.versionTag,
          config: modelData.config,
          capabilities: modelData.capabilities,
          status: modelData.status || 'canary', // Default to canary for new models
          isActive: true,
        },
      });

      const modelConfig: ModelConfig = {
        id: model.id,
        name: model.name,
        provider: model.provider,
        role: model.role,
        version: model.version || undefined,
        versionTag: model.versionTag || undefined,
        config: model.config as Record<string, any>,
        capabilities: model.capabilities as string[],
        status: model.status as 'stable' | 'canary' | 'disabled',
        isActive: model.isActive,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
      };

      // Add to cache
      this.modelCache.set(model.id, modelConfig);

      console.log(`Added new model ${model.name} (${model.id}) to registry`);
      return modelConfig;

    } catch (error) {
      console.error('Failed to add model to registry:', error);
      return null;
    }
  }

  /**
   * Remove a model from the registry
   */
  async removeModel(id: string): Promise<boolean> {
    try {
      await prisma.model.update({
        where: { id },
        data: { isActive: false, status: 'disabled' },
      });

      // Update cache
      const cachedModel = this.modelCache.get(id);
      if (cachedModel) {
        cachedModel.isActive = false;
        cachedModel.status = 'disabled';
      }

      console.log(`Deactivated model ${id}`);
      return true;

    } catch (error) {
      console.error(`Failed to deactivate model ${id}:`, error);
      return false;
    }
  }

  /**
   * Get model statistics
   */
  async getModelStats(): Promise<{
    total: number;
    byStatus: Record<string, number>;
    byRole: Record<string, number>;
    byProvider: Record<string, number>;
  }> {
    await this.ensureFreshCache();

    const models = Array.from(this.modelCache.values()).filter(m => m.isActive);

    const stats = {
      total: models.length,
      byStatus: {} as Record<string, number>,
      byRole: {} as Record<string, number>,
      byProvider: {} as Record<string, number>,
    };

    for (const model of models) {
      stats.byStatus[model.status] = (stats.byStatus[model.status] || 0) + 1;
      stats.byRole[model.role] = (stats.byRole[model.role] || 0) + 1;
      stats.byProvider[model.provider] = (stats.byProvider[model.provider] || 0) + 1;
    }

    return stats;
  }

  /**
   * Sync cache with database
   */
  async syncFromDatabase(force: boolean = false): Promise<void> {
    if (!force && this.lastSync && Date.now() - this.lastSync.getTime() < this.CACHE_TTL) {
      return; // Cache is still fresh
    }

    try {
      const models = await prisma.model.findMany({
        where: { isActive: true },
        orderBy: { updatedAt: 'desc' },
      });

      // Clear and rebuild cache
      this.modelCache.clear();

      for (const model of models) {
        const modelConfig: ModelConfig = {
          id: model.id,
          name: model.name,
          provider: model.provider,
          role: model.role,
          version: model.version || undefined,
          versionTag: model.versionTag || undefined,
          config: model.config as Record<string, any>,
          capabilities: model.capabilities as string[],
          status: model.status as 'stable' | 'canary' | 'disabled',
          isActive: model.isActive,
          createdAt: model.createdAt,
          updatedAt: model.updatedAt,
        };

        this.modelCache.set(model.id, modelConfig);
      }

      this.lastSync = new Date();
      console.log(`Synced ${models.length} models to registry cache`);

    } catch (error) {
      console.error('Failed to sync model registry from database:', error);
      throw error;
    }
  }

  /**
   * Ensure cache is fresh
   */
  private async ensureFreshCache(): Promise<void> {
    if (!this.lastSync || Date.now() - this.lastSync.getTime() >= this.CACHE_TTL) {
      await this.syncFromDatabase();
    }
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache(): void {
    this.modelCache.clear();
    this.lastSync = null;
  }

  /**
   * Update model configuration and metadata
   */
  async updateModel(
    modelId: string,
    updates: Partial<Pick<ModelConfig, 'config' | 'status' | 'capabilities' | 'versionTag'>>
  ): Promise<ModelConfig> {
    return await withSpan('model_registry.update_model', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'model_registry_update_model',
          'model.id': modelId,
        });

        const updateData: any = {};

        if (updates.config) {
          updateData.config = updates.config;
        }

        if (updates.status) {
          updateData.status = updates.status;
        }

        if (updates.capabilities) {
          updateData.capabilities = updates.capabilities;
        }

        if (updates.versionTag !== undefined) {
          updateData.versionTag = updates.versionTag;
        }

        const model = await prisma.model.update({
          where: { id: modelId },
          data: updateData,
        });

        // Update cache
        const modelConfig: ModelConfig = {
          id: model.id,
          name: model.name,
          provider: model.provider,
          role: model.role,
          version: model.version || undefined,
          versionTag: model.versionTag || undefined,
          config: model.config as Record<string, any>,
          capabilities: Array.isArray(model.capabilities) ? model.capabilities : [],
          status: model.status as 'stable' | 'canary' | 'disabled',
          isActive: model.isActive,
          createdAt: model.createdAt,
          updatedAt: model.updatedAt,
        };

        this.modelCache.set(modelId, modelConfig);

        return modelConfig;

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to update model:', error);
        throw error;
      }
    });
  }

  /**
   * Set model active status
   */
  async setModelActive(modelId: string, isActive: boolean): Promise<void> {
    try {
      await prisma.model.update({
        where: { id: modelId },
        data: { isActive },
      });

      // Update cache
      const cachedModel = this.modelCache.get(modelId);
      if (cachedModel) {
        cachedModel.isActive = isActive;
      }

      console.log(`Model ${modelId} ${isActive ? 'activated' : 'deactivated'}`);

    } catch (error) {
      console.error('Failed to set model active status:', error);
      throw error;
    }
  }

  /**
   * Get models grouped by role for admin UI
   */
  async getModelsByRole(): Promise<Record<string, ModelConfig[]>> {
    const models = await this.getModels();
    const groupedModels: Record<string, ModelConfig[]> = {};

    for (const model of models) {
      if (!groupedModels[model.role]) {
        groupedModels[model.role] = [];
      }
      groupedModels[model.role].push(model);
    }

    // Sort models within each role by status priority and creation date
    for (const role in groupedModels) {
      groupedModels[role].sort((a, b) => {
        const statusPriority = { stable: 3, canary: 2, disabled: 1 };
        const statusDiff = statusPriority[b.status] - statusPriority[a.status];
        if (statusDiff !== 0) return statusDiff;

        return b.createdAt.getTime() - a.createdAt.getTime();
      });
    }

    return groupedModels;
  }

  /**
   * Get cache info
   */
  getCacheInfo(): { size: number; lastSync: Date | null; isStale: boolean } {
    const isStale = !this.lastSync || Date.now() - this.lastSync.getTime() >= this.CACHE_TTL;

    return {
      size: this.modelCache.size,
      lastSync: this.lastSync,
      isStale,
    };
  }
}

// Export singleton instance
export const modelRegistry = new ModelRegistry();