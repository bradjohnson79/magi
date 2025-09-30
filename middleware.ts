import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from 'next/server';
// import { domainRouter } from '@/lib/middleware/domain-router'; // Temporarily disabled for Edge Runtime compatibility

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/admin(.*)",
  "/api/v1/(.*)",
]);

export default clerkMiddleware(async (auth, req: NextRequest) => {
  // Handle domain routing first (before auth) - TEMPORARILY DISABLED
  // if (!req.nextUrl.pathname.startsWith('/api') &&
  //     !req.nextUrl.pathname.startsWith('/_next') &&
  //     !req.nextUrl.pathname.includes('.')) {
  //   try {
  //     const domainResponse = await domainRouter.handleRequest(req);
  //     if (domainResponse) {
  //       return domainResponse;
  //     }
  //   } catch (error) {
  //     console.error('Domain routing error:', error);
  //   }
  // }

  // Handle authentication for protected routes
  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes) - but include /api/v1 for protection
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
    "/",
    "/(api|trpc)(.*)",
  ],
};