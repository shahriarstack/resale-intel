import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import {
  RETENTION_DAYS,
  pendingPurge,
  purgeSoldVehiclePhotos,
} from "@/lib/photoRetention";
import { pendingOrphans, purgeOrphans, uploadDirPath } from "@/lib/uploadOrphans";

export const runtime = "nodejs";

/**
 * The post-sale photo retention rule, as an endpoint.
 *
 * The sweep runs itself — see `startPhotoRetentionSweep`, started from
 * instrumentation.ts — so nothing outside is required to call this. It exists
 * for the two things an in-process timer cannot do:
 *
 *   GET   report what the next sweep will take, so an admin can see the rule
 *         working without waiting six hours to find out
 *   POST  run it now, for the case where a server has been restarted often
 *         enough that a sweep has not had a chance to land, or where somebody
 *         wants the images gone today
 *
 * Both are Super Admin only. POST is destructive and irreversible.
 */
export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  // Both reports, because they answer the same question — what is this
  // directory holding that it should not be — and an admin looking at one
  // wants the other. Neither call changes anything.
  const [pending, orphans] = await Promise.all([pendingPurge(), pendingOrphans()]);
  return ok({
    retentionDays: RETENTION_DAYS,
    ...pending,
    uploadDir: uploadDirPath(),
    orphans,
  });
});

/**
 * `?target=orphans` runs the unreferenced-file sweep instead of the retention
 * one. A query parameter rather than a body because this endpoint has never
 * taken one, and a POST that starts requiring JSON would break the existing
 * caller for no gain.
 *
 * Defaulting to the retention purge keeps every current caller doing exactly
 * what it did before. Both are destructive and irreversible; the orphan sweep
 * re-derives its own list rather than trusting anything the GET returned.
 */
export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");

  const target = new URL(request.url).searchParams.get("target");
  if (target === "orphans") {
    return ok({ target: "orphans", ...(await purgeOrphans()) });
  }
  if (target && target !== "retention") {
    return fail(`Unknown target: ${target}`, 400);
  }

  const result = await purgeSoldVehiclePhotos();
  return ok({ target: "retention", retentionDays: RETENTION_DAYS, ...result });
});
