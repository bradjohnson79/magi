import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';
import { ComplianceService } from '@/services/compliance/compliance-service';

const prisma = new PrismaClient();
const complianceService = new ComplianceService(prisma);

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

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');
    const action = searchParams.getAll('action');
    const resource = searchParams.getAll('resource');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const complianceRelevant = searchParams.get('complianceRelevant');
    const sensitive = searchParams.get('sensitive');

    const filters: any = {};

    if (targetUserId) {
      filters.userId = targetUserId;
    }

    if (action.length > 0) {
      filters.action = action;
    }

    if (resource.length > 0) {
      filters.resource = resource;
    }

    if (startDate && endDate) {
      filters.dateRange = {
        start: new Date(startDate),
        end: new Date(endDate),
      };
    }

    if (complianceRelevant !== null) {
      filters.complianceRelevant = complianceRelevant === 'true';
    }

    if (sensitive !== null) {
      filters.sensitive = sensitive === 'true';
    }

    const events = await complianceService.getAuditEvents(
      user.organizationId,
      filters
    );

    return NextResponse.json({ events });
  } catch (error) {
    console.error('Get audit events error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch audit events' },
      { status: 500 }
    );
  }
}

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

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const body = await request.json();
    const {
      action,
      resource,
      details,
      sessionId,
      resourceId,
      outcome,
      sensitive,
      complianceRelevant,
      ipAddress,
      userAgent,
      location,
      riskScore,
      tags,
    } = body;

    const auditEvent = await complianceService.logAuditEvent(
      user.organizationId,
      user.id,
      action,
      resource,
      details,
      {
        sessionId,
        resourceId,
        outcome,
        sensitive,
        complianceRelevant,
        ipAddress,
        userAgent,
        location,
        riskScore,
        tags,
      }
    );

    return NextResponse.json({ success: true, event: auditEvent });
  } catch (error) {
    console.error('Log audit event error:', error);
    return NextResponse.json(
      { error: 'Failed to log audit event' },
      { status: 500 }
    );
  }
}