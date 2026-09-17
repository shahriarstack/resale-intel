import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { getTerritoryMap } from "@/lib/territoryMap";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Both territory maps, derived from the roster.
 *
 * Read-only by construction, not by a check: there is no write path here
 * because there is nothing to write. A recovery patch exists because an
 * officer is posted to it and a sales patch exists because a sales officer is
 * assigned to it — both are edited in the users console, which is the only
 * place either fact lives.
 */
export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  return ok(await getTerritoryMap());
});
