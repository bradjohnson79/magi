/**
 * Secrets Encryption Tests
 *
 * Tests for the encryption service ensuring secrets are properly
 * encrypted at rest and decrypted correctly during retrieval.
 */

import { EncryptionService } from '@/services/secrets/encryption';

describe('Secrets Encryption', () => {
  let encryption: EncryptionService;

  beforeEach(() => {
    // Set up test environment variables
    process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-for-encryption-testing-2024';
    process.env.ENCRYPTION_SALT = 'test-salt-for-encryption';

    encryption = EncryptionService.getInstance();
  });

  afterEach(() => {
    // Clean up environment variables
    delete process.env.ENCRYPTION_MASTER_KEY;
    delete process.env.ENCRYPTION_SALT;
  });

  describe('Basic Encryption/Decryption', () => {
    it('should encrypt and decrypt a secret value correctly', async () => {
      const originalValue = 'sk-1234567890abcdefghijklmnopqrstuvwxyz';

      const encrypted = await encryption.encrypt(originalValue);
      expect(encrypted).not.toBe(originalValue);
      expect(typeof encrypted).toBe('string');

      const decrypted = await encryption.decrypt(encrypted);
      expect(decrypted).toBe(originalValue);
    });

    it('should produce different encrypted values for the same input', async () => {
      const value = 'test-secret-value';

      const encrypted1 = await encryption.encrypt(value);
      const encrypted2 = await encryption.encrypt(value);

      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to the same value
      const decrypted1 = await encryption.decrypt(encrypted1);
      const decrypted2 = await encryption.decrypt(encrypted2);

      expect(decrypted1).toBe(value);
      expect(decrypted2).toBe(value);
    });

    it('should handle empty and whitespace values', async () => {
      const testCases = ['', ' ', '  \n\t  ', 'a'];

      for (const testCase of testCases) {
        const encrypted = await encryption.encrypt(testCase);
        const decrypted = await encryption.decrypt(encrypted);
        expect(decrypted).toBe(testCase);
      }
    });

    it('should handle unicode and special characters', async () => {
      const testCases = [
        '🔐 secure-key-with-emoji',
        'key-with-üñíçødé',
        'key\nwith\nnewlines',
        'key\twith\ttabs',
        'key"with\'quotes',
        'key{with}[brackets]',
      ];

      for (const testCase of testCases) {
        const encrypted = await encryption.encrypt(testCase);
        const decrypted = await encryption.decrypt(encrypted);
        expect(decrypted).toBe(testCase);
      }
    });
  });

  describe('Error Handling', () => {
    it('should throw error when master key is missing', async () => {
      delete process.env.ENCRYPTION_MASTER_KEY;

      await expect(encryption.encrypt('test')).rejects.toThrow(
        'ENCRYPTION_MASTER_KEY environment variable is required'
      );
    });

    it('should throw error when decrypting invalid data', async () => {
      await expect(encryption.decrypt('invalid-encrypted-data')).rejects.toThrow(
        'Failed to decrypt secret'
      );
    });

    it('should throw error when decrypting corrupted data', async () => {
      const validEncrypted = await encryption.encrypt('test');
      const corrupted = validEncrypted.slice(0, -10) + 'corrupted';

      await expect(encryption.decrypt(corrupted)).rejects.toThrow(
        'Failed to decrypt secret'
      );
    });

    it('should handle malformed base64 data', async () => {
      await expect(encryption.decrypt('not-base64-data!')).rejects.toThrow(
        'Failed to decrypt secret'
      );
    });
  });

  describe('Security Features', () => {
    it('should validate encryption strength', async () => {
      const isValid = await encryption.validateEncryption();
      expect(isValid).toBe(true);
    });

    it('should use authenticated encryption (GCM)', async () => {
      // Test that tampering with encrypted data is detected
      const originalValue = 'sensitive-secret';
      const encrypted = await encryption.encrypt(originalValue);

      // Parse the encrypted data structure
      const parsed = JSON.parse(Buffer.from(encrypted, 'base64').toString('utf8'));
      expect(parsed).toHaveProperty('iv');
      expect(parsed).toHaveProperty('authTag');
      expect(parsed).toHaveProperty('encrypted');

      // Tamper with the encrypted data
      parsed.encrypted = parsed.encrypted.slice(0, -2) + 'ff';
      const tamperedData = Buffer.from(JSON.stringify(parsed)).toString('base64');

      // Should fail to decrypt due to authentication tag mismatch
      await expect(encryption.decrypt(tamperedData)).rejects.toThrow(
        'Failed to decrypt secret'
      );
    });

    it('should generate secure random keys', () => {
      const key1 = encryption.generateRandomKey(32);
      const key2 = encryption.generateRandomKey(32);

      expect(key1).not.toBe(key2);
      expect(key1.length).toBe(64); // 32 bytes = 64 hex characters
      expect(key2.length).toBe(64);

      // Should be valid hex
      expect(/^[a-f0-9]+$/i.test(key1)).toBe(true);
      expect(/^[a-f0-9]+$/i.test(key2)).toBe(true);
    });

    it('should securely compare strings', () => {
      const str1 = 'secret-value';
      const str2 = 'secret-value';
      const str3 = 'different-value';

      expect(encryption.secureCompare(str1, str2)).toBe(true);
      expect(encryption.secureCompare(str1, str3)).toBe(false);
      expect(encryption.secureCompare('', '')).toBe(true);
      expect(encryption.secureCompare('a', 'ab')).toBe(false);
    });
  });

  describe('Value Masking', () => {
    it('should mask secret values for display', () => {
      const testCases = [
        { value: 'sk-1234567890abcdef', expected: '****************cdef' },
        { value: 'short', expected: '*****' },
        { value: 'x', expected: '*' },
        { value: '', expected: '' },
        { value: 'github_pat_11ABC123_xyz789', expected: '**********************789' },
      ];

      testCases.forEach(({ value, expected }) => {
        const masked = encryption.maskSecret(value);
        expect(masked).toBe(expected);
      });
    });

    it('should allow custom masking parameters', () => {
      const value = 'very-long-secret-key-value';

      const masked2 = encryption.maskSecret(value, 2);
      expect(masked2).toBe('************************ue');

      const masked6 = encryption.maskSecret(value, 6);
      expect(masked6).toBe('********************-value');
    });
  });

  describe('Performance', () => {
    it('should encrypt and decrypt within reasonable time', async () => {
      const value = 'performance-test-secret-value';
      const iterations = 100;

      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        const encrypted = await encryption.encrypt(value);
        const decrypted = await encryption.decrypt(encrypted);
        expect(decrypted).toBe(value);
      }

      const totalTime = Date.now() - startTime;
      const averageTime = totalTime / iterations;

      // Should complete each operation in under 10ms on average
      expect(averageTime).toBeLessThan(10);
    });

    it('should handle large secret values', async () => {
      // Test with a 1MB secret (large JSON config, for example)
      const largeValue = 'x'.repeat(1024 * 1024);

      const startTime = Date.now();
      const encrypted = await encryption.encrypt(largeValue);
      const decrypted = await encryption.decrypt(encrypted);
      const endTime = Date.now();

      expect(decrypted).toBe(largeValue);
      expect(endTime - startTime).toBeLessThan(1000); // Should complete in under 1 second
    });
  });

  describe('Encryption Consistency', () => {
    it('should work with different instances', async () => {
      const value = 'multi-instance-test';

      const encryption1 = EncryptionService.getInstance();
      const encryption2 = EncryptionService.getInstance();

      const encrypted = await encryption1.encrypt(value);
      const decrypted = await encryption2.decrypt(encrypted);

      expect(decrypted).toBe(value);
    });

    it('should handle concurrent operations', async () => {
      const values = Array.from({ length: 50 }, (_, i) => `secret-${i}`);

      const encryptPromises = values.map(value => encryption.encrypt(value));
      const encrypted = await Promise.all(encryptPromises);

      const decryptPromises = encrypted.map(enc => encryption.decrypt(enc));
      const decrypted = await Promise.all(decryptPromises);

      decrypted.forEach((value, index) => {
        expect(value).toBe(values[index]);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very long secret names', async () => {
      const longValue = 'sk-' + 'a'.repeat(1000);

      const encrypted = await encryption.encrypt(longValue);
      const decrypted = await encryption.decrypt(encrypted);

      expect(decrypted).toBe(longValue);
    });

    it('should handle binary-like data', async () => {
      const binaryLike = Buffer.from('binary data').toString('base64');

      const encrypted = await encryption.encrypt(binaryLike);
      const decrypted = await encryption.decrypt(encrypted);

      expect(decrypted).toBe(binaryLike);
    });

    it('should handle JSON strings as secrets', async () => {
      const jsonSecret = JSON.stringify({
        type: 'service_account',
        private_key: 'test-key',
        client_email: 'test@example.com',
      });

      const encrypted = await encryption.encrypt(jsonSecret);
      const decrypted = await encryption.decrypt(encrypted);

      expect(decrypted).toBe(jsonSecret);
      expect(JSON.parse(decrypted)).toEqual(JSON.parse(jsonSecret));
    });
  });
});