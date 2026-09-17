import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { getEngineerScorecard, getTeamScorecard } from "@/lib/scorecard";

/**
 * The scorecard read.
 *
 * The month picker exists so the figures can be scrubbed month by month, and
 * the figures are database aggregates — so each change of month is a server
 * round trip. It is a GET rather than a page navigation because the surfaces
 * that show it sit inside a tab: pushing the month into the URL would re-render
 * the dashboard and lose which tab the user was on.
 *
 * Three scopes, three different guards:
 *   me       — an engineer's own card. Never takes an id from the caller.
 *   team     — the whole workshop, for the Service Manager.
 *   engineer — one engineer's card, for the Service Manager drilling into a row.
 */
export const GET = withGuard(async (request: Request) => {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get("month");
  const scope = searchParams.get("scope") ?? "me";

  if (scope === "me") {
    // The id comes from the session, never the query string — an engineer
    // cannot read a colleague's card by editing a URL.
    const user = await requireRole("SERVICE_ENGINEER");
    return ok(await getEngineerScorecard(user.id, month));
  }

  if (scope === "team") {
    await requireRole("SERVICE_HEAD");
    return ok(await getTeamScorecard(month));
  }

  if (scope === "engineer") {
    await requireRole("SERVICE_HEAD");
    const engineerId = searchParams.get("engineerId");
    if (!engineerId) return fail("engineerId is required for this scope", 400);
    return ok(await getEngineerScorecard(engineerId, month));
  }

  return fail("Unknown scope", 400);
});
