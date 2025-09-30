import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';
import { DataExportService, ExportConfiguration } from '@/services/data-export/export-service';
import { z } from 'zod';

const prisma = new PrismaClient();
const exportService = new DataExportService(prisma);

const ExportConfigSchema = z.object({
  type: z.enum(['snowflake', 'bigquery', 'manual']),
  destination: z.string(),
  credentials: z.record(z.any()),
  schedule: z.object({
    frequency: z.enum(['daily', 'weekly', 'monthly']),
    time: z.string(),
  }).optional(),
  filters: z.object({
    dateRange: z.object({
      start: z.string().transform(str => new Date(str)),
      end: z.string().transform(str => new Date(str)),
    }).optional(),
    departments: z.array(z.string()).optional(),
    dataTypes: z.array(z.string()).optional(),
  }).optional(),
});

export async function POST(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: { organization: true },
    });

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const config = ExportConfigSchema.parse(body) as ExportConfiguration;

    const job = await exportService.scheduleExport(
      user.organizationId,
      config,
      user.id
    );

    return NextResponse.json({ success: true, job });
  } catch (error) {
    console.error('Data export error:', error);
    return NextResponse.json(
      { error: 'Failed to create export job' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { userId } = auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { clerkUserId: userId },
      include: { organization: true },
    });

    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const jobs = await exportService.getExportJobs(user.organizationId);

    return NextResponse.json({ jobs });
  } catch (error) {
    console.error('Get export jobs error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch export jobs' },
      { status: 500 }
    );
  }
}