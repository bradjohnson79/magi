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
    const status = searchParams.getAll('status');
    const severity = searchParams.getAll('severity');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const filters: any = {};

    if (status.length > 0) {
      filters.status = status;
    }

    if (severity.length > 0) {
      filters.severity = severity;
    }

    if (startDate && endDate) {
      filters.dateRange = {
        start: new Date(startDate),
        end: new Date(endDate),
      };
    }

    const violations = await complianceService.getComplianceViolations(
      user.organizationId,
      filters
    );

    return NextResponse.json({ violations });
  } catch (error) {
    console.error('Get compliance violations error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance violations' },
      { status: 500 }
    );
  }
}