import { NextResponse } from "next/server";
import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { bidEditSchema } from "@/lib/validation";
import { canPlaceBid } from "@/lib/rbac";
import { readCycle } from "@/lib/resale";
import { recordEvent } from "@/lib/audit";
import { taka } from "@/lib/format";

/**
 * One offer on the table.
 *
 * Both handlers answer the same two questions before touching anything: is
 * this the officer's OWN offer, and is the vehicle still open? An officer may
 * correct or retract what they submitted; they may not reach into another
 * officer's customer, and neither may they edit an offer on a vehicle that has
 * already been sold or pulled off the market — the desk's decision is made
 * against the book as it stood.
 */
async function loadOwnOffer(vehicleId: string, bidId: string, userId: string) {
  const offer = await prisma.bid.findUnique({
    where: { id: bidId },
    select: {
      id: true,
      vehicleId: true,
      bidderId: true,
      customerName: true,
      amount: true,
      note: true,
      withdrawnAt: true,
      vehicle: { select: { status: true, resaleCycleEndsAt: true } },
    },
  });
  // Returns the row, or the response to send instead. A NextResponse is an
  // unambiguous "stop here" that both handlers can test for with instanceof,
  // which keeps the two guards written once rather than once per verb.
  if (!offer || offer.vehicleId !== vehicleId) {
    return fail("That offer is not on this vehicle", 404);
  }
  if (offer.bidderId !== userId) {
    return fail("You can only change offers you submitted", 403);
  }
  return offer;
}

function openForEdits(
  role: Parameters<typeof canPlaceBid>[0],
  vehicle: { status: Parameters<typeof canPlaceBid>[1]; resaleCycleEndsAt: Date | null },
) {
  const cycle = readCycle(vehicle.resaleCycleEndsAt);
  if (canPlaceBid(role, vehicle.status, cycle.onHold)) return null;
  if (vehicle.status === "SOLD") return fail("This vehicle has been sold", 409);
  if (vehicle.status === "LIVE_FOR_RESALE" && cycle.onHold) {
    return fail("This vehicle is on hold while its price is revised", 409);
  }
  return fail("This vehicle is no longer open for offers", 409);
}

/** Correct an offer in place — a mistyped figure, a renamed buyer, new terms. */
export const PATCH = withGuard(
  async (
    request: Request,
    context: { params: Promise<{ id: string; bidId: string }> },
  ): Promise<NextResponse> => {
    const user = await requireUser();
    const { id, bidId } = await context.params;
    const patch = bidEditSchema.parse(await request.json());

    const offer = await loadOwnOffer(id, bidId, user.id);
    if (offer instanceof NextResponse) return offer;

    if (offer.withdrawnAt) return fail("That offer has been withdrawn", 409);
    const closed = openForEdits(user.role, offer.vehicle);
    if (closed) return closed;

    const nextName = patch.customerName ?? offer.customerName;
    const nextAmount = patch.amount ?? offer.amount;
    const nextNote = patch.note === undefined ? offer.note : patch.note || null;

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.bid.update({
        where: { id: bidId },
        data: {
          customerName: nextName,
          amount: nextAmount,
          note: nextNote,
          revisedAt: new Date(),
        },
        select: { id: true, customerName: true, amount: true, note: true, revisedAt: true },
      });

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "BID_REVISED",
        field: "offer",
        oldValue: `${offer.customerName ?? "—"} — ${taka(offer.amount)}`,
        newValue: `${nextName ?? "—"} — ${taka(nextAmount)}`,
        note: nextNote,
      });

      return row;
    });

    return ok({
      offer: {
        ...updated,
        revisedAt: updated.revisedAt?.toISOString() ?? null,
      },
    });
  },
);

/**
 * Take an offer off the table.
 *
 * A stamp, never a delete: the vehicle's history should still show that this
 * customer was once at this price, and an award decision made while the offer
 * stood needs the row it was made against to survive.
 */
export const DELETE = withGuard(
  async (
    _request: Request,
    context: { params: Promise<{ id: string; bidId: string }> },
  ): Promise<NextResponse> => {
    const user = await requireUser();
    const { id, bidId } = await context.params;

    const offer = await loadOwnOffer(id, bidId, user.id);
    if (offer instanceof NextResponse) return offer;

    if (offer.withdrawnAt) return ok({ withdrawn: true, alreadyWithdrawn: true });
    const closed = openForEdits(user.role, offer.vehicle);
    if (closed) return closed;

    await prisma.$transaction(async (tx) => {
      await tx.bid.update({ where: { id: bidId }, data: { withdrawnAt: new Date() } });

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "BID_WITHDRAWN",
        field: "offer",
        oldValue: `${offer.customerName ?? "—"} — ${taka(offer.amount)}`,
        note: offer.note,
      });
    });

    return ok({ withdrawn: true });
  },
);
