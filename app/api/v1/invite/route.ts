/**
 * Invite API Routes
 *
 * Handles workspace invitation management.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { workspaceManager, WorkspaceRole } from '@/services/workspace/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * POST /api/v1/invite
 * Send workspace invitation
 */
export async function POST(request: NextRequest) {
  return withSpan('api.invite.send', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'workspace_invite_send',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'send_invite', 20, 3600); // 20 per hour
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.workspaceId || typeof body.workspaceId !== 'string') {
        return NextResponse.json(
          { error: 'Workspace ID is required' },
          { status: 400 }
        );
      }

      if (!body.email || typeof body.email !== 'string') {
        return NextResponse.json(
          { error: 'Email is required' },
          { status: 400 }
        );
      }

      if (!body.role || !Object.values(WorkspaceRole).includes(body.role)) {
        return NextResponse.json(
          { error: 'Valid role is required' },
          { status: 400 }
        );
      }

      // Email validation
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(body.email)) {
        return NextResponse.json(
          { error: 'Invalid email address' },
          { status: 400 }
        );
      }

      const member = await workspaceManager.inviteMember({
        workspaceId: body.workspaceId,
        email: body.email,
        role: body.role,
        permissions: body.permissions,
        invitedBy: userId,
      });

      // TODO: Send invitation email
      // await emailService.sendWorkspaceInvitation({
      //   email: body.email,
      //   workspaceName: workspace.name,
      //   inviterName: inviter.name,
      //   role: body.role,
      //   inviteLink: `${process.env.NEXT_PUBLIC_APP_URL}/invite/${inviteToken}`,
      // });

      return NextResponse.json({
        success: true,
        data: member,
        message: 'Invitation sent successfully',
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to send invitation:', error);

      if ((error as Error).message.includes('Permission denied')) {
        return NextResponse.json(
          { error: 'Permission denied' },
          { status: 403 }
        );
      }

      if ((error as Error).message.includes('User not found')) {
        return NextResponse.json(
          { error: 'User not found' },
          { status: 404 }
        );
      }

      if ((error as Error).message.includes('already a member')) {
        return NextResponse.json(
          { error: 'User is already a member of this workspace' },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to send invitation' },
        { status: 500 }
      );
    }
  });
}