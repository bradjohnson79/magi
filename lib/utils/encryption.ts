/**
 * Encryption Utilities
 *
 * Provides secure encryption and decryption functions for sensitive data
 * Uses Node.js crypto module with AES-256-GCM encryption
 */

import crypto from 'crypto'

// Get encryption key from environment or generate a default one
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY ||
  crypto.createHash('sha256').update('magi-default-key-change-in-production').digest()

// Algorithm and IV length
const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 16
const TAG_LENGTH = 16
const SALT_LENGTH = 64

/**
 * Encrypt a string value
 * Returns a base64 encoded string containing IV, auth tag, and encrypted data
 */
export function encrypt(text: string): string {
  try {
    // Generate a random IV
    const iv = crypto.randomBytes(IV_LENGTH)

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv)

    // Encrypt the text
    const encrypted = Buffer.concat([
      cipher.update(text, 'utf8'),
      cipher.final()
    ])

    // Get the auth tag
    const authTag = cipher.getAuthTag()

    // Combine IV, auth tag, and encrypted data
    const combined = Buffer.concat([iv, authTag, encrypted])

    // Return base64 encoded string
    return combined.toString('base64')
  } catch (error) {
    console.error('Encryption error:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt a string value
 * Expects a base64 encoded string containing IV, auth tag, and encrypted data
 */
export function decrypt(encryptedData: string): string {
  try {
    // Decode from base64
    const combined = Buffer.from(encryptedData, 'base64')

    // Extract components
    const iv = combined.slice(0, IV_LENGTH)
    const authTag = combined.slice(IV_LENGTH, IV_LENGTH + TAG_LENGTH)
    const encrypted = combined.slice(IV_LENGTH + TAG_LENGTH)

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv)
    decipher.setAuthTag(authTag)

    // Decrypt the data
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ])

    return decrypted.toString('utf8')
  } catch (error) {
    console.error('Decryption error:', error)
    throw new Error('Failed to decrypt data')
  }
}

/**
 * Hash a value using SHA-256
 */
export function hash(value: string): string {
  return crypto
    .createHash('sha256')
    .update(value)
    .digest('hex')
}

/**
 * Create a secure hash with salt (for passwords)
 */
export function hashWithSalt(value: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || crypto.randomBytes(SALT_LENGTH).toString('hex')

  const hash = crypto
    .pbkdf2Sync(value, actualSalt, 10000, 64, 'sha512')
    .toString('hex')

  return { hash, salt: actualSalt }
}

/**
 * Verify a value against a salted hash
 */
export function verifyHash(value: string, hash: string, salt: string): boolean {
  const verifyHash = crypto
    .pbkdf2Sync(value, salt, 10000, 64, 'sha512')
    .toString('hex')

  return hash === verifyHash
}

/**
 * Generate a secure random token
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex')
}

/**
 * Generate a secure API key
 */
export function generateApiKey(prefix: string = 'sk'): string {
  const token = crypto.randomBytes(32).toString('hex')
  return `${prefix}_${token}`
}

/**
 * Mask sensitive data for logging
 */
export function maskSensitiveData(value: string, showChars: number = 4): string {
  if (!value || value.length <= showChars * 2) {
    return '****'
  }

  const start = value.substring(0, showChars)
  const end = value.substring(value.length - showChars)

  return `${start}****${end}`
}

/**
 * Encrypt an object as JSON
 */
export function encryptObject(obj: any): string {
  const json = JSON.stringify(obj)
  return encrypt(json)
}

/**
 * Decrypt JSON to an object
 */
export function decryptObject<T = any>(encryptedData: string): T {
  const json = decrypt(encryptedData)
  return JSON.parse(json) as T
}

/**
 * Check if a value appears to be encrypted (base64 with proper length)
 */
export function isEncrypted(value: string): boolean {
  try {
    const decoded = Buffer.from(value, 'base64')
    // Check if length is at least IV + TAG + 1 byte of data
    return decoded.length >= IV_LENGTH + TAG_LENGTH + 1
  } catch {
    return false
  }
}

/**
 * Securely compare two strings (constant time comparison)
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }

  const bufferA = Buffer.from(a)
  const bufferB = Buffer.from(b)

  return crypto.timingSafeEqual(bufferA, bufferB)
}

/**
 * Generate a secure OTP code
 */
export function generateOTP(length: number = 6): string {
  const digits = '0123456789'
  let otp = ''

  for (let i = 0; i < length; i++) {
    const randomIndex = crypto.randomBytes(1)[0] % digits.length
    otp += digits[randomIndex]
  }

  return otp
}

/**
 * Encrypt field-level data for database storage
 */
export function encryptField(fieldName: string, value: any): string {
  const data = {
    field: fieldName,
    value: value,
    timestamp: Date.now()
  }
  return encryptObject(data)
}

/**
 * Decrypt field-level data from database
 */
export function decryptField<T = any>(encryptedData: string): { field: string; value: T; timestamp: number } {
  return decryptObject(encryptedData)
}