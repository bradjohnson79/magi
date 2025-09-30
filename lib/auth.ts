import { auth, clerkClient } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import type { User } from '@clerk/nextjs/server';

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  imageUrl?: string;
}

/**
 * Get the current authenticated user
 * Throws an error if not authenticated
 */
export async function getCurrentUser(): Promise<AuthUser> {
  const { userId } = await auth();

  if (!userId) {
    throw new Error('Unauthorized');
  }

  const user = await clerkClient.users.getUser(userId);

  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress || '',
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    imageUrl: user.imageUrl || undefined,
  };
}

/**
 * Get the current user ID or null if not authenticated
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth();
  return userId;
}

/**
 * Require authentication - redirects to sign-in if not authenticated
 */
export async function requireAuth(): Promise<AuthUser> {
  const { userId } = await auth();

  if (!userId) {
    redirect('/auth/login');
  }

  const user = await clerkClient.users.getUser(userId);

  return {
    id: user.id,
    email: user.emailAddresses[0]?.emailAddress || '',
    firstName: user.firstName || undefined,
    lastName: user.lastName || undefined,
    imageUrl: user.imageUrl || undefined,
  };
}

/**
 * Check if user is authenticated
 */
export async function isAuthenticated(): Promise<boolean> {
  const { userId } = await auth();
  return !!userId;
}

/**
 * Check if user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const { userId } = await auth();

  if (!userId) {
    return false;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    // Check if user has admin role or specific email
    return user.publicMetadata?.role === 'admin' ||
           user.emailAddresses.some(email =>
             email.emailAddress.endsWith('@magi.dev') ||
             email.emailAddress.endsWith('@anthropic.com')
           );
  } catch {
    return false;
  }
}

/**
 * Require admin access - throws error if not admin
 */
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireAuth();

  if (!(await isAdmin())) {
    throw new Error('Admin access required');
  }

  return user;
}