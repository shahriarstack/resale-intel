/**
 * Server start-up.
 *
 * `register` is called once per Next.js server instance, before it takes
 * requests. It is the only hook in the framework that runs on boot rather than
 * on a request, which makes it the one place a background job can be started
 * without an external scheduler.
 *
 * Guarded twice, and both matter:
 *
 *   NEXT_RUNTIME    this file is evaluated for the edge runtime too, where
 *                   node:fs and a database client do not exist
 *   NEXT_PHASE      `next build` initiates a server to prerender pages, and a
 *                   build is not a thing that should be deleting production
 *                   photographs
 *
 * The import is dynamic so the retention module — which pulls in Prisma and
 * node:fs — is never loaded in a runtime that cannot have it.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { startPhotoRetentionSweep } = await import("./lib/photoRetention");
  startPhotoRetentionSweep();
}
