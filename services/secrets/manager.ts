/**
 * Secrets Manager Service
 *
 * Secure management of secrets with encryption, caching, and audit logging.
 * Provides the core functionality for storing, retrieving, and managing secrets.
 */

import { prisma } from '@/lib/db';
import { encryption } from './encryption';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

interface SecretData {
  name: string;
  value: string;
  provider?: string;
  description?: string;
}

interface SecretListItem {
  id: string;
  name: string;
  maskedValue: string;
  provider?: string;
  description?: string;
  lastUsedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  creator: {
    id: string;
    email: string;
    name?: string;
  };
}

interface SecretStats {
  total: number;
  byProvider: Array<{ provider: string; count: number }>;
  recentlyUsed: Array<{ name: string; lastUsedAt: Date }>;
  oldestSecrets: Array<{ name: string; createdAt: Date }>;
}

// In-memory cache for decrypted secrets
class SecretCache {
  private cache = new Map<string, { value: string; expiry: number }>();
  private readonly TTL = 15 * 60 * 1000; // 15 minutes

  set(key: string, value: string): void {
    const expiry = Date.now() + this.TTL;
    this.cache.set(key, { value, expiry });
  }

  get(key: string): string | null {
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

  size(): number {
    return this.cache.size;
  }

  // Clean expired entries
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

export class SecretsManager {
  private static instance: SecretsManager;
  private cache = new SecretCache();
  private cleanupInterval: NodeJS.Timer | null = null;

  private constructor() {
    // Start cache cleanup every 5 minutes
    this.cleanupInterval = setInterval(() => {
      const cleaned = this.cache.cleanup();
      if (cleaned > 0) {
        console.log(`Cleaned ${cleaned} expired secrets from cache`);
      }
    }, 5 * 60 * 1000);
  }

  static getInstance(): SecretsManager {
    if (!SecretsManager.instance) {
      SecretsManager.instance = new SecretsManager();
    }
    return SecretsManager.instance;
  }

  /**
   * Store a new secret
   */
  async storeSecret(
    name: string,
    provider: string | undefined,
    value: string,
    userId: string,
    description?: string
  ): Promise<void> {
    return await withSpan('secrets.store', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'secret_storage',
          'secret.name': name,
          'secret.provider': provider || 'unknown',
        });

        // Validate input
        if (!name || !value || !userId) {
          throw new Error('Missing required parameters: name, value, or userId');
        }

        // Check if secret already exists
        const existing = await prisma.secret.findUnique({
          where: { name },
        });

        if (existing) {
          throw new Error(`Secret with name '${name}' already exists`);
        }

        // Encrypt the value
        const encryptedValue = await encryption.encrypt(value);
        const maskedValue = encryption.maskSecret(value);

        // Store in database
        await prisma.secret.create({
          data: {
            name,
            valueEncrypted: encryptedValue,
            maskedValue,
            provider,
            description,
            createdBy: userId,
          },
        });

        // Invalidate cache entry if it exists
        this.cache.delete(name);

        // Log the action
        await auditLogger.logAdmin('admin.secret_created', userId, name, {
          provider,
          description,
          maskedValue,
        });

        console.log(`Secret '${name}' stored successfully`);
      } catch (error) {
        console.error('Failed to store secret:', error);

        await auditLogger.logSecurity('security.secret_store_failed', userId, {
          secretName: name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    });
  }

  /**
   * Retrieve and decrypt a secret
   */
  async getSecret(name: string, userId?: string): Promise<string> {
    return await withSpan('secrets.get', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'secret_retrieval',
          'secret.name': name,
        });

        // Check cache first
        const cached = this.cache.get(name);
        if (cached) {
          console.log(`Secret '${name}' retrieved from cache`);
          return cached;
        }

        // Retrieve from database
        const secret = await prisma.secret.findUnique({
          where: { name },
        });

        if (!secret) {
          throw new Error(`Secret '${name}' not found`);
        }

        // Decrypt the value
        const decryptedValue = await encryption.decrypt(secret.valueEncrypted);

        // Cache the decrypted value
        this.cache.set(name, decryptedValue);

        // Update last used timestamp
        await prisma.secret.update({
          where: { name },
          data: { lastUsedAt: new Date() },
        });

        // Log the access (with care not to log the actual value)
        if (userId) {
          await auditLogger.logSystem('system.secret_accessed', {
            secretName: name,
            accessedBy: userId,
            provider: secret.provider,
          });
        }

        console.log(`Secret '${name}' retrieved successfully`);
        return decryptedValue;
      } catch (error) {
        console.error('Failed to retrieve secret:', error);

        if (userId) {
          await auditLogger.logSecurity('security.secret_access_failed', userId, {
            secretName: name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        throw error;
      }
    });
  }

