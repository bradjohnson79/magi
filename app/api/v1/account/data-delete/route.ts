/**
 * Data Deletion API Endpoint
 *
 * GDPR-compliant data deletion functionality allowing users to request
 * deletion of their personal data with proper safeguards and audit trails.
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/db';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

interface DeletionRequest {
  userId: string;
  requestedAt: Date;
  dataTypes: string[];
  reason?: string;
  confirmationToken?: string;
  scheduledDeletionDate?: Date;
  status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled';
}

interface DeletionResult {
  deletionId: string;
  status: string;
  deletedCounts: Record<string, number>;
  retainedData: string[];
  message: string;
}

// POST /api/v1/account/data-delete - Request data deletion
export async function POST(req: NextRequest) {
  return await withSpan(
    'data.deletion.request',
    async () => {
      try {
        // Authenticate user
        const { userId: clerkUserId } = await auth();
        if (!clerkUserId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // Find user in database
        const user = await prisma.user.findFirst({
          where: { clerkId: clerkUserId },
        });

        if (!user) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        const body = await req.json();
        const {
          dataTypes = ['all'],
          reason,
          confirmationToken,
          immediate = false
        } = body;

        // Add span attributes
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'data_deletion',
          [SPAN_ATTRIBUTES.USER_ID]: user.id,
          'deletion.data_types': dataTypes.join(','),
          'deletion.immediate': immediate,
        });

        // Validate data types
        const validDataTypes = [
          'all', 'prompts', 'projects', 'model_runs', 'feedback',
          'logs', 'snapshots', 'telemetry', 'usage_counters'
        ];

        const invalidTypes = dataTypes.filter((type: string) => !validDataTypes.includes(type));
        if (invalidTypes.length > 0) {
          return NextResponse.json(
            { error: `Invalid data types: ${invalidTypes.join(', ')}` },
            { status: 400 }
          );
        }

        // Check if user has pending deletion requests
        const existingRequests = await prisma.telemetryEvent.findMany({
          where: {
            userId: user.id,
            eventType: 'data.deletion_requested',
            createdAt: {
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
            },
          },
        });

        if (existingRequests.length > 0) {
          return NextResponse.json(
            {
              error: 'Deletion request already pending',
              message: 'You have a pending data deletion request. Please wait 30 days before submitting another request.',
            },
            { status: 429 }
          );
        }

        const deletionId = crypto.randomUUID();

        // For immediate deletion (testing/development only)
        if (immediate && confirmationToken) {
          const result = await performDataDeletion(user.id, dataTypes, deletionId);

          // Log the deletion
          await auditLogger.logData('data.deleted', user.id, {
            deletionId,
            dataTypes,
            reason,
            immediate: true,
            deletedCounts: result.deletedCounts,
          });

          return NextResponse.json({
            success: true,
            data: result,
          });
        }

        // Standard deletion request with grace period
        const gracePeriodDays = 30; // GDPR allows up to 30 days
        const scheduledDeletionDate = new Date();
        scheduledDeletionDate.setDate(scheduledDeletionDate.getDate() + gracePeriodDays);

        // Create deletion request record
        await prisma.telemetryEvent.create({
          data: {
            userId: user.id,
            eventType: 'data.deletion_requested',
            payload: {
              deletionId,
              dataTypes,
              reason,
              scheduledDeletionDate: scheduledDeletionDate.toISOString(),
              status: 'pending',
              gracePeriodDays,
            },
          },
        });

        // Log the deletion request
        await auditLogger.logData('data.deletion_requested', user.id, {
          deletionId,
          dataTypes,
          reason,
          scheduledDeletionDate: scheduledDeletionDate.toISOString(),
        });

        // TODO: Send confirmation email to user

        return NextResponse.json({
          success: true,
          data: {
            deletionId,
            status: 'pending',
            scheduledDeletionDate: scheduledDeletionDate.toISOString(),
            gracePeriodDays,
            message: `Your data deletion request has been submitted. Deletion will occur on ${scheduledDeletionDate.toDateString()} unless cancelled.`,
            cancellationInstructions: 'To cancel this request, contact support or use the cancellation endpoint.',
          },
        });

      } catch (error) {
        console.error('Data deletion request error:', error);

        return NextResponse.json(
          {
            success: false,
            error: 'Deletion request failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}

// DELETE /api/v1/account/data-delete - Cancel pending deletion
export async function DELETE(req: NextRequest) {
  return await withSpan(
    'data.deletion.cancel',
    async () => {
      try {
        // Authenticate user
        const { userId: clerkUserId } = await auth();
        if (!clerkUserId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // Find user in database
        const user = await prisma.user.findFirst({
          where: { clerkId: clerkUserId },
        });

        if (!user) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        const url = new URL(req.url);
        const deletionId = url.searchParams.get('deletionId');

        if (!deletionId) {
          return NextResponse.json(
            { error: 'Deletion ID is required' },
            { status: 400 }
          );
        }

        // Find the deletion request
        const deletionRequest = await prisma.telemetryEvent.findFirst({
          where: {
            userId: user.id,
            eventType: 'data.deletion_requested',
            payload: {
              path: ['deletionId'],
              equals: deletionId,
            },
          },
        });

        if (!deletionRequest) {
          return NextResponse.json(
            { error: 'Deletion request not found' },
            { status: 404 }
          );
        }

        const payload = deletionRequest.payload as any;

        if (payload.status !== 'pending') {
          return NextResponse.json(
            {
              error: 'Cannot cancel deletion request',
              message: `Deletion request is already ${payload.status}`,
            },
            { status: 400 }
          );
        }

        // Update the deletion request status
        await prisma.telemetryEvent.create({
          data: {
            userId: user.id,
            eventType: 'data.deletion_cancelled',
            payload: {
              deletionId,
              cancelledAt: new Date().toISOString(),
              originalRequest: payload,
            },
          },
        });

        // Log the cancellation
        await auditLogger.logData('data.deletion_cancelled', user.id, {
          deletionId,
          originalScheduledDate: payload.scheduledDeletionDate,
        });

        return NextResponse.json({
          success: true,
          message: 'Data deletion request has been cancelled successfully.',
          deletionId,
        });

      } catch (error) {
        console.error('Data deletion cancellation error:', error);

        return NextResponse.json(
          {
            success: false,
            error: 'Cancellation failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}

// GET /api/v1/account/data-delete - Get deletion request status
export async function GET(req: NextRequest) {
  return await withSpan(
    'data.deletion.status',
    async () => {
      try {
        // Authenticate user
        const { userId: clerkUserId } = await auth();
        if (!clerkUserId) {
          return NextResponse.json(
            { error: 'Unauthorized' },
            { status: 401 }
          );
        }

        // Find user in database
        const user = await prisma.user.findFirst({
          where: { clerkId: clerkUserId },
        });

        if (!user) {
          return NextResponse.json(
            { error: 'User not found' },
            { status: 404 }
          );
        }

        // Get all deletion-related events for the user
        const deletionEvents = await prisma.telemetryEvent.findMany({
          where: {
            userId: user.id,
            eventType: {
              in: ['data.deletion_requested', 'data.deletion_cancelled', 'data.deleted'],
            },
          },
          orderBy: { createdAt: 'desc' },
          take: 10,
        });

        const requests = deletionEvents.map(event => ({
          id: (event.payload as any).deletionId,
          type: event.eventType,
          createdAt: event.createdAt,
          payload: event.payload,
        }));

        return NextResponse.json({
          success: true,
          data: {
            requests,
            hasPendingRequest: requests.some(r =>
              r.type === 'data.deletion_requested' &&
              (r.payload as any).status === 'pending'
            ),
          },
        });

      } catch (error) {
        console.error('Data deletion status error:', error);

        return NextResponse.json(
          {
            success: false,
            error: 'Status check failed',
            message: error instanceof Error ? error.message : 'Unknown error',
          },
          { status: 500 }
        );
      }
    }
  );
}

/**
 * Perform actual data deletion
 */
