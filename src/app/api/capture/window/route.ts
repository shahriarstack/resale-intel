import { ok, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { findAuthorisingWindow, remaining } from "@/lib/captureWindow";

/**
 * "May I capture directly right now?" — asked by the officer's own screens.
 *
 * Deliberately thin, and deliberately not a source of truth: the intake chooser
 * and the capture form use it to decide what to SHOW, while
 * `POST /api/vehicles` re-derives the same answer from the same function before
 * it writes anything. A client that lied about this would get a form it could
 * fill in and not submit.
 *
 * Answers for the caller only. There is no way to ask this about somebody else,
 * so an officer cannot use it to discover which territories are open.
 */
export const GET = withGuard(async () => {
  const user = await requireUser();
  const win = await findAuthorisingWindow(prisma, user);

  if (!win) return ok({ open: false as const });

  return ok({
    open: true as const,
    id: win.id,
    reason: win.reason,
    closesAt: win.closesAt,
    openedByName: win.openedByName,
    maxCaptures: win.maxCaptures,
    used: win.used,
    remaining: remaining({
      opensAt: new Date(0),
      closesAt: win.closesAt,
      closedAt: null,
      maxCaptures: win.maxCaptures,
      used: win.used,
    }),
  });
});