  /**
   * List all secrets (with masked values)
   */
  async listSecrets(masked: boolean = true): Promise<SecretListItem[]> {
    return await withSpan('secrets.list', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'secret_listing',
          'list.masked': masked,
        });

        const secrets = await prisma.secret.findMany({
          include: {
            creator: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        });

        return secrets.map(secret => ({
          id: secret.id,
          name: secret.name,
          maskedValue: masked ? secret.maskedValue : '[HIDDEN]',
          provider: secret.provider || undefined,
          description: secret.description || undefined,
          lastUsedAt: secret.lastUsedAt || undefined,
          createdAt: secret.createdAt,
          updatedAt: secret.updatedAt,
          creator: secret.creator,
        }));
      } catch (error) {
        console.error('Failed to list secrets:', error);
        throw error;
      }
    });
  }

  /**
   * Update an existing secret
   */
  async updateSecret(
    name: string,
    updates: Partial<SecretData>,
    userId: string
  ): Promise<void> {
    return await withSpan('secrets.update', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'secret_update',
          'secret.name': name,
        });

        const secret = await prisma.secret.findUnique({
          where: { name },
        });

        if (!secret) {
          throw new Error(`Secret '${name}' not found`);
        }

        const updateData: any = {};

        // If value is being updated, encrypt it
        if (updates.value) {
          updateData.valueEncrypted = await encryption.encrypt(updates.value);
          updateData.maskedValue = encryption.maskSecret(updates.value);

          // Invalidate cache
          this.cache.delete(name);
        }

        // Update other fields
        if (updates.provider !== undefined) {
          updateData.provider = updates.provider;
        }
        if (updates.description !== undefined) {
          updateData.description = updates.description;
        }

        await prisma.secret.update({
          where: { name },
          data: updateData,
        });

        // Log the update
        await auditLogger.logAdmin('admin.secret_updated', userId, name, {
          updatedFields: Object.keys(updates),
          provider: updates.provider,
        });

        console.log(`Secret '${name}' updated successfully`);
      } catch (error) {
        console.error('Failed to update secret:', error);

        await auditLogger.logSecurity('security.secret_update_failed', userId, {
          secretName: name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    });
  }

  /**
   * Delete a secret
   */
  async deleteSecret(name: string, userId: string): Promise<void> {
    return await withSpan('secrets.delete', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'secret_deletion',
          'secret.name': name,
        });

        const secret = await prisma.secret.findUnique({
          where: { name },
          select: { id: true, provider: true },
        });

        if (!secret) {
          throw new Error(`Secret '${name}' not found`);
        }

        // Remove from database
        await prisma.secret.delete({
          where: { name },
        });

        // Remove from cache
        this.cache.delete(name);

        // Log the deletion
        await auditLogger.logAdmin('admin.secret_deleted', userId, name, {
          provider: secret.provider,
        });

        console.log(`Secret '${name}' deleted successfully`);
      } catch (error) {
        console.error('Failed to delete secret:', error);

        await auditLogger.logSecurity('security.secret_delete_failed', userId, {
          secretName: name,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        throw error;
      }
    });
  }

  /**
   * Get statistics about stored secrets
   */
  async getStats(): Promise<SecretStats> {
    return await withSpan('secrets.stats', async () => {
      try {
        const [total, byProvider, recentlyUsed, oldestSecrets] = await Promise.all([
          // Total count
          prisma.secret.count(),

          // Count by provider
          prisma.secret.groupBy({
            by: ['provider'],
            _count: { provider: true },
          }),

          // Recently used secrets
          prisma.secret.findMany({
            where: {
              lastUsedAt: { not: null },
            },
            select: {
              name: true,
              lastUsedAt: true,
            },
            orderBy: { lastUsedAt: 'desc' },
            take: 5,
          }),

          // Oldest secrets
          prisma.secret.findMany({
            select: {
              name: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'asc' },
            take: 5,
          }),
        ]);

        return {
          total,
          byProvider: byProvider.map(item => ({
            provider: item.provider || 'unspecified',
            count: item._count.provider,
          })),
          recentlyUsed: recentlyUsed
            .filter(s => s.lastUsedAt)
            .map(s => ({
              name: s.name,
              lastUsedAt: s.lastUsedAt!,
            })),
          oldestSecrets: oldestSecrets.map(s => ({
            name: s.name,
            createdAt: s.createdAt,
          })),
        };
      } catch (error) {
        console.error('Failed to get secret statistics:', error);
        throw error;
      }
    });
  }

  /**
   * Clear the secrets cache
   */
  clearCache(): void {
    this.cache.clear();
    console.log('Secrets cache cleared');
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; cleanup: () => number } {
    return {
      size: this.cache.size(),
      cleanup: () => this.cache.cleanup(),
    };
  }

  /**
   * Shutdown the secrets manager
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.cache.clear();
  }
}

// Export singleton instance
export const secretsManager = SecretsManager.getInstance();