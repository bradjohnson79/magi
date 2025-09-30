/**
 * Secrets Service
 *
 * Manages encrypted secrets storage and retrieval
 * Uses encryption for sensitive data protection
 */

import { prisma } from '@/lib/db'
import { encrypt, decrypt } from '@/lib/utils/encryption'

export interface Secret {
  id: string
  name: string
  valueEncrypted: string
  maskedValue: string
  provider?: string | null
  description?: string | null
  createdBy: string
  lastUsedAt?: Date | null
  createdAt: Date
  updatedAt: Date
}

export class SecretsService {
  private static instance: SecretsService

  private constructor() {}

  public static getInstance(): SecretsService {
    if (!SecretsService.instance) {
      SecretsService.instance = new SecretsService()
    }
    return SecretsService.instance
  }

  /**
   * Get a secret by name (decrypted)
   */
  async getSecret(name: string): Promise<string | null> {
    try {
      const secret = await prisma.secret.findUnique({
        where: { name }
      })

      if (!secret) {
        return null
      }

      // Update last used timestamp
      await prisma.secret.update({
        where: { id: secret.id },
        data: { lastUsedAt: new Date() }
      })

      // Decrypt and return the value
      return decrypt(secret.valueEncrypted)
    } catch (error) {
      console.error('Error getting secret:', error)
      return null
    }
  }

  /**
   * Set or update a secret (with encryption)
   */
  async setSecret(
    name: string,
    value: string,
    userId: string,
    options?: {
      provider?: string
      description?: string
    }
  ): Promise<Secret> {
    try {
      // Encrypt the value
      const valueEncrypted = encrypt(value)

      // Create masked value for display
      const maskedValue = this.maskValue(value)

      // Upsert the secret
      const secret = await prisma.secret.upsert({
        where: { name },
        update: {
          valueEncrypted,
          maskedValue,
          provider: options?.provider,
          description: options?.description,
          updatedAt: new Date()
        },
        create: {
          name,
          valueEncrypted,
          maskedValue,
          provider: options?.provider,
          description: options?.description,
          createdBy: userId
        }
      })

      return secret
    } catch (error) {
      console.error('Error setting secret:', error)
      throw new Error('Failed to store secret')
    }
  }

  /**
   * Delete a secret
   */
  async deleteSecret(name: string): Promise<boolean> {
    try {
      await prisma.secret.delete({
        where: { name }
      })
      return true
    } catch (error) {
      console.error('Error deleting secret:', error)
      return false
    }
  }

  /**
   * List all secrets (without decrypting values)
   */
  async listSecrets(userId?: string): Promise<Secret[]> {
    try {
      const where = userId ? { createdBy: userId } : {}

      const secrets = await prisma.secret.findMany({
        where,
        orderBy: { createdAt: 'desc' }
      })

      return secrets
    } catch (error) {
      console.error('Error listing secrets:', error)
      return []
    }
  }

  /**
   * Get secret metadata without decrypting value
   */
  async getSecretMetadata(name: string): Promise<Omit<Secret, 'valueEncrypted'> | null> {
    try {
      const secret = await prisma.secret.findUnique({
        where: { name },
        select: {
          id: true,
          name: true,
          maskedValue: true,
          provider: true,
          description: true,
          createdBy: true,
          lastUsedAt: true,
          createdAt: true,
          updatedAt: true
        }
      })

      return secret as any
    } catch (error) {
      console.error('Error getting secret metadata:', error)
      return null
    }
  }

  /**
   * Validate a secret exists
   */
  async validateSecret(name: string): Promise<boolean> {
    try {
      const count = await prisma.secret.count({
        where: { name }
      })
      return count > 0
    } catch (error) {
      console.error('Error validating secret:', error)
      return false
    }
  }

  /**
   * Mask a secret value for display
   */
  private maskValue(value: string): string {
    if (value.length <= 8) {
      return '****'
    }

    const firstChars = value.substring(0, 4)
    const lastChars = value.substring(value.length - 4)
    return `${firstChars}****...${lastChars}`
  }

  /**
   * Bulk import secrets
   */
  async bulkImportSecrets(
    secrets: Array<{
      name: string
      value: string
      provider?: string
      description?: string
    }>,
    userId: string
  ): Promise<{ success: number; failed: number }> {
    let success = 0
    let failed = 0

    for (const secret of secrets) {
      try {
        await this.setSecret(secret.name, secret.value, userId, {
          provider: secret.provider,
          description: secret.description
        })
        success++
      } catch (error) {
        failed++
      }
    }

    return { success, failed }
  }

  /**
   * Export secrets (metadata only, no values)
   */
  async exportSecretsMetadata(userId?: string): Promise<any[]> {
    const secrets = await this.listSecrets(userId)

    return secrets.map(secret => ({
      name: secret.name,
      provider: secret.provider,
      description: secret.description,
      createdAt: secret.createdAt,
      lastUsedAt: secret.lastUsedAt
    }))
  }
}

// Export singleton instance
export const secretsService = SecretsService.getInstance()

// Export convenience functions
export async function getSecret(name: string): Promise<string | null> {
  return secretsService.getSecret(name)
}

export async function setSecret(
  name: string,
  value: string,
  userId: string,
  options?: { provider?: string; description?: string }
): Promise<Secret> {
  return secretsService.setSecret(name, value, userId, options)
}

export async function deleteSecret(name: string): Promise<boolean> {
  return secretsService.deleteSecret(name)
}

export async function validateSecret(name: string): Promise<boolean> {
  return secretsService.validateSecret(name)
}