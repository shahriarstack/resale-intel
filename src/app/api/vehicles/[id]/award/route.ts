import { ok, fail, withGuard } from "@/lib/api";
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
    const user = await requireRole("GM_SR_GM");
    const { id } = await context.params;
    const { bidId, note } = awardSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, status: true },
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

    // The winning bid must belong to this vehicle.
    const bid = await prisma.bid.findUnique({
      where: { id: bidId },
      select: {
        id: true,
        amount: true,
        vehicleId: true,
        bidder: { select: { name: true, staffId: true } },
      },
    });
    if (!bid || bid.vehicleId !== id) return fail("That bid is not on this vehicle", 400);

    await prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id },
        data: { status: "SOLD", soldAt: new Date(), winningBidId: bid.id },
      });

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "SALE_AWARDED",
        fromStatus: "LIVE_FOR_RESALE",
        toStatus: "SOLD",
        field: "winningBid",
        newValue: taka(bid.amount),
        note: note || `Awarded to ${bid.bidder.name} (${bid.bidder.staffId}) at ${taka(bid.amount)}`,
      });
    });

    return ok({
      sold: true,
      amount: bid.amount,
      winner: { name: bid.bidder.name, staffId: bid.bidder.staffId },
    });
  },
);
