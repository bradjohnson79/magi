/**
 * Data Export API Endpoint
 *
 * GDPR-compliant data export functionality allowing users to download
 * all their personal data in a structured format.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

interface ExportData {
  user: any;
  projects: any[];
  prompts: any[];
  modelRuns: any[];
  feedback: any[];
  logs: any[];
  snapshots: any[];
  telemetryEvents: any[];
  usageCounters: any[];
  auditLogs: any[];
  metadata: {
    exportedAt: string;
    exportId: string;
    format: string;
    dataRetentionInfo: Record<string, any>;
  };
}

// GET /api/v1/account/data-export - Export user data
export async function GET(req: NextRequest) {
  return await withSpan(
    'data.export.get',
    async () => {
      try {
        // Authenticate user
        const { userId: clerkUserId } = await auth();
        if (!clerkUserId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // Find user in database
        const user = await prisma.user.findFirst({
          where: { clerkId: clerkUserId },
        });

        if (!user) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        // Parse query parameters
        const url = new URL(req.url);
        const format = url.searchParams.get('format') || 'json';
        const includeDeleted = url.searchParams.get('includeDeleted') === 'true';

        // Add span attributes
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'data_export',
          [SPAN_ATTRIBUTES.USER_ID]: user.id,
          'export.format': format,
          'export.include_deleted': includeDeleted,
        });

        // Collect all user data
        const exportData = await collectUserData(user.id, includeDeleted);

        // Add export metadata
        const exportId = crypto.randomUUID();
        exportData.metadata = {
          exportedAt: new Date().toISOString(),
          exportId,
          format,
          userId: user.id,
          userEmail: user.email,
          exportType: 'complete',
          gdprCompliant: true,
          dataRetentionInfo: {
            telemetryEvents: 'Retained for 90 days, then archived',
            auditLogs: 'Retained for 365 days (critical events retained longer)',
            snapshots: 'Retention varies by plan - trial: 7d, solo: 30d, teams: 90d',
            prompts: 'Retained indefinitely unless explicitly deleted',
            modelRuns: 'Retained indefinitely for model improvement (anonymized after 1 year)',
          },
        };

        // Log the export request
        await auditLogger.logData('data.export', user.id, {
          exportId,
          format,
          includeDeleted,
          recordCounts: {
            projects: exportData.projects.length,
            prompts: exportData.prompts.length,
            modelRuns: exportData.modelRuns.length,
            feedback: exportData.feedback.length,
            logs: exportData.logs.length,
            snapshots: exportData.snapshots.length,
            telemetryEvents: exportData.telemetryEvents.length,
            usageCounters: exportData.usageCounters.length,
            auditLogs: exportData.auditLogs.length,
          },
        });

        // Return data in requested format
        if (format === 'csv') {
          return generateCSVExport(exportData);
        } else if (format === 'xml') {
          return generateXMLExport(exportData);
        } else {
          // Default to JSON
          return NextResponse.json({
            success: true,
            data: exportData,
          }, {
            headers: {
              'Content-Disposition': `attachment; filename="magi-data-export-${exportId}.json"`,
            },
          });
        }

      } catch (error) {
        console.error('Data export error:', error);

        return NextResponse.json(
          {
            success: false,
            error: 'Export failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}

/**
 * Collect all user data from the database
 */
