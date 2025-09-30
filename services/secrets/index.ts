/**
 * Secrets Service Entry Point
 *
 * Provides the main interface for secrets management with simplified API.
 * This is the main interface that agents and other services should use.
 */

import { secretsManager } from './manager';
import { encryption } from './encryption';

/**
 * Store a secret securely
 */
export async function storeSecret(
  name: string,
  provider: string | undefined,
  value: string,
  userId: string,
  description?: string
): Promise<void> {
  return await secretsManager.storeSecret(name, provider, value, userId, description);
}

/**
 * Get a secret (decrypted)
 * This is the main function agents should use
 */
export async function getSecret(name: string, userId?: string): Promise<string> {
  return await secretsManager.getSecret(name, userId);
}

/**
 * List secrets with masked values
 */
export async function listSecrets(masked: boolean = true) {
  return await secretsManager.listSecrets(masked);
}

/**
 * Update an existing secret
 */
export async function updateSecret(
  name: string,
  updates: {
    value?: string;
    provider?: string;
    description?: string;
  },
  userId: string
): Promise<void> {
  return await secretsManager.updateSecret(name, updates, userId);
}

/**
 * Delete a secret
 */
export async function deleteSecret(name: string, userId: string): Promise<void> {
  return await secretsManager.deleteSecret(name, userId);
}

/**
 * Get statistics about secrets
 */
export async function getSecretStats() {
  return await secretsManager.getStats();
}

/**
 * Utility functions for external use
 */
export const utils = {
  /**
   * Mask a secret value for display
   */
  maskValue: (value: string, showLastChars: number = 4) => {
    return encryption.maskSecret(value, showLastChars);
  },

  /**
   * Generate a random key for secrets that need one
   */
  generateRandomKey: (length: number = 32) => {
    return encryption.generateRandomKey(length);
  },

  /**
   * Validate that encryption is working properly
   */
  validateEncryption: async () => {
    return await encryption.validateEncryption();
  },

  /**
   * Clear the secrets cache
   */
  clearCache: () => {
    secretsManager.clearCache();
  },

  /**
   * Get cache statistics
   */
  getCacheStats: () => {
    return secretsManager.getCacheStats();
  },
};

// Common secret names for easy reference
export const SECRET_NAMES = {
  // API Keys
  OPENAI_API_KEY: 'openai_api_key',
  ANTHROPIC_API_KEY: 'anthropic_api_key',
  GOOGLE_API_KEY: 'google_api_key',

  // Database
  DATABASE_URL: 'database_url',

  // External Services
  GITHUB_TOKEN: 'github_token',
  SLACK_WEBHOOK: 'slack_webhook_url',
  DISCORD_WEBHOOK: 'discord_webhook_url',

  // Encryption
  JWT_SECRET: 'jwt_secret',
  ENCRYPTION_KEY: 'encryption_master_key',

  // Storage
  AWS_ACCESS_KEY: 'aws_access_key_id',
  AWS_SECRET_KEY: 'aws_secret_access_key',

  // Monitoring
  SENTRY_DSN: 'sentry_dsn',
  DATADOG_API_KEY: 'datadog_api_key',
} as const;

// Provider types for organization
export const PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GOOGLE: 'google',
  AWS: 'aws',
  GITHUB: 'github',
  SLACK: 'slack',
  DISCORD: 'discord',
  DATABASE: 'database',
  MONITORING: 'monitoring',
  SECURITY: 'security',
} as const;

export type SecretName = typeof SECRET_NAMES[keyof typeof SECRET_NAMES];
export type Provider = typeof PROVIDERS[keyof typeof PROVIDERS];