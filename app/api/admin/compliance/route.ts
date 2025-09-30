import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';
import { ComplianceService } from '@/services/compliance/compliance-service';
import { z } from 'zod';

const prisma = new PrismaClient();
const complianceService = new ComplianceService(prisma);

const ComplianceRuleSchema = z.object({
  name: z.string(),
  description: z.string(),
  type: z.enum(['data_retention', 'access_control', 'audit_requirement', 'encryption', 'export_restriction']),
  isActive: z.boolean(),
  configuration: z.object({
    retentionPeriodDays: z.number().optional(),
    requiredActions: z.array(z.string()).optional(),
    complianceStandard: z.string().optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
    autoRemediation: z.boolean().optional(),
    notificationChannels: z.array(z.string()).optional(),
  }),
  metadata: z.record(z.any()).default({}),
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
    const ruleData = ComplianceRuleSchema.parse(body);

    const rule = await complianceService.createComplianceRule(
      user.organizationId,
      ruleData
    );

    return NextResponse.json({ success: true, rule });
  } catch (error) {
    console.error('Create compliance rule error:', error);
    return NextResponse.json(
      { error: 'Failed to create compliance rule' },
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

    const rules = await complianceService.getComplianceRules(user.organizationId);

    return NextResponse.json({ rules });
  } catch (error) {
    console.error('Get compliance rules error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch compliance rules' },
      { status: 500 }
    );
  }
}