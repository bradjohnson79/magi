import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { withSpan, addSpanAttributes } from "@/lib/observability/otel";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return withSpan(
    'admin.feature-flags.list',
    async (span) => {
      try {
        addSpanAttributes({
          'operation.type': 'admin_api',
          'http.method': 'GET',
          'http.route': '/api/admin/feature-flags',
        });

        const { userId } = await auth();
        if (!userId) {
          addSpanAttributes({ 'auth.status': 'unauthorized' });
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user is admin
        const user = await prisma.user.findFirst({
          where: { clerkId: userId },
        });

        if (!user || user.role !== 'admin') {
          addSpanAttributes({ 'auth.status': 'forbidden', 'user.role': user?.role });
          return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        addSpanAttributes({ 'auth.status': 'authorized', 'user.role': 'admin' });

        // Get all feature flags
        const flags = await prisma.featureFlag.findMany({
          include: {
            creator: {
              select: { id: true, name: true, email: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        });

        // Transform flags to match UI expectations
        const transformedFlags = flags.map(flag => ({
          id: flag.id,
          name: flag.name,
          key: flag.name.toLowerCase().replace(/\s+/g, '_'), // Generate key from name
          description: flag.description || '',
          category: 'core', // Default category - can be enhanced
          type: 'boolean', // Simplified for now
          value: flag.enabled,
          defaultValue: false,
          enabled: flag.enabled,
          environments: ['production'],
          rolloutPercentage: flag.rolloutPercentage,
          conditions: flag.conditions,
          createdAt: flag.createdAt.toISOString(),
          updatedAt: flag.updatedAt.toISOString(),
          lastModifiedBy: flag.creator.name || flag.creator.email
        }));

        addSpanAttributes({
          'response.status': 'success',
          'flags.count': flags.length
        });

        return NextResponse.json({
          flags: transformedFlags
        });
      } catch (error) {
        addSpanAttributes({
          'response.status': 'error',
          'error.message': error instanceof Error ? error.message : 'Unknown error'
        });
        console.error("Feature flags API error:", error);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    }
  );
}

export async function POST(req: NextRequest) {
  return withSpan(
    'admin.feature-flags.create',
    async (span) => {
      try {
        addSpanAttributes({
          'operation.type': 'admin_api',
          'http.method': 'POST',
          'http.route': '/api/admin/feature-flags',
        });

        const { userId } = await auth();
        if (!userId) {
          addSpanAttributes({ 'auth.status': 'unauthorized' });
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Check if user is admin
        const user = await prisma.user.findFirst({
          where: { clerkId: userId },
        });

        if (!user || user.role !== 'admin') {
          addSpanAttributes({ 'auth.status': 'forbidden', 'user.role': user?.role });
          return NextResponse.json({ error: "Admin access required" }, { status: 403 });
        }

        addSpanAttributes({ 'auth.status': 'authorized', 'user.role': 'admin' });

        const body = await req.json();
        const { name, key, description, enabled, rolloutPercentage, conditions } = body;

        // Validate required fields
        if (!name) {
          return NextResponse.json({ error: "Name is required" }, { status: 400 });
        }

        // Create feature flag
        const flag = await prisma.featureFlag.create({
          data: {
            name: key || name.toLowerCase().replace(/\s+/g, '_'),
            enabled: enabled || false,
            rolloutPercentage: rolloutPercentage || 0,
            description,
            conditions: conditions || {},
            createdBy: user.id,
          },
          include: {
            creator: {
              select: { id: true, name: true, email: true }
            }
          }
        });

        addSpanAttributes({
          'response.status': 'success',
          'flag.name': flag.name
        });

        return NextResponse.json({
          id: flag.id,
          name: flag.name,
          enabled: flag.enabled,
          description: flag.description,
          rolloutPercentage: flag.rolloutPercentage,
          createdAt: flag.createdAt.toISOString(),
          creator: flag.creator
        });
      } catch (error) {
        addSpanAttributes({
          'response.status': 'error',
          'error.message': error instanceof Error ? error.message : 'Unknown error'
        });
        console.error("Feature flag creation error:", error);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    }
  );
}