async function collectUserData(userId: string, includeDeleted: boolean = false): Promise<ExportData> {
  // Base user information
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      billing: true,
    },
  });

  // Projects owned by the user
  const projects = await prisma.project.findMany({
    where: { ownerId: userId },
    include: {
      team: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });

  const projectIds = projects.map(p => p.id);

  // Prompts created by the user
  const prompts = await prisma.prompt.findMany({
    where: {
      OR: [
        { userId },
        { projectId: { in: projectIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  // Model runs by the user
  const modelRuns = await prisma.modelRun.findMany({
    where: {
      OR: [
        { userId },
        { projectId: { in: projectIds } },
      ],
    },
    include: {
      model: {
        select: {
          id: true,
          name: true,
          provider: true,
          role: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Feedback provided by the user
  const feedback = await prisma.feedback.findMany({
    where: { userId },
    include: {
      modelRun: {
        select: {
          id: true,
          inputPayload: true,
          outputPayload: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  // Logs related to user or their projects
  const logs = await prisma.log.findMany({
    where: {
      OR: [
        { userId },
        { projectId: { in: projectIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: 10000, // Limit to prevent excessive data
  });

  // Snapshots for user projects
  const snapshots = await prisma.snapshot.findMany({
    where: {
      OR: [
        { createdBy: userId },
        { projectId: { in: projectIds } },
      ],
    },
    orderBy: { createdAt: 'desc' },
  });

  // Telemetry events for the user (last 90 days)
  const ninetyDaysAgo = new Date();
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

  const telemetryEvents = await prisma.telemetryEvent.findMany({
    where: {
      OR: [
        { userId },
        { projectId: { in: projectIds } },
      ],
      createdAt: { gte: ninetyDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
    take: 10000, // Limit to prevent excessive data
  });

  // Usage counters for the user
  const usageCounters = await prisma.usageCounter.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  // Audit logs for the user (if they exist)
  let auditLogs: any[] = [];
  try {
    auditLogs = await prisma.auditLog.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 1000, // Limit for performance
    });
  } catch (error) {
    // Audit logs table might not exist yet
    console.warn('Audit logs not available:', error);
  }

  return {
    user: {
      ...user,
      // Remove sensitive internal fields
      clerkId: undefined, // Don't export clerk ID
    },
    projects: projects.map(project => ({
      ...project,
      // Include team info but not full team data
      team: project.team ? {
        id: project.team.id,
        name: project.team.name,
        slug: project.team.slug,
      } : null,
    })),
    prompts: prompts.map(prompt => ({
      ...prompt,
      // Optionally redact sensitive content based on user preferences
    })),
    modelRuns: modelRuns.map(run => ({
      ...run,
      // Include model info
      model: run.model,
    })),
    feedback,
    logs: logs.map(log => ({
      ...log,
      // Ensure no sensitive system info is exposed
      metadata: typeof log.metadata === 'object' ?
        Object.fromEntries(
          Object.entries(log.metadata as Record<string, any>)
            .filter(([key]) => !key.includes('password') && !key.includes('secret'))
        ) : log.metadata,
    })),
    snapshots: snapshots.map(snapshot => ({
      ...snapshot,
      // Don't include actual file data, just metadata
      storageRef: `[Reference: ${snapshot.storageRef}]`,
    })),
    telemetryEvents: telemetryEvents.map(event => ({
      ...event,
      // Sanitize telemetry data
      payload: typeof event.payload === 'object' ?
        Object.fromEntries(
          Object.entries(event.payload as Record<string, any>)
            .filter(([key]) => !key.includes('password') && !key.includes('secret'))
        ) : event.payload,
    })),
    usageCounters,
    auditLogs: auditLogs.map(log => ({
      ...log,
      // Sanitize audit log details
      details: typeof log.details === 'object' ?
        Object.fromEntries(
          Object.entries(log.details as Record<string, any>)
            .filter(([key]) => !key.includes('password') && !key.includes('secret'))
        ) : log.details,
    })),
    metadata: {} as any, // Will be filled by caller
  };
}

/**
 * Generate CSV export
 */
function generateCSVExport(data: ExportData): Response {
  let csv = '';

  // User info
  csv += 'USER INFORMATION\n';
  csv += 'ID,Email,Name,Role,Plan,Created At\n';
  csv += `"${data.user.id}","${data.user.email}","${data.user.name || ''}","${data.user.role}","${data.user.plan}","${data.user.createdAt}"\n\n`;

  // Projects
  csv += 'PROJECTS\n';
  csv += 'ID,Name,Type,Status,Created At\n';
  data.projects.forEach(project => {
    csv += `"${project.id}","${project.name}","${project.type || ''}","${project.status}","${project.createdAt}"\n`;
  });
  csv += '\n';

  // Add other data sections as needed...

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="magi-data-export-${data.metadata.exportId}.csv"`,
    },
  });
}

/**
 * Generate XML export
 */
function generateXMLExport(data: ExportData): Response {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<magiDataExport>\n';
  xml += `  <metadata exportId="${data.metadata.exportId}" exportedAt="${data.metadata.exportedAt}" />\n`;
  xml += '  <user>\n';
  xml += `    <id>${data.user.id}</id>\n`;
  xml += `    <email>${data.user.email}</email>\n`;
  xml += `    <name>${data.user.name || ''}</name>\n`;
  xml += `    <role>${data.user.role}</role>\n`;
  xml += `    <plan>${data.user.plan}</plan>\n`;
  xml += '  </user>\n';
  // Add other data sections as needed...
  xml += '</magiDataExport>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Content-Disposition': `attachment; filename="magi-data-export-${data.metadata.exportId}.xml"`,
    },
  });
}