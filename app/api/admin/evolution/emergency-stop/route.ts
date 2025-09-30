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

const EmergencyStopSchema = z.object({
  reason: z.string().min(1),
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
    const { reason } = EmergencyStopSchema.parse(body);

    await evolutionControl.emergencyStop(user.organizationId, user.id, reason);

    return NextResponse.json({
      success: true,
      message: 'Emergency stop activated successfully'
    });
  } catch (error) {
    console.error('Emergency stop error:', error);
    return NextResponse.json(
      { error: 'Failed to activate emergency stop' },
      { status: 500 }
    );
  }
}