async function performDataDeletion(
  userId: string,
  dataTypes: string[],
  deletionId: string
): Promise<DeletionResult> {
  const deletedCounts: Record<string, number> = {};
  const retainedData: string[] = [];

  // Use transaction for atomic deletion
  await prisma.$transaction(async (tx) => {
    // Delete or anonymize based on data type
    for (const dataType of dataTypes) {
      switch (dataType) {
        case 'all':
        case 'prompts':
          if (dataType === 'all' || dataType === 'prompts') {
            const result = await tx.prompt.deleteMany({
              where: { userId },
            });
            deletedCounts.prompts = result.count;
          }

        case 'feedback':
          if (dataType === 'all' || dataType === 'feedback') {
            const result = await tx.feedback.deleteMany({
              where: { userId },
            });
            deletedCounts.feedback = result.count;
          }

        case 'logs':
          if (dataType === 'all' || dataType === 'logs') {
            const result = await tx.log.deleteMany({
              where: { userId },
            });
            deletedCounts.logs = result.count;
          }

        case 'snapshots':
          if (dataType === 'all' || dataType === 'snapshots') {
            const result = await tx.snapshot.deleteMany({
              where: { createdBy: userId },
            });
            deletedCounts.snapshots = result.count;
            // TODO: Delete actual snapshot files from storage
          }

        case 'telemetry':
          if (dataType === 'all' || dataType === 'telemetry') {
            const result = await tx.telemetryEvent.deleteMany({
              where: { userId },
            });
            deletedCounts.telemetry = result.count;
          }

        case 'usage_counters':
          if (dataType === 'all' || dataType === 'usage_counters') {
            const result = await tx.usageCounter.deleteMany({
              where: { userId },
            });
            deletedCounts.usageCounters = result.count;
          }

        case 'model_runs':
          if (dataType === 'all' || dataType === 'model_runs') {
            // Anonymize model runs instead of deleting (for model improvement)
            const result = await tx.modelRun.updateMany({
              where: { userId },
              data: {
                userId: null, // Remove user association
                inputPayload: {}, // Clear input data
                outputPayload: {}, // Clear output data
              },
            });
            deletedCounts.modelRuns = result.count;
            retainedData.push('Model runs anonymized for research purposes');
          }

        case 'projects':
          if (dataType === 'all' || dataType === 'projects') {
            // Only delete projects where user is the sole owner
            const ownedProjects = await tx.project.findMany({
              where: { ownerId: userId },
              include: {
                team: {
                  include: {
                    members: true,
                  },
                },
              },
            });

            let deletedProjectsCount = 0;
            for (const project of ownedProjects) {
              if (!project.team || project.team.members.length <= 1) {
                // Safe to delete - no other team members
                await tx.project.delete({
                  where: { id: project.id },
                });
                deletedProjectsCount++;
              } else {
                // Transfer ownership to another team member
                const newOwner = project.team.members.find(m => m.userId !== userId);
                if (newOwner) {
                  await tx.project.update({
                    where: { id: project.id },
                    data: { ownerId: newOwner.userId },
                  });
                  retainedData.push(`Project "${project.name}" transferred to team member`);
                }
              }
            }
            deletedCounts.projects = deletedProjectsCount;
          }
      }
    }

    // Always retain audit logs for compliance
    retainedData.push('Audit logs retained for legal compliance');

    // Mark user account for deletion if 'all' was specified
    if (dataTypes.includes('all')) {
      await tx.user.update({
        where: { id: userId },
        data: {
          email: `deleted-${deletionId}@example.com`,
          name: 'Deleted User',
          allowTraining: false,
          metadata: {
            deleted: true,
            deletedAt: new Date().toISOString(),
            deletionId,
          },
        },
      });
      retainedData.push('User account marked as deleted');
    }
  });

  return {
    deletionId,
    status: 'completed',
    deletedCounts,
    retainedData,
    message: 'Data deletion completed successfully',
  };
}