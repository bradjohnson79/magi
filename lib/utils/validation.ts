import { z } from 'zod';

/**
 * Common validation schemas
 */

// Email validation
export const emailSchema = z.string().email('Invalid email address');

// Password validation
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

// UUID validation
export const uuidSchema = z.string().uuid('Invalid UUID format');

// URL validation
export const urlSchema = z.string().url('Invalid URL format');

// Project ID validation (alphanumeric with hyphens and underscores)
export const projectIdSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_-]+$/, 'Project ID can only contain letters, numbers, hyphens, and underscores')
  .min(1, 'Project ID is required')
  .max(50, 'Project ID must be 50 characters or less');

// Branch name validation
export const branchNameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_/-]+$/, 'Branch name can only contain letters, numbers, hyphens, underscores, and slashes')
  .min(1, 'Branch name is required')
  .max(100, 'Branch name must be 100 characters or less');

// API key validation
export const apiKeySchema = z
  .string()
  .min(10, 'API key must be at least 10 characters')
  .max(500, 'API key is too long');

// Pagination validation
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
});

// Search query validation
export const searchSchema = z.object({
  q: z.string().optional(),
  sort: z.enum(['created_at', 'updated_at', 'name']).optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Validation helper functions
 */

export function validateEmail(email: string): boolean {
  return emailSchema.safeParse(email).success;
}

export function validatePassword(password: string): boolean {
  return passwordSchema.safeParse(password).success;
}

export function validateUUID(uuid: string): boolean {
  return uuidSchema.safeParse(uuid).success;
}

export function validateURL(url: string): boolean {
  return urlSchema.safeParse(url).success;
}

export function validateProjectId(projectId: string): boolean {
  return projectIdSchema.safeParse(projectId).success;
}

export function validateBranchName(branchName: string): boolean {
  return branchNameSchema.safeParse(branchName).success;
}

/**
 * Sanitize string input
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

/**
 * Alias for sanitizeString for backwards compatibility
 */
export const sanitizeInput = sanitizeString;

/**
 * Validate JSON string
 */
export function validateJSON(jsonString: string): boolean {
  try {
    JSON.parse(jsonString);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate environment name
 */
export const environmentSchema = z.enum(['development', 'staging', 'production']);

export function validateEnvironment(env: string): boolean {
  return environmentSchema.safeParse(env).success;
}