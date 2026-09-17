import { ok, fail, withGuard, assertMoved } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { sopSchema } from "@/lib/validation";
import { canRunAction, canEditSop } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { taka } from "@/lib/format";
import { defaultCycleEnd, readCycle } from "@/lib/resale";

// Sr. Executive SOP cost. First set (from REGISTRATION_DONE) transitions the
// file to SOP_ADDED; later revisions (through Live) just update the figure and
// log SOP_UPDATED with the previous value — that log is the monthly history.
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SR_EXECUTIVE");
    const { id } = await context.params;
    const { sopCost, dealerCommission, price, relist } = sopSchema.parse(
      await request.json(),
    );

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        resaleCycleEndsAt: true,
        costing: { select: { sopCost: true, dealerCommission: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    const isFirstSet = vehicle.status === "REGISTRATION_DONE";
    if (isFirstSet) {
      if (!canRunAction(user.role, vehicle.status, "SET_SOP")) {
        return fail("You cannot set SOP for this vehicle", 403);
      }
      // Tarin proposes the selling price when submitting for approval.
      if (price === undefined) {
        return fail("Enter a proposed selling price to submit for approval", 422);
      }
    } else if (!canEditSop(user.role, vehicle.status)) {
      return fail("SOP cannot be edited at this stage", 409);
    }

    const previous = vehicle.costing?.sopCost ?? 0;
    const previousCommission = vehicle.costing?.dealerCommission ?? 0;
    const commission = dealerCommission ?? previousCommission;

    // Re-pricing a live vehicle opens a new pricing month. Dated from now
    // rather than from the old expiry, so a vehicle re-priced late in the
    // month does not immediately expire again.
    const cycle = readCycle(vehicle.resaleCycleEndsAt);
    const openNewCycle = relist === true && vehicle.status === "LIVE_FOR_RESALE";
    const nextCycleEnd = openNewCycle ? defaultCycleEnd() : null;

    await prisma.$transaction(async (tx) => {
      await tx.costing.upsert({
        where: { vehicleId: id },
        update: {
          sopCost,
          dealerCommission: commission,
          sopUpdatedAt: new Date(),
          sopUpdatedById: user.id,
          ...(isFirstSet ? { approvedPrice: price, priceSetById: user.id, priceSetAt: new Date() } : {}),
        },
        create: {
          vehicleId: id,
          sopCost,
          dealerCommission: commission,
          sopUpdatedAt: new Date(),
          sopUpdatedById: user.id,
          ...(isFirstSet ? { approvedPrice: price, priceSetById: user.id, priceSetAt: new Date() } : {}),
        },
      });

      if (nextCycleEnd) {
        await tx.vehicle.update({
          where: { id },
          data: { resaleCycleEndsAt: nextCycleEnd },
        });
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "PRICE_REVISED",
          field: "resaleCycle",
          oldValue: cycle.endsAt ? cycle.endsAt.toISOString().slice(0, 10) : "—",
          newValue: nextCycleEnd.toISOString().slice(0, 10),
          note: cycle.onHold
            ? "Re-priced and returned to the marketplace"
            : "Pricing month renewed",
        });
      }

      if (isFirstSet) {
        // Guarded on REGISTRATION_DONE — the status this first set was
        // authorised against — so the file leaves that desk exactly once.
        const moved = await tx.vehicle.updateMany({
          where: { id, status: "REGISTRATION_DONE" },
          data: { status: "SOP_ADDED" },
        });
        assertMoved(moved.count);
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "SOP_SET",
          fromStatus: "REGISTRATION_DONE",
          toStatus: "SOP_ADDED",
          note: `SOP ${taka(sopCost)}`,
        });
        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "PRICE_SET",
          field: "approvedPrice",
          newValue: taka(price!),
          note: "Proposed by Sr. Executive",
        });
      } else {
        if (sopCost !== previous) {
          await recordEvent(tx, {
            vehicleId: id,
            actorId: user.id,
            type: "SOP_UPDATED",
            field: "sopCost",
            oldValue: taka(previous),
            newValue: taka(sopCost),
          });
        }
        // Logged separately from SOP: they are different costs, revised for
        // different reasons, and a trail that merged them could not answer
        // which one moved.
        if (commission !== previousCommission) {
          await recordEvent(tx, {
            vehicleId: id,
            actorId: user.id,
            type: "SOP_UPDATED",
            field: "dealerCommission",
            oldValue: taka(previousCommission),
            newValue: taka(commission),
          });
        }
      }
    });

    return ok({
      sopCost,
      dealerCommission: commission,
      transitioned: isFirstSet,
      relisted: Boolean(nextCycleEnd),
      cycleEndsAt: nextCycleEnd?.toISOString() ?? null,
    });
  },
);
