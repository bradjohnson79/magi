import { PrismaClient } from '@prisma/client';

// Global variable to store the Prisma instance to prevent multiple instances in development
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Create a new Prisma client or reuse the existing one
export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: ['error'], // Simplified logging to avoid env issues
});

// In development, save the client to prevent multiple instances
if (typeof window === 'undefined') {
  globalForPrisma.prisma = prisma;
}

// Utility function to safely disconnect Prisma
export async function disconnectPrisma() {
  await prisma.$disconnect();
}

// Utility function to check database connection
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

export default prisma;