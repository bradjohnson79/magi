import { prisma, healthCheck, withTransaction } from '@/lib/db';

// Mock Prisma client
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    $queryRaw: jest.fn(),
    $transaction: jest.fn((fn) => fn(mockPrismaClient)),
    $disconnect: jest.fn(),
  };
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

describe('Database Utilities', () => {
  describe('healthCheck', () => {
    it('should return true when database is healthy', async () => {
      // Mock successful query
      (prisma.$queryRaw as jest.Mock).mockResolvedValueOnce([{ '?column?': 1 }]);

      const result = await healthCheck();
      expect(result).toBe(true);
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('SELECT 1')])
      );
    });

    it('should return false when database is unhealthy', async () => {
      // Mock failed query
      (prisma.$queryRaw as jest.Mock).mockRejectedValueOnce(new Error('Connection failed'));

      const result = await healthCheck();
      expect(result).toBe(false);
    });
  });

  describe('withTransaction', () => {
    it('should execute function within transaction', async () => {
      const mockFn = jest.fn().mockResolvedValue('result');

      const result = await withTransaction(mockFn);

      expect(result).toBe('result');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(mockFn).toHaveBeenCalled();
    });

    it('should pass transaction client to function', async () => {
      const mockFn = jest.fn((tx) => {
        expect(tx).toBeDefined();
        return Promise.resolve('success');
      });

      await withTransaction(mockFn);
      expect(mockFn).toHaveBeenCalledWith(expect.any(Object));
    });
  });
});