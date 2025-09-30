import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { withSpan, addSpanAttributes } from "@/lib/observability/otel";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  return withSpan(
    'projects.get',
    async (span) => {
      try {
        addSpanAttributes({
          'operation.type': 'api_request',
          'http.method': 'GET',
          'http.route': '/api/v1/projects/[projectId]',
          'project.id': params.projectId,
        });

        const { userId } = await auth();
        if (!userId) {
          addSpanAttributes({ 'auth.status': 'unauthorized' });
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        addSpanAttributes({ 'auth.status': 'authorized', 'user.id': userId });

        const { projectId } = params;

        // Mock project data - in a real app this would come from the database
        const project = {
          id: projectId,
          name: "Sample Project",
          description: "A sample project for development",
          status: "active",
          createdBy: userId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        addSpanAttributes({ 'response.status': 'success' });
        return NextResponse.json(project);
      } catch (error) {
        addSpanAttributes({
          'response.status': 'error',
          'error.message': error instanceof Error ? error.message : 'Unknown error'
        });
        console.error("Project API error:", error);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    }
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  return withSpan(
    'projects.update',
    async (span) => {
      try {
        addSpanAttributes({
          'operation.type': 'api_request',
          'http.method': 'PUT',
          'http.route': '/api/v1/projects/[projectId]',
          'project.id': params.projectId,
        });

        const { userId } = await auth();
        if (!userId) {
          addSpanAttributes({ 'auth.status': 'unauthorized' });
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        addSpanAttributes({ 'auth.status': 'authorized', 'user.id': userId });

        const { projectId } = params;
        const body = await req.json();

        // Mock project update - in a real app this would update the database
        const updatedProject = {
          id: projectId,
          ...body,
          updatedAt: new Date().toISOString(),
        };

        addSpanAttributes({ 'response.status': 'success' });
        return NextResponse.json(updatedProject);
      } catch (error) {
        addSpanAttributes({
          'response.status': 'error',
          'error.message': error instanceof Error ? error.message : 'Unknown error'
        });
        console.error("Project update API error:", error);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    }
  );
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { projectId: string } }
) {
  return withSpan(
    'projects.delete',
    async (span) => {
      try {
        addSpanAttributes({
          'operation.type': 'api_request',
          'http.method': 'DELETE',
          'http.route': '/api/v1/projects/[projectId]',
          'project.id': params.projectId,
        });

        const { userId } = await auth();
        if (!userId) {
          addSpanAttributes({ 'auth.status': 'unauthorized' });
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        addSpanAttributes({ 'auth.status': 'authorized', 'user.id': userId });

        const { projectId } = params;

        // Mock project deletion - in a real app this would delete from database
        addSpanAttributes({ 'response.status': 'success' });
        return NextResponse.json({
          message: "Project deleted successfully",
          projectId
        });
      } catch (error) {
        addSpanAttributes({
          'response.status': 'error',
          'error.message': error instanceof Error ? error.message : 'Unknown error'
        });
        console.error("Project deletion API error:", error);
        return NextResponse.json(
          { error: "Internal server error" },
          { status: 500 }
        );
      }
    }
  );
}