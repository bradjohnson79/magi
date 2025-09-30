/**
 * Secrets Manager Tests
 *
 * Tests for the complete secrets management system including
 * storage, retrieval, caching, and security auditing.
 */

import { SecretsManager } from '@/services/secrets/manager';
import { encryption } from '@/services/secrets/encryption';

// Mock dependencies
jest.mock('@/lib/db', () => ({
  prisma: {
    secret: {
      create: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}));

jest.mock('@/services/audit/logger', () => ({
  auditLogger: {
    logAdmin: jest.fn(),
    logSecurity: jest.fn(),
    logSystem: jest.fn(),
  },
}));

jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn()),
  addSpanAttributes: jest.fn(),
  SPAN_ATTRIBUTES: {
    OPERATION_TYPE: 'operation.type',
  },
}));

const { prisma } = require('@/lib/db');
const { auditLogger } = require('@/services/audit/logger');

describe('Secrets Manager', () => {
  let secretsManager: SecretsManager;
  const userId = 'test-user-123';

  beforeEach(() => {
    jest.clearAllMocks();
    secretsManager = SecretsManager.getInstance();

    // Set up test environment
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-testing';
    process.env.ENCRYPTION_SALT = 'test-salt';
  });

  afterEach(() => {
    secretsManager.clearCache();
    delete process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.ENCRYPTION_SALT;
  });

  describe('Secret Storage', () => {
    it('should store a secret with encryption', async () => {
      const secretName = 'test_api_key';
      const secretValue = 'sk-1234567890abcdef';
      const provider = 'openai';

      prisma.secret.findUnique.mockResolvedValue(null); // No existing secret
      prisma.secret.create.mockResolvedValue({
        id: 'secret-id-123',
        name: secretName,
        valueEncrypted: 'encrypted-value',
        maskedValue: '****************cdef',
        provider,
        createdBy: userId,
      });

      await secretsManager.storeSecret(secretName, provider, secretValue, userId);

      expect(prisma.secret.findUnique).toHaveBeenCalledWith({
        where: { name: secretName },
      });

      expect(prisma.secret.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: secretName,
          valueEncrypted: expect.any(String),
          maskedValue: expect.stringMatching(/^\*+cdef$/),
          provider,
          createdBy: userId,
        }),
      });

      expect(auditLogger.logAdmin).toHaveBeenCalledWith(
        'admin.secret_created',
        userId,
        secretName,
        expect.objectContaining({
          provider,
          maskedValue: expect.any(String),
        })
      );
    });

    it('should reject duplicate secret names', async () => {
      const secretName = 'existing_secret';

      prisma.secret.findUnique.mockResolvedValue({
        id: 'existing-id',
        name: secretName,
      });

      await expect(
        secretsManager.storeSecret(secretName, 'test', 'value', userId)
      ).rejects.toThrow(`Secret with name '${secretName}' already exists`);

      expect(prisma.secret.create).not.toHaveBeenCalled();
    });

    it('should validate required parameters', async () => {
      await expect(
        secretsManager.storeSecret('', 'provider', 'value', userId)
      ).rejects.toThrow('Missing required parameters');

      await expect(
        secretsManager.storeSecret('name', 'provider', '', userId)
      ).rejects.toThrow('Missing required parameters');

      await expect(
        secretsManager.storeSecret('name', 'provider', 'value', '')
      ).rejects.toThrow('Missing required parameters');
    });
  });

  describe('Secret Retrieval', () => {
    it('should retrieve and decrypt a secret', async () => {
      const secretName = 'test_secret';
      const originalValue = 'secret-value-123';
      const encryptedValue = await encryption.encrypt(originalValue);

      prisma.secret.findUnique.mockResolvedValue({
        id: 'secret-id',
        name: secretName,
        valueEncrypted: encryptedValue,
        provider: 'test',
      });

      prisma.secret.update.mockResolvedValue({});

      const retrievedValue = await secretsManager.getSecret(secretName, userId);

      expect(retrievedValue).toBe(originalValue);
      expect(prisma.secret.findUnique).toHaveBeenCalledWith({
        where: { name: secretName },
      });
      expect(prisma.secret.update).toHaveBeenCalledWith({
        where: { name: secretName },
        data: { lastUsedAt: expect.any(Date) },
      });
      expect(auditLogger.logSystem).toHaveBeenCalledWith(
        'system.secret_accessed',
        expect.objectContaining({
          secretName,
          accessedBy: userId,
        })
      );
    });

    it('should use cache for subsequent retrievals', async () => {
      const secretName = 'cached_secret';
      const originalValue = 'cached-value';
      const encryptedValue = await encryption.encrypt(originalValue);

      prisma.secret.findUnique.mockResolvedValue({
        id: 'secret-id',
        name: secretName,
        valueEncrypted: encryptedValue,
        provider: 'test',
      });

      prisma.secret.update.mockResolvedValue({});

      // First retrieval - should hit database
      const value1 = await secretsManager.getSecret(secretName, userId);
      expect(value1).toBe(originalValue);
      expect(prisma.secret.findUnique).toHaveBeenCalledTimes(1);

      // Second retrieval - should use cache
      const value2 = await secretsManager.getSecret(secretName, userId);
      expect(value2).toBe(originalValue);
      expect(prisma.secret.findUnique).toHaveBeenCalledTimes(1); // No additional DB call
    });

    it('should throw error for non-existent secrets', async () => {
      const secretName = 'nonexistent_secret';

      prisma.secret.findUnique.mockResolvedValue(null);

      await expect(
        secretsManager.getSecret(secretName, userId)
      ).rejects.toThrow(`Secret '${secretName}' not found`);

      expect(auditLogger.logSecurity).toHaveBeenCalledWith(
        'security.secret_access_failed',
        userId,
        expect.objectContaining({
          secretName,
          error: expect.stringContaining('not found'),
        })
      );
    });
  });

  describe('Secret Listing', () => {
    it('should list secrets with masked values', async () => {
      const mockSecrets = [
        {
          id: 'secret-1',
          name: 'openai_key',
          maskedValue: '****************cdef',
          provider: 'openai',
          description: 'OpenAI API key',
          lastUsedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
          creator: {
            id: userId,
            email: 'admin@example.com',
            name: 'Admin User',
          },
        },
        {
          id: 'secret-2',
          name: 'github_token',
          maskedValue: '********************789',
          provider: 'github',
          description: null,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          creator: {
            id: userId,
            email: 'admin@example.com',
            name: 'Admin User',
          },
        },
      ];

      prisma.secret.findMany.mockResolvedValue(mockSecrets);

      const result = await secretsManager.listSecrets(true);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(expect.objectContaining({
        id: 'secret-1',
        name: 'openai_key',
        maskedValue: '****************cdef',
        provider: 'openai',
        description: 'OpenAI API key',
      }));

      expect(result[1]).toEqual(expect.objectContaining({
        id: 'secret-2',
        name: 'github_token',
        maskedValue: '********************789',
        provider: 'github',
        description: undefined,
      }));
    });

    it('should hide values when masked=false', async () => {
      const mockSecrets = [
        {
          id: 'secret-1',
          name: 'test_secret',
          maskedValue: '****1234',
          provider: 'test',
          description: null,
          lastUsedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          creator: {
            id: userId,
            email: 'admin@example.com',
            name: null,
          },
        },
      ];

      prisma.secret.findMany.mockResolvedValue(mockSecrets);

      const result = await secretsManager.listSecrets(false);

      expect(result[0].maskedValue).toBe('[HIDDEN]');
    });
  });

  describe('Secret Updates', () => {
    it('should update secret value with re-encryption', async () => {
      const secretName = 'update_test';
      const newValue = 'new-secret-value';

      prisma.secret.findUnique.mockResolvedValue({
        id: 'secret-id',
        name: secretName,
      });

      prisma.secret.update.mockResolvedValue({});

      await secretsManager.updateSecret(
        secretName,
        { value: newValue, description: 'Updated description' },
        userId
      );

      expect(prisma.secret.update).toHaveBeenCalledWith({
        where: { name: secretName },
        data: expect.objectContaining({
          valueEncrypted: expect.any(String),
          maskedValue: expect.any(String),
          description: 'Updated description',
        }),
      });

      expect(auditLogger.logAdmin).toHaveBeenCalledWith(
        'admin.secret_updated',
        userId,
        secretName,
        expect.objectContaining({
          updatedFields: ['value', 'description'],
        })
      );
    });

    it('should update only specified fields', async () => {
      const secretName = 'partial_update_test';

      prisma.secret.findUnique.mockResolvedValue({
        id: 'secret-id',
        name: secretName,
      });

      prisma.secret.update.mockResolvedValue({});

      await secretsManager.updateSecret(
        secretName,
        { provider: 'new-provider' },
        userId
      );

      expect(prisma.secret.update).toHaveBeenCalledWith({
        where: { name: secretName },
        data: {
          provider: 'new-provider',
        },
      });

      // Should not include encryption fields if value wasn't updated
      const updateCall = prisma.secret.update.mock.calls[0][0];
      expect(updateCall.data).not.toHaveProperty('valueEncrypted');
      expect(updateCall.data).not.toHaveProperty('maskedValue');
    });
  });

  describe('Secret Deletion', () => {
    it('should delete a secret and clear cache', async () => {
      const secretName = 'delete_test';

      prisma.secret.findUnique.mockResolvedValue({
        id: 'secret-id',
        provider: 'test',
      });

      prisma.secret.delete.mockResolvedValue({});

      await secretsManager.deleteSecret(secretName, userId);

      expect(prisma.secret.delete).toHaveBeenCalledWith({
        where: { name: secretName },
      });

      expect(auditLogger.logAdmin).toHaveBeenCalledWith(
        'admin.secret_deleted',
        userId,
        secretName,
        expect.objectContaining({
          provider: 'test',
        })
      );
    });

    it('should throw error when deleting non-existent secret', async () => {
      const secretName = 'nonexistent';

      prisma.secret.findUnique.mockResolvedValue(null);

      await expect(
        secretsManager.deleteSecret(secretName, userId)
      ).rejects.toThrow(`Secret '${secretName}' not found`);

      expect(prisma.secret.delete).not.toHaveBeenCalled();
    });
  });

  describe('Statistics', () => {
    it('should generate secret statistics', async () => {
      prisma.secret.count.mockResolvedValue(10);

      prisma.secret.groupBy.mockResolvedValue([
        { provider: 'openai', _count: { provider: 3 } },
        { provider: 'github', _count: { provider: 2 } },
        { provider: null, _count: { provider: 5 } },
      ]);

      prisma.secret.findMany
        .mockResolvedValueOnce([
          { name: 'recent1', lastUsedAt: new Date() },
          { name: 'recent2', lastUsedAt: new Date() },
        ])
        .mockResolvedValueOnce([
          { name: 'old1', createdAt: new Date('2023-01-01') },
          { name: 'old2', createdAt: new Date('2023-01-02') },
        ]);

      const stats = await secretsManager.getStats();

      expect(stats.total).toBe(10);
      expect(stats.byProvider).toEqual([
        { provider: 'openai', count: 3 },
        { provider: 'github', count: 2 },
        { provider: 'unspecified', count: 5 },
      ]);
      expect(stats.recentlyUsed).toHaveLength(2);
      expect(stats.oldestSecrets).toHaveLength(2);
    });
  });

  describe('Cache Management', () => {
    it('should clear cache when requested', () => {
      // This is more of an integration test since cache is internal
      secretsManager.clearCache();

      const stats = secretsManager.getCacheStats();
      expect(stats.size).toBe(0);
    });

    it('should provide cache statistics', async () => {
      const stats = secretsManager.getCacheStats();

      expect(stats).toHaveProperty('size');
      expect(stats).toHaveProperty('cleanup');
      expect(typeof stats.size).toBe('number');
      expect(typeof stats.cleanup).toBe('function');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      const secretName = 'db_error_test';

      prisma.secret.findUnique.mockRejectedValue(new Error('Database connection failed'));

      await expect(
        secretsManager.getSecret(secretName, userId)
      ).rejects.toThrow('Database connection failed');

      expect(auditLogger.logSecurity).toHaveBeenCalledWith(
        'security.secret_access_failed',
        userId,
        expect.objectContaining({
          secretName,
          error: 'Database connection failed',
        })
      );
    });

    it('should handle encryption errors during storage', async () => {
      const secretName = 'encryption_error_test';

      prisma.secret.findUnique.mockResolvedValue(null);

      // Mock encryption failure
      jest.spyOn(encryption, 'encrypt').mockRejectedValue(new Error('Encryption failed'));

      await expect(
        secretsManager.storeSecret(secretName, 'test', 'value', userId)
      ).rejects.toThrow('Encryption failed');

      expect(auditLogger.logSecurity).toHaveBeenCalledWith(
        'security.secret_store_failed',
        userId,
        expect.objectContaining({
          secretName,
          error: 'Encryption failed',
        })
      );
    });
  });

  describe('Security Auditing', () => {
    it('should log all secret access attempts', async () => {
      const secretName = 'audit_test';
      const encryptedValue = await encryption.encrypt('test-value');

      prisma.secret.findUnique.mockResolvedValue({
        id: 'secret-id',
        name: secretName,
        valueEncrypted: encryptedValue,
        provider: 'test',
      });

      prisma.secret.update.mockResolvedValue({});

      await secretsManager.getSecret(secretName, userId);

      expect(auditLogger.logSystem).toHaveBeenCalledWith(
        'system.secret_accessed',
        expect.objectContaining({
          secretName,
          accessedBy: userId,
          provider: 'test',
        })
      );
    });

    it('should log failed access attempts', async () => {
      const secretName = 'failed_access_test';

      prisma.secret.findUnique.mockResolvedValue(null);

      await expect(
        secretsManager.getSecret(secretName, userId)
      ).rejects.toThrow();

      expect(auditLogger.logSecurity).toHaveBeenCalledWith(
        'security.secret_access_failed',
        userId,
        expect.objectContaining({
          secretName,
        })
      );
    });
  });
});