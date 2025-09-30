import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { DataExportService, ExportConfiguration } from '@/services/data-export/export-service';
import { mockDeep, mockReset, DeepMockProxy } from 'vitest-mock-extended';

vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrisma),
}));

const mockPrisma = mockDeep<PrismaClient>() as DeepMockProxy<PrismaClient>;

describe('Data Export Service', () => {
  let exportService: DataExportService;

  beforeEach(() => {
    exportService = new DataExportService(mockPrisma);
  });

  afterEach(() => {
    mockReset(mockPrisma);
  });

  describe('Export Job Creation', () => {
    it('should create export job successfully', async () => {
      const organizationId = 'org-id';
      const configuration: ExportConfiguration = {
        type: 'snowflake',
        destination: 'analytics.user_data',
        credentials: {
          account: 'test-account',
          username: 'test-user',
          password: 'test-password',
          warehouse: 'test-warehouse',
          database: 'test-db',
          schema: 'test-schema',
        },
        filters: {
          dateRange: {
            start: new Date('2024-01-01'),
            end: new Date('2024-01-31'),
          },
          departments: ['Engineering', 'Marketing'],
          dataTypes: ['users', 'sessions'],
        },
      };

      const mockJob = {
        id: 'job-123',
        organizationId,
        type: 'snowflake',
        destination: 'analytics.user_data',
        status: 'pending',
        progress: 0,
        configuration,
        metadata: {
          requestedBy: 'admin-123',
          createdAt: new Date().toISOString(),
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.dataExportJob.create.mockResolvedValue(mockJob);

      const result = await exportService.createExportJob(
        organizationId,
        configuration,
        'admin-123'
      );

      expect(result).toEqual(mockJob);
      expect(mockPrisma.dataExportJob.create).toHaveBeenCalledWith({
        data: {
          organizationId,
          type: 'snowflake',
          destination: 'analytics.user_data',
          status: 'pending',
          progress: 0,
          configuration,
          metadata: {
            requestedBy: 'admin-123',
            createdAt: expect.any(String),
          },
        },
      });
    });
  });

  describe('Snowflake Export', () => {
    it('should execute Snowflake export successfully', async () => {
      const jobId = 'job-123';
      const configuration: ExportConfiguration = {
        type: 'snowflake',
        destination: 'test_table',
        credentials: {
          account: 'test-account',
          username: 'test-user',
          password: 'test-password',
          warehouse: 'test-warehouse',
          database: 'test-db',
          schema: 'test-schema',
        },
      };

      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          firstName: 'John',
          lastName: 'Doe',
          department: 'Engineering',
          role: 'user',
          createdAt: new Date(),
          lastLogin: new Date(),
          isActive: true,
        },
      ];

      const mockSessions = [
        {
          id: 'session-1',
          userId: 'user-1',
          duration: 3600,
          actionsCount: 25,
          createdAt: new Date(),
          endedAt: new Date(),
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.session.findMany.mockResolvedValue(mockSessions);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      mockPrisma.dataExportJob.update.mockResolvedValue({
        id: jobId,
        status: 'completed',
        progress: 100,
      });

      vi.mock('snowflake-sdk', () => ({
        createConnection: vi.fn(() => ({
          connect: vi.fn((callback) => {
            callback(null, {
              execute: vi.fn(({ complete }) => {
                complete(null, null, []);
              }),
            });
          }),
        })),
      }));

      await expect(
        exportService.executeSnowflakeExport(jobId, configuration)
      ).resolves.not.toThrow();

      expect(mockPrisma.dataExportJob.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          completedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should handle Snowflake export errors', async () => {
      const jobId = 'job-123';
      const configuration: ExportConfiguration = {
        type: 'snowflake',
        destination: 'test_table',
        credentials: {
          account: 'test-account',
          username: 'test-user',
          password: 'test-password',
          warehouse: 'test-warehouse',
          database: 'test-db',
          schema: 'test-schema',
        },
      };

      mockPrisma.user.findMany.mockRejectedValue(new Error('Database connection failed'));
      mockPrisma.dataExportJob.update.mockResolvedValue({
        id: jobId,
        status: 'failed',
        progress: 0,
        errorMessage: 'Database connection failed',
      });

      await expect(
        exportService.executeSnowflakeExport(jobId, configuration)
      ).rejects.toThrow('Database connection failed');

      expect(mockPrisma.dataExportJob.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: 'failed',
          progress: 0,
          errorMessage: 'Database connection failed',
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('BigQuery Export', () => {
    it('should execute BigQuery export successfully', async () => {
      const jobId = 'job-123';
      const configuration: ExportConfiguration = {
        type: 'bigquery',
        destination: 'user_analytics',
        credentials: {
          projectId: 'test-project',
          dataset: 'analytics',
          keyFile: '/path/to/key.json',
        },
      };

      const mockData = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          department: 'Engineering',
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockData);
      mockPrisma.session.findMany.mockResolvedValue([]);
      mockPrisma.auditLog.findMany.mockResolvedValue([]);

      mockPrisma.dataExportJob.update.mockResolvedValue({
        id: jobId,
        status: 'completed',
        progress: 100,
      });

      vi.mock('@google-cloud/bigquery', () => ({
        BigQuery: vi.fn(() => ({
          dataset: vi.fn(() => ({
            table: vi.fn(() => ({
              insert: vi.fn().mockResolvedValue(undefined),
            })),
          })),
        })),
      }));

      await expect(
        exportService.executeBigQueryExport(jobId, configuration)
      ).resolves.not.toThrow();

      expect(mockPrisma.dataExportJob.update).toHaveBeenLastCalledWith({
        where: { id: jobId },
        data: {
          status: 'completed',
          progress: 100,
          completedAt: expect.any(Date),
          updatedAt: expect.any(Date),
        },
      });
    });
  });

  describe('Export Job Management', () => {
    it('should get export jobs for organization', async () => {
      const organizationId = 'org-id';
      const mockJobs = [
        {
          id: 'job-1',
          organizationId,
          type: 'snowflake',
          status: 'completed',
          progress: 100,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'job-2',
          organizationId,
          type: 'bigquery',
          status: 'running',
          progress: 50,
          createdAt: new Date('2024-01-02'),
        },
      ];

      mockPrisma.dataExportJob.findMany.mockResolvedValue(mockJobs);

      const result = await exportService.getExportJobs(organizationId);

      expect(result).toEqual(mockJobs);
      expect(mockPrisma.dataExportJob.findMany).toHaveBeenCalledWith({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should get single export job', async () => {
      const jobId = 'job-123';
      const mockJob = {
        id: jobId,
        organizationId: 'org-id',
        type: 'snowflake',
        status: 'completed',
        progress: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.dataExportJob.findUnique.mockResolvedValue(mockJob);

      const result = await exportService.getExportJob(jobId);

      expect(result).toEqual(mockJob);
      expect(mockPrisma.dataExportJob.findUnique).toHaveBeenCalledWith({
        where: { id: jobId },
      });
    });

    it('should cancel export job', async () => {
      const jobId = 'job-123';

      mockPrisma.dataExportJob.update.mockResolvedValue({
        id: jobId,
        status: 'failed',
        errorMessage: 'Job cancelled by user',
      });

      await exportService.cancelExportJob(jobId);

      expect(mockPrisma.dataExportJob.update).toHaveBeenCalledWith({
        where: { id: jobId },
        data: {
          status: 'failed',
          errorMessage: 'Job cancelled by user',
          updatedAt: expect.any(Date),
        },
      });
    });

    it('should schedule export job', async () => {
      const organizationId = 'org-id';
      const configuration: ExportConfiguration = {
        type: 'snowflake',
        destination: 'test_table',
        credentials: {},
      };

      const mockJob = {
        id: 'job-123',
        organizationId,
        type: 'snowflake',
        destination: 'test_table',
        status: 'pending',
        progress: 0,
        configuration,
        metadata: {
          requestedBy: 'admin-123',
        },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrisma.dataExportJob.create.mockResolvedValue(mockJob);

      const result = await exportService.scheduleExport(
        organizationId,
        configuration,
        'admin-123'
      );

      expect(result).toEqual(mockJob);
    });
  });

  describe('Data Extraction', () => {
    it('should extract data with filters', async () => {
      const dateRange = {
        start: new Date('2024-01-01'),
        end: new Date('2024-01-31'),
      };
      const departments = ['Engineering'];
      const dataTypes = ['users', 'sessions'];

      const mockUsers = [
        {
          id: 'user-1',
          email: 'user1@example.com',
          department: 'Engineering',
          createdAt: new Date('2024-01-15'),
        },
      ];

      const mockSessions = [
        {
          id: 'session-1',
          userId: 'user-1',
          duration: 3600,
          createdAt: new Date('2024-01-20'),
        },
      ];

      mockPrisma.user.findMany.mockResolvedValue(mockUsers);
      mockPrisma.session.findMany.mockResolvedValue(mockSessions);

      const extractDataMethod = (exportService as any).extractData.bind(exportService);
      const result = await extractDataMethod(dateRange, departments, dataTypes);

      expect(result).toHaveLength(2);
      expect(result).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'user-1', email: 'user1@example.com' }),
        expect.objectContaining({ id: 'session-1', userId: 'user-1' }),
      ]));

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
          department: { in: departments },
        },
        select: expect.any(Object),
      });

      expect(mockPrisma.session.findMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: dateRange.start,
            lte: dateRange.end,
          },
        },
        select: expect.any(Object),
      });
    });
  });
});