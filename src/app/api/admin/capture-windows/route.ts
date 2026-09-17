import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { captureWindowSchema } from "@/lib/validation";
import { windowState, type WindowState } from "@/lib/captureWindow";

/**
 * The admin console's view of every direct-capture window ever opened.
 *
 * Returns them all, not just the live ones. A closed window is the evidence
 * for a set of vehicles that skipped the approval gate, so it stays as
 * readable as the day it was opened — and the count of what came through it is
 * the number that makes it worth reading.
 */
export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");

  const rows = await prisma.captureWindow.findMany({
    orderBy: [{ openedAt: "desc" }],
    select: {
      id: true,
      reason: true,
      opensAt: true,
      closesAt: true,
      maxCaptures: true,
      openedAt: true,
      closedAt: true,
      closeNote: true,
      territory: { select: { id: true, name: true } },
      openedBy: { select: { name: true, staffId: true } },
      closedBy: { select: { name: true } },
      _count: { select: { vehicles: true } },
    },
  });

  const now = new Date();
  return ok(
    rows.map((w) => {
      const used = w._count.vehicles;
      const state: WindowState = windowState(
        {
          opensAt: w.opensAt,
          closesAt: w.closesAt,
          closedAt: w.closedAt,
          maxCaptures: w.maxCaptures,
          used,
        },
        now,
      );
      return {
        id: w.id,
        reason: w.reason,
        opensAt: w.opensAt,
        closesAt: w.closesAt,
        maxCaptures: w.maxCaptures,
        openedAt: w.openedAt,
        closedAt: w.closedAt,
        closeNote: w.closeNote,
        territory: w.territory,
        openedBy: w.openedBy,
        closedBy: w.closedBy,
        used,
        state,
      };
    }),
  );
});

/** Open a window. Super Admin only — the whole gate rests on that. */
export const POST = withGuard(async (request: Request) => {
  const user = await requireRole("SUPER_ADMIN");
  const data = captureWindowSchema.parse(await request.json());

  const row = await prisma.captureWindow.create({
    data: {
      reason: data.reason,
      opensAt: data.opensAt ?? new Date(),
      closesAt: data.closesAt,
      maxCaptures: data.maxCaptures ?? null,
      territoryId: data.territoryId?.trim() || null,
      openedById: user.id,
    },
    select: { id: true },
  });

  return ok(row, 201);
});
