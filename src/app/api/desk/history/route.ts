import { ok, withGuard } from "@/lib/api";
import { requireStaff } from "@/lib/session";
import { getDeskHistory, DESK_DECISIONS } from "@/lib/deskHistory";
import { parseRange } from "@/lib/coverage";

/**
 * Approved history, scoped to the caller's own desk.
 *
 * The role comes from the session, never from a query parameter — the whole
 * point is that a desk sees what IT has decided, and a role that has no
 * decisions configured (an admin, a field role) simply gets an empty list
 * rather than an error, so a caller does not have to know in advance whether
 * history exists for it.
 */
export const GET = withGuard(async (request: Request) => {
  const user = await requireStaff();
  const { searchParams } = new URL(request.url);
  const range = parseRange(
    searchParams.get("from") ?? undefined,
    searchParams.get("to") ?? undefined,
  );

  if (!DESK_DECISIONS[user.role]) return ok([]);
  return ok(await getDeskHistory(user.role, range));
});
