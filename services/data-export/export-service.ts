import { PrismaClient } from '@prisma/client';
import { trace } from '@opentelemetry/api';

const tracer = trace.getTracer('data-export-service');

export interface ExportConfiguration {
  type: 'snowflake' | 'bigquery' | 'manual';
  destination: string;
  credentials: Record<string, any>;
  schedule?: {
    frequency: 'daily' | 'weekly' | 'monthly';
    time: string;
  };
  filters?: {
    dateRange?: {
      start: Date;
      end: Date;
    };
    departments?: string[];
    dataTypes?: string[];
  };
}

export interface ExportJob {
  id: string;
  organizationId: string;
  type: string;
  destination: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  totalRecords?: number;
  processedRecords?: number;
  errorMessage?: string;
  configuration: ExportConfiguration;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

export interface ExportMetrics {
  jobId: string;
  exportedAt: Date;
  recordCount: number;
  fileSize: number;
  duration: number;
  dataTypes: string[];
}

export class DataExportService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async createExportJob(
    organizationId: string,
    configuration: ExportConfiguration,
    requestedBy: string
  ): Promise<ExportJob> {
    return tracer.startActiveSpan('createExportJob', async (span) => {
      try {
        span.setAttributes({
          organizationId,
          exportType: configuration.type,
          destination: configuration.destination,
        });

        const job = await this.prisma.dataExportJob.create({
          data: {
            organizationId,
            type: configuration.type,
            destination: configuration.destination,
            status: 'pending',
            progress: 0,
            configuration: configuration as any,
            metadata: {
              requestedBy,
              createdAt: new Date().toISOString(),
            },
          },
        });

        span.addEvent('Export job created', { jobId: job.id });
        return job as ExportJob;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async executeSnowflakeExport(
    jobId: string,
    configuration: ExportConfiguration
  ): Promise<void> {
    return tracer.startActiveSpan('executeSnowflakeExport', async (span) => {
      try {
        span.setAttributes({ jobId, destination: configuration.destination });

        await this.updateJobStatus(jobId, 'running', 0);

        const data = await this.extractData(
          configuration.filters?.dateRange,
          configuration.filters?.departments,
          configuration.filters?.dataTypes
        );

        await this.updateJobStatus(jobId, 'running', 25);

        const transformedData = await this.transformDataForSnowflake(data);
        await this.updateJobStatus(jobId, 'running', 50);

        await this.uploadToSnowflake(transformedData, configuration);
        await this.updateJobStatus(jobId, 'running', 75);

        await this.recordExportMetrics(jobId, {
          exportedAt: new Date(),
          recordCount: transformedData.length,
          fileSize: JSON.stringify(transformedData).length,
          duration: Date.now() - new Date().getTime(),
          dataTypes: configuration.filters?.dataTypes || ['all'],
        });

        await this.updateJobStatus(jobId, 'completed', 100);
        span.addEvent('Snowflake export completed');
      } catch (error) {
        await this.updateJobStatus(jobId, 'failed', 0, (error as Error).message);
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async executeBigQueryExport(
    jobId: string,
    configuration: ExportConfiguration
  ): Promise<void> {
    return tracer.startActiveSpan('executeBigQueryExport', async (span) => {
      try {
        span.setAttributes({ jobId, destination: configuration.destination });

        await this.updateJobStatus(jobId, 'running', 0);

        const data = await this.extractData(
          configuration.filters?.dateRange,
          configuration.filters?.departments,
          configuration.filters?.dataTypes
        );

        await this.updateJobStatus(jobId, 'running', 25);

        const transformedData = await this.transformDataForBigQuery(data);
        await this.updateJobStatus(jobId, 'running', 50);

        await this.uploadToBigQuery(transformedData, configuration);
        await this.updateJobStatus(jobId, 'running', 75);

        await this.recordExportMetrics(jobId, {
          exportedAt: new Date(),
          recordCount: transformedData.length,
          fileSize: JSON.stringify(transformedData).length,
          duration: Date.now() - new Date().getTime(),
          dataTypes: configuration.filters?.dataTypes || ['all'],
        });

        await this.updateJobStatus(jobId, 'completed', 100);
        span.addEvent('BigQuery export completed');
      } catch (error) {
        await this.updateJobStatus(jobId, 'failed', 0, (error as Error).message);
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async extractData(
    dateRange?: { start: Date; end: Date },
    departments?: string[],
    dataTypes?: string[]
  ): Promise<any[]> {
    const queries = [];

    if (!dataTypes || dataTypes.includes('users')) {
      let userQuery = this.prisma.user.findMany({
        where: {
          ...(dateRange && {
            createdAt: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          }),
          ...(departments && {
            department: { in: departments },
          }),
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          department: true,
          role: true,
          createdAt: true,
          lastLogin: true,
          isActive: true,
        },
      });
      queries.push(userQuery);
    }

    if (!dataTypes || dataTypes.includes('sessions')) {
      let sessionQuery = this.prisma.session.findMany({
        where: {
          ...(dateRange && {
            createdAt: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          }),
        },
        select: {
          id: true,
          userId: true,
          duration: true,
          actionsCount: true,
          createdAt: true,
          endedAt: true,
        },
      });
      queries.push(sessionQuery);
    }

    if (!dataTypes || dataTypes.includes('audit')) {
      let auditQuery = this.prisma.auditLog.findMany({
        where: {
          ...(dateRange && {
            timestamp: {
              gte: dateRange.start,
              lte: dateRange.end,
            },
          }),
        },
        select: {
          id: true,
          userId: true,
          action: true,
          resource: true,
          details: true,
          timestamp: true,
          ipAddress: true,
          userAgent: true,
        },
      });
      queries.push(auditQuery);
    }

    const results = await Promise.all(queries);
    return results.flat();
  }

  private async transformDataForSnowflake(data: any[]): Promise<any[]> {
    return data.map(record => ({
      ...record,
      exported_at: new Date().toISOString(),
      data_source: 'magi_app',
    }));
  }

  private async transformDataForBigQuery(data: any[]): Promise<any[]> {
    return data.map(record => ({
      ...record,
      exported_at: new Date().toISOString(),
      data_source: 'magi_app',
      _table_suffix: this.getTableSuffix(record),
    }));
  }

  private getTableSuffix(record: any): string {
    if (record.email) return 'users';
    if (record.duration !== undefined) return 'sessions';
    if (record.action) return 'audit_logs';
    return 'unknown';
  }

  private async uploadToSnowflake(
    data: any[],
    configuration: ExportConfiguration
  ): Promise<void> {
    const snowflake = require('snowflake-sdk');

    const connection = snowflake.createConnection({
      account: configuration.credentials.account,
      username: configuration.credentials.username,
      password: configuration.credentials.password,
      warehouse: configuration.credentials.warehouse,
      database: configuration.credentials.database,
      schema: configuration.credentials.schema,
    });

    return new Promise((resolve, reject) => {
      connection.connect((err: any, conn: any) => {
        if (err) {
          reject(err);
          return;
        }

        const tableName = configuration.destination;
        const columns = Object.keys(data[0] || {}).join(', ');
        const values = data.map(record =>
          Object.values(record).map(val =>
            typeof val === 'string' ? `'${val.replace(/'/g, "''")}'` : val
          ).join(', ')
        ).join('), (');

        const query = `INSERT INTO ${tableName} (${columns}) VALUES (${values})`;

        conn.execute({
          sqlText: query,
          complete: (err: any, stmt: any, rows: any) => {
            if (err) {
              reject(err);
            } else {
              resolve();
            }
          },
        });
      });
    });
  }

  private async uploadToBigQuery(
    data: any[],
    configuration: ExportConfiguration
  ): Promise<void> {
    const { BigQuery } = require('@google-cloud/bigquery');

    const bigquery = new BigQuery({
      projectId: configuration.credentials.projectId,
      keyFilename: configuration.credentials.keyFile,
    });

    const dataset = bigquery.dataset(configuration.credentials.dataset);
    const table = dataset.table(configuration.destination);

    await table.insert(data);
  }

  private async updateJobStatus(
    jobId: string,
    status: 'pending' | 'running' | 'completed' | 'failed',
    progress: number,
    errorMessage?: string
  ): Promise<void> {
    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: {
        status,
        progress,
        ...(errorMessage && { errorMessage }),
        ...(status === 'completed' && { completedAt: new Date() }),
        updatedAt: new Date(),
      },
    });
  }

  private async recordExportMetrics(
    jobId: string,
    metrics: Omit<ExportMetrics, 'jobId'>
  ): Promise<void> {
    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: {
        totalRecords: metrics.recordCount,
        processedRecords: metrics.recordCount,
        metadata: {
          metrics: {
            ...metrics,
            jobId,
          },
        },
      },
    });
  }

  async getExportJobs(organizationId: string): Promise<ExportJob[]> {
    const jobs = await this.prisma.dataExportJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
    });

    return jobs as ExportJob[];
  }

  async getExportJob(jobId: string): Promise<ExportJob | null> {
    const job = await this.prisma.dataExportJob.findUnique({
      where: { id: jobId },
    });

    return job as ExportJob | null;
  }

  async cancelExportJob(jobId: string): Promise<void> {
    await this.prisma.dataExportJob.update({
      where: { id: jobId },
      data: {
        status: 'failed',
        errorMessage: 'Job cancelled by user',
        updatedAt: new Date(),
      },
    });
  }

  async scheduleExport(
    organizationId: string,
    configuration: ExportConfiguration,
    requestedBy: string
  ): Promise<ExportJob> {
    const job = await this.createExportJob(organizationId, configuration, requestedBy);

    if (configuration.type === 'snowflake') {
      this.executeSnowflakeExport(job.id, configuration).catch(console.error);
    } else if (configuration.type === 'bigquery') {
      this.executeBigQueryExport(job.id, configuration).catch(console.error);
    }

    return job;
  }
}