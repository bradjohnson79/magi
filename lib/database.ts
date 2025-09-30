/**
 * Database Module
 *
 * Re-exports the database client and utilities from lib/db
 * This provides a consistent import path for @/lib/database
 */

export { prisma, getNeonClient, withTransaction, healthCheck } from './db'
export type { PrismaClient } from '@prisma/client'

// Re-export as Database for backward compatibility
export { prisma as Database } from './db'

// Default export for convenience
export { prisma as default } from './db'