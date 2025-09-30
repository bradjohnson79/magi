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

const ToggleSchema = z.object({
  enabled: z.boolean(),
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
    const { enabled } = ToggleSchema.parse(body);

    const settings = await evolutionControl.toggleEvolution(
      user.organizationId,
      enabled,
      user.id
    );

    return NextResponse.json({
      success: true,
      settings,
      message: enabled ? 'Evolution enabled' : 'Evolution disabled'
    });
  } catch (error) {
    console.error('Toggle evolution error:', error);
    return NextResponse.json(
      { error: 'Failed to toggle evolution' },
      { status: 500 }
    );
  }
}