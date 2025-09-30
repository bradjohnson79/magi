/**
 * Platform Settings Service
 *
 * Manages feature flags, quotas, model weights, and other platform configurations.
 * Provides a centralized way to control platform behavior.
 */

import { prisma } from '@/lib/db';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

interface PlatformSetting {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  description?: string;
  category: string;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  description?: string;
  conditions: Record<string, any>;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

interface ModelWeight {
  modelId: string;
  weight: number;
  enabled: boolean;
  priority: number;
}

interface PlanQuota {
  plan: string;
  maxRequests: number;
  maxTokens: number;
  maxProjects: number;
  maxTeamMembers: number;
  features: string[];
}

class SettingsCache {
  private cache = new Map<string, { value: any; expiry: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  set(key: string, value: any): void {
    const expiry = Date.now() + this.TTL;
    this.cache.set(key, { value, expiry });
  }

  get(key: string): any | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }

    return entry.value;
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export class PlatformSettingsService {
  private static instance: PlatformSettingsService;
  private cache = new SettingsCache();

  private constructor() {}

  static getInstance(): PlatformSettingsService {
    if (!PlatformSettingsService.instance) {
      PlatformSettingsService.instance = new PlatformSettingsService();
    }
    return PlatformSettingsService.instance;
  }

  /**
   * Get a setting value with type conversion
   */
  async getSetting<T = string>(key: string, defaultValue?: T): Promise<T> {
    return await withSpan('platform.get_setting', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'settings_retrieval',
          'setting.key': key,
        });

        // Check cache first
        const cached = this.cache.get(key);
        if (cached !== null) {
          return cached;
        }

        const setting = await prisma.platformSetting.findUnique({
          where: { key },
        });

        if (!setting) {
          if (defaultValue !== undefined) {
            return defaultValue;
          }
          throw new Error(`Setting '${key}' not found`);
        }

        // Convert value based on type
        let value: any = setting.value;
        switch (setting.type) {
          case 'number':
            value = parseFloat(setting.value);
            break;
          case 'boolean':
            value = setting.value === 'true';
            break;
          case 'json':
            value = JSON.parse(setting.value);
            break;
          default:
            value = setting.value;
        }

        // Cache the converted value
        this.cache.set(key, value);

        return value as T;
      } catch (error) {
        console.error(`Failed to get setting '${key}':`, error);
        if (defaultValue !== undefined) {
          return defaultValue;
        }
        throw error;
      }
    });
  }

  /**
   * Set a setting value
   */
  async setSetting(
    key: string,
    value: any,
    type: 'string' | 'number' | 'boolean' | 'json',
    userId: string,
    options: {
      description?: string;
      category?: string;
      isPublic?: boolean;
    } = {}
  ): Promise<void> {
    return await withSpan('platform.set_setting', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'settings_update',
          'setting.key': key,
          'setting.type': type,
        });

        // Convert value to string for storage
        let stringValue: string;
        switch (type) {
          case 'number':
            stringValue = value.toString();
            break;
          case 'boolean':
            stringValue = value ? 'true' : 'false';
            break;
          case 'json':
            stringValue = JSON.stringify(value);
            break;
          default:
            stringValue = value.toString();
        }

        // Update or create setting
        await prisma.platformSetting.upsert({
          where: { key },
          update: {
            value: stringValue,
            type,
            description: options.description,
            category: options.category || 'general',
            isPublic: options.isPublic || false,
          },
          create: {
            key,
            value: stringValue,
            type,
            description: options.description,
            category: options.category || 'general',
            isPublic: options.isPublic || false,
            createdBy: userId,
          },
        });

        // Clear cache
        this.cache.delete(key);

        // Log the change
        await auditLogger.logAdmin('admin.setting_updated', userId, key, {
          newValue: type === 'json' ? '[JSON]' : stringValue,
          type,
          category: options.category,
          isPublic: options.isPublic,
        });

        console.log(`Setting '${key}' updated successfully`);
      } catch (error) {
        console.error(`Failed to set setting '${key}':`, error);

        await auditLogger.logSecurity('security.setting_update_failed', userId, {
          settingKey: key,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    });
  }

  /**
   * Get all settings by category
   */
  async getSettingsByCategory(category: string): Promise<PlatformSetting[]> {
    try {
      const settings = await prisma.platformSetting.findMany({
        where: { category },
        orderBy: { key: 'asc' },
      });

      return settings;
    } catch (error) {
      console.error(`Failed to get settings for category '${category}':`, error);
      throw error;
    }
  }

  /**
   * Get public settings (safe to expose to frontend)
   */
  async getPublicSettings(): Promise<Record<string, any>> {
    try {
      const settings = await prisma.platformSetting.findMany({
        where: { isPublic: true },
      });

      const result: Record<string, any> = {};
      for (const setting of settings) {
        let value: any = setting.value;
        switch (setting.type) {
          case 'number':
            value = parseFloat(setting.value);
            break;
          case 'boolean':
            value = setting.value === 'true';
            break;
          case 'json':
            value = JSON.parse(setting.value);
            break;
        }
        result[setting.key] = value;
      }

      return result;
    } catch (error) {
      console.error('Failed to get public settings:', error);
      throw error;
    }
  }

  /**
   * Feature flag management
   */
  async getFeatureFlag(name: string): Promise<boolean> {
    return await withSpan('platform.get_feature_flag', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'feature_flag_check',
          'flag.name': name,
        });

        // Check cache first
        const cached = this.cache.get(`flag:${name}`);
        if (cached !== null) {
          return cached;
        }

        const flag = await prisma.featureFlag.findUnique({
          where: { name },
        });

        if (!flag) {
          return false; // Default to disabled
        }

        // For now, simple enabled/disabled check
        // In the future, this could include rollout percentage and conditions
        const isEnabled = flag.enabled && Math.random() * 100 <= flag.rolloutPercentage;

        this.cache.set(`flag:${name}`, isEnabled);

        return isEnabled;
      } catch (error) {
        console.error(`Failed to get feature flag '${name}':`, error);
        return false; // Fail safe - default to disabled
      }
    });
  }

  /**
   * Set feature flag
   */
  async setFeatureFlag(
    name: string,
    enabled: boolean,
    rolloutPercentage: number,
    userId: string,
    options: {
      description?: string;
      conditions?: Record<string, any>;
    } = {}
  ): Promise<void> {
    try {
      await prisma.featureFlag.upsert({
        where: { name },
        update: {
          enabled,
          rolloutPercentage: Math.max(0, Math.min(100, rolloutPercentage)),
          description: options.description,
          conditions: options.conditions || {},
        },
        create: {
          name,
          enabled,
          rolloutPercentage: Math.max(0, Math.min(100, rolloutPercentage)),
          description: options.description,
          conditions: options.conditions || {},
          createdBy: userId,
        },
      });

      // Clear cache
      this.cache.delete(`flag:${name}`);

      // Log the change
      await auditLogger.logAdmin('admin.feature_flag_updated', userId, name, {
        enabled,
        rolloutPercentage,
        description: options.description,
      });

      console.log(`Feature flag '${name}' updated successfully`);
    } catch (error) {
      console.error(`Failed to set feature flag '${name}':`, error);
      throw error;
    }
  }

  /**
   * Get all feature flags
   */
  async getAllFeatureFlags(): Promise<FeatureFlag[]> {
    try {
      const flags = await prisma.featureFlag.findMany({
        orderBy: { name: 'asc' },
      });

      return flags;
    } catch (error) {
      console.error('Failed to get feature flags:', error);
      throw error;
    }
  }

  /**
   * Get model weights configuration
   */
  async getModelWeights(): Promise<ModelWeight[]> {
    try {
      const weightsJson = await this.getSetting<string>('model_weights', '[]');
      return JSON.parse(weightsJson);
    } catch (error) {
      console.error('Failed to get model weights:', error);
      return [];
    }
  }

  /**
   * Set model weights
   */
  async setModelWeights(weights: ModelWeight[], userId: string): Promise<void> {
    try {
      await this.setSetting(
        'model_weights',
        weights,
        'json',
        userId,
        {
          description: 'Model selection weights and priorities',
          category: 'models',
        }
      );

      console.log('Model weights updated successfully');
    } catch (error) {
      console.error('Failed to set model weights:', error);
      throw error;
    }
  }

  /**
   * Get plan quotas
   */
  async getPlanQuotas(): Promise<Record<string, PlanQuota>> {
    try {
      const quotasJson = await this.getSetting<string>('plan_quotas', '{}');
      return JSON.parse(quotasJson);
    } catch (error) {
      console.error('Failed to get plan quotas:', error);
      return {};
    }
  }

  /**
   * Set plan quotas
   */
  async setPlanQuotas(quotas: Record<string, PlanQuota>, userId: string): Promise<void> {
    try {
      await this.setSetting(
        'plan_quotas',
        quotas,
        'json',
        userId,
        {
          description: 'Usage quotas and limits by plan',
          category: 'billing',
        }
      );

      console.log('Plan quotas updated successfully');
    } catch (error) {
      console.error('Failed to set plan quotas:', error);
      throw error;
    }
  }

  /**
   * Clear settings cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('Platform settings cache cleared');
  }
}

// Export singleton instance
export const platformSettings = PlatformSettingsService.getInstance();

// Common setting keys
export const SETTING_KEYS = {
  // Feature toggles
  MCP_ENABLED: 'mcp_enabled',
  CANARY_ENABLED: 'canary_enabled',
  STORAGE_DRIVER: 'storage_driver',
  RATE_LIMITING_ENABLED: 'rate_limiting_enabled',
  TELEMETRY_ENABLED: 'telemetry_enabled',

  // Model configuration
  MODEL_WEIGHTS: 'model_weights',
  DEFAULT_MODEL: 'default_model',
  MODEL_TIMEOUT_MS: 'model_timeout_ms',

  // System configuration
  MAX_CONCURRENT_REQUESTS: 'max_concurrent_requests',
  CACHE_TTL_SECONDS: 'cache_ttl_seconds',
  LOG_LEVEL: 'log_level',

  // Billing and quotas
  PLAN_QUOTAS: 'plan_quotas',
  BILLING_ENABLED: 'billing_enabled',
  TRIAL_PERIOD_DAYS: 'trial_period_days',

  // Security
  SESSION_TIMEOUT_MINUTES: 'session_timeout_minutes',
  PASSWORD_POLICY: 'password_policy',
  MFA_REQUIRED: 'mfa_required',

  // Monitoring
  HEALTH_CHECK_INTERVAL: 'health_check_interval',
  METRICS_RETENTION_DAYS: 'metrics_retention_days',
  ALERT_COOLDOWN_MINUTES: 'alert_cooldown_minutes',
} as const;

// Common feature flag names
export const FEATURE_FLAGS = {
  MCP_ENABLED: 'mcp_enabled',
  CANARY_ROLLOUT: 'canary_rollout',
  NEW_UI: 'new_ui',
  ADVANCED_METRICS: 'advanced_metrics',
  TEAM_FEATURES: 'team_features',
  API_V2: 'api_v2',
} as const;