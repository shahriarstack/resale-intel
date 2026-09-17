import { ok, fail, withGuard, assertMoved } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { awardSchema } from "@/lib/validation";
import { canAwardSale } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { taka } from "@/lib/format";

/**
 * Close the sale: award the vehicle to one of the standing offers.
 *
 * Moves LIVE_FOR_RESALE → SOLD, stamps the winning bid and the sale date, and
 * writes the audit row. Terminal — the vehicle drops off the marketplace.
 */
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    // The Sr. Executive owns the resale book and closes the sale. canAwardSale
    // below is still the authority on whether this particular vehicle may be.
    const user = await requireRole("SR_EXECUTIVE");
    const { id } = await context.params;
    const { bidId, note, dealerCommission } = awardSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        costing: { select: { dealerCommission: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    if (!canAwardSale(user.role, vehicle.status)) {
      return fail(
        vehicle.status === "SOLD"
          ? "This vehicle has already been sold"
          : "This vehicle is not open for sale",
        409,
      );
    }

    // The winning offer must belong to this vehicle, and must still be on the
    // table — a withdrawn offer is on record but is no longer a thing the
    // customer behind it has agreed to.
    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        amount: true,
        vehicleId: true,
        customerName: true,
        withdrawnAt: true,
        bidder: { select: { name: true, staffId: true } },
      },
    });
    if (!bid || bid.vehicleId !== id) return fail("That offer is not on this vehicle", 400);
    if (bid.withdrawnAt) return fail("That offer has been withdrawn", 409);

    // The commission as finally agreed. Applied in the same transaction as the
    // sale, so the margin this vehicle is reported at is the one it closed at:
    // writing it afterwards would leave a window where the book shows a
    // realised figure computed from a commission nobody agreed to.
    const previousCommission = vehicle.costing?.dealerCommission ?? 0;
    const commissionMoved =
      dealerCommission !== undefined && dealerCommission !== previousCommission;

    // Guarded on LIVE_FOR_RESALE, the status the sale was authorised against.
    // Two officers awarding the same vehicle to two different customers would
    // otherwise both pass canAwardSale and both commit, leaving the file with
    // one winning bid and two SALE_AWARDED events naming different buyers.
    // Here the second one matches no row and is told the vehicle is gone.
    await prisma.$transaction(async (tx) => {
      const sold = await tx.vehicle.updateMany({
        where: { id, status: "LIVE_FOR_RESALE" },
        data: { status: "SOLD", soldAt: new Date(), winningBidId: bid.id },
      });
      assertMoved(sold.count, "This vehicle has already been sold");

      if (commissionMoved) {
        // Upsert rather than update: a vehicle can in principle reach a sale
        // without a costing row, and the sale must not fail on its absence.
        await tx.costing.upsert({
          where: { vehicleId: id },
          update: { dealerCommission },
          create: { vehicleId: id, dealerCommission },
        });

        await recordEvent(tx, {
          vehicleId: id,
          actorId: user.id,
          type: "SOP_UPDATED",
          field: "dealerCommission",
          oldValue: taka(previousCommission),
          newValue: taka(dealerCommission!),
          note: `Dealer commission settled at the close: ${taka(previousCommission)} → ${taka(dealerCommission!)}`,
        });
      }

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "SALE_AWARDED",
        fromStatus: "LIVE_FOR_RESALE",
        toStatus: "SOLD",
        field: "winningBid",
        newValue: taka(bid.amount),
        note:
          note ||
          `Sold to ${bid.customerName ?? "customer"} at ${taka(bid.amount)} — introduced by ${bid.bidder.name} (${bid.bidder.staffId})`,
      });
    });

    return ok({
      sold: true,
      amount: bid.amount,
      dealerCommission: commissionMoved ? dealerCommission : previousCommission,
      customerName: bid.customerName,
      winner: { name: bid.bidder.name, staffId: bid.bidder.staffId },
    });
  },
);
