import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/db";
import { redactSecretsFromObject } from "@/lib/utils/secretRedaction";
import { modelRegistry } from "@/services/models/registry";
import { modelSelector } from "@/services/models/selector";
import { z } from "zod";

// Input validation schemas
const CreateModelSchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.string().min(1).max(50),
  role: z.string().min(1).max(50),
  version: z.string().optional(),
  config: z.record(z.any()),
  capabilities: z.array(z.string()),
  status: z.enum(['stable', 'canary', 'disabled']).optional(),
});

const UpdateModelSchema = z.object({
  status: z.enum(['stable', 'canary', 'disabled']).optional(),
  config: z.record(z.any()).optional(),
  capabilities: z.array(z.string()).optional(),
});

const SelectModelSchema = z.object({
  role: z.string().min(1),
  isCritical: z.boolean().optional(),
  projectId: z.string().optional(),
  taskType: z.string().optional(),
  capabilities: z.array(z.string()).optional(),
});

// Helper function to check admin permissions
async function checkAdminPermissions(userId: string): Promise<{ isAdmin: boolean; user?: any }> {
  const user = await prisma.user.findFirst({
    where: { clerkId: userId },
    include: { team: true },
  });

  if (!user) {
    return { isAdmin: false };
  }

  // Check if user is admin (you can customize this logic)
  const isAdmin = user.email?.endsWith('@magi.com') ||
                  user.team?.some(t => t.role === 'admin') ||
                  process.env.ADMIN_USER_IDS?.split(',').includes(userId);

  return { isAdmin, user };
}

export async function GET(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const provider = searchParams.get('provider');
    const role = searchParams.get('role');
    const status = searchParams.get('status');
    const capabilities = searchParams.get('capabilities')?.split(',');

    // Get user permissions
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    // Get models with filters
    const models = await modelRegistry.getModels({
      provider: provider || undefined,
      role: role || undefined,
      status: status || undefined,
      capabilities: capabilities || undefined,
      isActive: true,
    });

    // Get registry stats
    const stats = await modelRegistry.getModelStats();
    const cacheInfo = modelRegistry.getCacheInfo();

    return NextResponse.json({
      models: models.map(model => ({
        id: model.id,
        name: model.name,
        provider: model.provider,
        role: model.role,
        version: model.version,
        capabilities: model.capabilities,
        status: model.status,
        createdAt: model.createdAt,
        updatedAt: model.updatedAt,
        // Redact sensitive config data
        config: redactSecretsFromObject(model.config),
      })),
      stats,
      cache: {
        size: cacheInfo.size,
        lastSync: cacheInfo.lastSync,
        isStale: cacheInfo.isStale,
      },
    });

  } catch (error) {
    console.error("Models GET API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin permissions
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await req.json();

    // Validate input
    const validation = CreateModelSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        },
        { status: 400 }
      );
    }

    const modelData = validation.data;

    // Add model to registry
    const newModel = await modelRegistry.addModel(modelData);
    if (!newModel) {
      return NextResponse.json(
        { error: "Failed to create model" },
        { status: 500 }
      );
    }

    // Log model creation
    await prisma.telemetryEvent.create({
      data: {
        eventType: 'model_created',
        userId: user.id,
        payload: redactSecretsFromObject({
          modelId: newModel.id,
          name: newModel.name,
          provider: newModel.provider,
          role: newModel.role,
          status: newModel.status,
          createdBy: user.email,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      id: newModel.id,
      name: newModel.name,
      provider: newModel.provider,
      role: newModel.role,
      version: newModel.version,
      capabilities: newModel.capabilities,
      status: newModel.status,
      createdAt: newModel.createdAt,
      message: "Model created successfully",
    });

  } catch (error) {
    console.error("Models POST API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin permissions
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get('id');
    const action = searchParams.get('action');

    if (!modelId) {
      return NextResponse.json({ error: "Model ID required" }, { status: 400 });
    }

    const body = await req.json();

    // Handle promotion action
    if (action === 'promote') {
      const result = await modelRegistry.promoteCanaryToStable(modelId);

      if (!result.success) {
        return NextResponse.json({ error: result.message }, { status: 400 });
      }

      // Log promotion
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'model_promoted',
          userId: user.id,
          payload: redactSecretsFromObject({
            modelId,
            promotedBy: user.email,
            timestamp: new Date().toISOString(),
          }),
        },
      });

      return NextResponse.json({
        success: true,
        message: result.message,
      });
    }

    // Handle regular updates
    const validation = UpdateModelSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: validation.error.issues.map(i => `${i.path.join('.')}: ${i.message}`)
        },
        { status: 400 }
      );
    }

    const updateData = validation.data;

    // Update model status if provided
    if (updateData.status) {
      const success = await modelRegistry.updateModelStatus(modelId, updateData.status);
      if (!success) {
        return NextResponse.json({ error: "Failed to update model status" }, { status: 500 });
      }
    }

    // Update other fields if provided
    if (updateData.config || updateData.capabilities) {
      const updateFields: any = {};
      if (updateData.config) updateFields.config = updateData.config;
      if (updateData.capabilities) updateFields.capabilities = updateData.capabilities;

      await prisma.model.update({
        where: { id: modelId },
        data: updateFields,
      });

      // Refresh cache
      await modelRegistry.syncFromDatabase(true);
    }

    // Log model update
    await prisma.telemetryEvent.create({
      data: {
        eventType: 'model_updated',
        userId: user.id,
        payload: redactSecretsFromObject({
          modelId,
          updates: Object.keys(updateData),
          updatedBy: user.email,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Model updated successfully",
    });

  } catch (error) {
    console.error("Models PUT API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check admin permissions
    const { isAdmin, user } = await checkAdminPermissions(userId);
    if (!isAdmin || !user) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const modelId = searchParams.get('id');

    if (!modelId) {
      return NextResponse.json({ error: "Model ID required" }, { status: 400 });
    }

    // Get model info before deletion
    const model = await modelRegistry.getModel(modelId);
    if (!model) {
      return NextResponse.json({ error: "Model not found" }, { status: 404 });
    }

    // Deactivate model (soft delete)
    const success = await modelRegistry.removeModel(modelId);
    if (!success) {
      return NextResponse.json({ error: "Failed to deactivate model" }, { status: 500 });
    }

    // Log model deactivation
    await prisma.telemetryEvent.create({
      data: {
        eventType: 'model_deactivated',
        userId: user.id,
        payload: redactSecretsFromObject({
          modelId,
          modelName: model.name,
          deactivatedBy: user.email,
          timestamp: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      success: true,
      message: "Model deactivated successfully",
    });

  } catch (error) {
    console.error("Models DELETE API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}