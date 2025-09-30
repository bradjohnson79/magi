/**
 * Encryption Service for Secrets Management
 *
 * Provides secure encryption/decryption using Node.js crypto module
 * with AES-256-GCM for authenticated encryption.
 */

import { createCipherGCM, createDecipherGCM, randomBytes, scrypt } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt);

export class EncryptionService {
  private static instance: EncryptionService;
  private masterKey: Buffer | null = null;

  private constructor() {}

  static getInstance(): EncryptionService {
    if (!EncryptionService.instance) {
      EncryptionService.instance = new EncryptionService();
    }
    return EncryptionService.instance;
  }

  /**
   * Initialize the encryption service with a master key
   */
  async initialize(): Promise<void> {
    const masterPassword = process.env.ENCRYPTION_MASTER_KEY;
    if (!masterPassword) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }

    // Derive a key from the master password using a salt
    const salt = process.env.ENCRYPTION_SALT || 'magi-secrets-salt-2024';
    this.masterKey = (await scryptAsync(masterPassword, salt, 32)) as Buffer;
  }

  /**
   * Encrypt a secret value using AES-256-GCM
   */
  async encrypt(plaintext: string): Promise<string> {
    if (!this.masterKey) {
      await this.initialize();
    }

    if (!this.masterKey) {
      throw new Error('Encryption service not properly initialized');
    }

    try {
      // Generate a random IV for each encryption
      const iv = randomBytes(16);

      // Create cipher with AES-256-GCM
      const cipher = createCipherGCM('aes-256-gcm', this.masterKey);
      cipher.setAAD(Buffer.from('magi-secret', 'utf8')); // Additional authenticated data

      // Encrypt the plaintext
      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      // Get the authentication tag
      const authTag = cipher.getAuthTag();

      // Combine IV, auth tag, and encrypted data
      const result = {
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex'),
        encrypted: encrypted,
      };

      return Buffer.from(JSON.stringify(result)).toString('base64');
    } catch (error) {
      console.error('Encryption failed:', error);
      throw new Error('Failed to encrypt secret');
    }
  }

  /**
   * Decrypt a secret value
   */
  async decrypt(encryptedData: string): Promise<string> {
    if (!this.masterKey) {
      await this.initialize();
    }

    if (!this.masterKey) {
      throw new Error('Encryption service not properly initialized');
    }

    try {
      // Parse the encrypted data
      const data = JSON.parse(Buffer.from(encryptedData, 'base64').toString('utf8'));
      const { iv, authTag, encrypted } = data;

      // Create decipher
      const decipher = createDecipherGCM('aes-256-gcm', this.masterKey);
      decipher.setAAD(Buffer.from('magi-secret', 'utf8'));
      decipher.setAuthTag(Buffer.from(authTag, 'hex'));

      // Decrypt the data
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      console.error('Decryption failed:', error);
      throw new Error('Failed to decrypt secret');
    }
  }

  /**
   * Create a masked version of a secret for display
   */
  maskSecret(value: string, showLastChars: number = 4): string {
    if (value.length <= showLastChars) {
      return '*'.repeat(value.length);
    }

    const maskedLength = Math.max(8, value.length - showLastChars);
    const masked = '*'.repeat(maskedLength);
    const visible = value.slice(-showLastChars);

    return masked + visible;
  }

  /**
   * Validate encryption strength and key derivation
   */
  async validateEncryption(): Promise<boolean> {
    try {
      const testValue = 'test-encryption-validation';
      const encrypted = await this.encrypt(testValue);
      const decrypted = await this.decrypt(encrypted);

      return testValue === decrypted;
    } catch (error) {
      console.error('Encryption validation failed:', error);
      return false;
    }
  }

  /**
   * Generate a random secret key for providers that need it
   */
  generateRandomKey(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Securely compare two strings to prevent timing attacks
   */
  secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }
}

// Export a singleton instance
export const encryption = EncryptionService.getInstance();