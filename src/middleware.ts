import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

// 1. Define routes that require authentication
const isProtectedRoute = createRouteMatcher([
  '/room(.*)', 
]);

// 2. Define routes that MUST be public for your Guest Mode to work
const isPublicRoute = createRouteMatcher([
  '/', 
  '/api/liveblocks-auth' 
]);

export default clerkMiddleware(async (auth, req) => {
  // If the route is public, do nothing
  if (isPublicRoute(req)) return;

  // Await the auth state
  const authObject = await auth();

  // If it's a protected route and user isn't logged in, redirect to sign-in
  if (isProtectedRoute(req) && !authObject.userId) {
    return authObject.redirectToSignIn();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};