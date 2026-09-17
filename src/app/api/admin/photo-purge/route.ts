import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import {
  RETENTION_DAYS,
  pendingPurge,
  purgeSoldVehiclePhotos,
} from "@/lib/photoRetention";

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
  const pending = await pendingPurge();
  return ok({ retentionDays: RETENTION_DAYS, ...pending });
});

export const POST = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  const result = await purgeSoldVehiclePhotos();
  return ok({ retentionDays: RETENTION_DAYS, ...result });
});
