import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { PrismaClient } from '@prisma/client';
import { EvolutionControlService } from '@/services/evolution/evolution-control';
import { CodeAnalysisService } from '@/services/evolution/analysis-service';
import { RefactorService } from '@/services/evolution/refactor-service';
import { CanaryModelService } from '@/services/evolution/canary-service';
import { z } from 'zod';

const prisma = new PrismaClient();
const analysisService = new CodeAnalysisService(prisma);
const refactorService = new RefactorService(prisma, analysisService);
const canaryService = new CanaryModelService(prisma);
const evolutionControl = new EvolutionControlService(
  prisma,
  analysisService,
  refactorService,
  canaryService
);

const EvolutionSettingsSchema = z.object({
  enabled: z.boolean().optional(),
  features: z.object({
    codeAnalysis: z.object({
      enabled: z.boolean(),
      schedule: z.string(),
      analysisTypes: z.array(z.enum(['performance', 'security', 'style', 'complexity'])),
      autoFix: z.object({
        enabled: z.boolean(),
        confidenceThreshold: z.number().min(0).max(1),
        allowedTypes: z.array(z.string()),
      }),
    }).optional(),
    autoRefactor: z.object({
      enabled: z.boolean(),
      autoApprove: z.boolean(),
      confidenceThreshold: z.number().min(0).max(1),
      maxChangesPerDay: z.number().min(0),
      requiresReview: z.array(z.string()),
      rollbackOnFailure: z.boolean(),
    }).optional(),
    canaryTesting: z.object({
      enabled: z.boolean(),
      autoPromote: z.boolean(),
      trafficPercentage: z.number().min(0).max(100),
      testDuration: z.number().min(1),
      promotionCriteria: z.object({
        accuracyImprovement: z.number(),
        errorRateThreshold: z.number(),
        latencyThreshold: z.number(),
      }),
    }).optional(),
    notifications: z.object({
      enabled: z.boolean(),
      channels: z.array(z.enum(['email', 'slack', 'webhook'])),
      events: z.array(z.string()),
      recipients: z.array(z.string()),
    }).optional(),
  }).optional(),
  safeguards: z.object({
    maxDailyChanges: z.number().min(0),
    requiredApprovers: z.number().min(0),
    emergencyStop: z.boolean(),
    rollbackWindow: z.number().min(1),
    testCoverageThreshold: z.number().min(0).max(100),
    securityScanRequired: z.boolean(),
  }).optional(),
  metadata: z.record(z.any()).optional(),
});

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

    const settings = await evolutionControl.getEvolutionSettings(user.organizationId);
    const metrics = await evolutionControl.getEvolutionMetrics(user.organizationId, 7);
    const events = await evolutionControl.getEvolutionEvents(user.organizationId, 20);

    return NextResponse.json({
      settings,
      metrics,
      events,
    });
  } catch (error) {
    console.error('Get evolution settings error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch evolution settings' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
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
    const updates = EvolutionSettingsSchema.parse(body);

    const settings = await evolutionControl.updateEvolutionSettings(
      user.organizationId,
      updates,
      user.id
    );

    return NextResponse.json({ success: true, settings });
  } catch (error) {
    console.error('Update evolution settings error:', error);
    return NextResponse.json(
      { error: 'Failed to update evolution settings' },
      { status: 500 }
    );
  }
}