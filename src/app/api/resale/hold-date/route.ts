import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resaleCycleSchema } from "@/lib/validation";
import { recordEvent } from "@/lib/audit";
import { MAX_EXTENSION_DAYS } from "@/lib/resale";

const DAY = 86_400_000;

/**
 * Set the auto-hold date for the whole marketplace at once.
 *
 * The cycle is per vehicle, but in practice the Sr. Executive runs one pricing
 * month across the book, so setting them one at a time would be busywork. This
 * writes the same end date to every currently-live vehicle.
 *
 * Deliberately NOT a global setting row. A stored default would apply to
 * vehicles listed later without anyone deciding it did, and the two would drift
 * the first time someone extended a single vehicle. Writing the date onto each
 * row keeps one source of truth — the vehicle's own cycle — and keeps the audit
 * trail per vehicle, which is where anyone would look for it.
 */
export const POST = withGuard(async (request: Request) => {
  const user = await requireRole("SR_EXECUTIVE");
  const { endsAt } = resaleCycleSchema.parse(await request.json());

  const now = new Date();
  if (endsAt.getTime() <= now.getTime()) {
    return fail("Choose a date in the future", 422);
  }
  if (endsAt.getTime() > now.getTime() + MAX_EXTENSION_DAYS * DAY) {
    return fail(`A hold date can be at most ${MAX_EXTENSION_DAYS} days out`, 422);
  }

  const live = await prisma.vehicle.findMany({
    where: { status: "LIVE_FOR_RESALE" },
    select: { id: true, resaleCycleEndsAt: true },
    take: 500,
  });

  if (live.length === 0) {
    return fail("Nothing is on the marketplace right now", 409);
  }

  // Only rows that actually change are written and logged. Re-confirming a
  // date nobody moved should not put 40 identical rows in the audit trail.
  const changing = live.filter(
    (v) => v.resaleCycleEndsAt?.getTime() !== endsAt.getTime(),
  );

  if (changing.length === 0) {
    return ok({ updated: 0, endsAt: endsAt.toISOString(), unchanged: live.length });
  }

  await prisma.$transaction(async (tx) => {
    await tx.vehicle.updateMany({
      where: { id: { in: changing.map((v) => v.id) } },
      data: { resaleCycleEndsAt: endsAt },
    });
    // One event per vehicle: the cycle belongs to the vehicle, so that is where
    // someone auditing a single record will look for when it changed.
    for (const v of changing) {
      await recordEvent(tx, {
        vehicleId: v.id,
        actorId: user.id,
        type: "PRICE_REVISED",
        field: "resaleCycle",
        oldValue: v.resaleCycleEndsAt?.toISOString().slice(0, 10) ?? "—",
        newValue: endsAt.toISOString().slice(0, 10),
        note: "Marketplace hold date set for all live vehicles",
      });
    }
  });

  return ok({
    updated: changing.length,
    unchanged: live.length - changing.length,
    endsAt: endsAt.toISOString(),
  });
});
