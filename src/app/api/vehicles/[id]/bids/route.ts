import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { bidSchema } from "@/lib/validation";
import { canPlaceBid, canViewAllBids } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { taka } from "@/lib/format";

/**
 * Place a sealed bid on a live vehicle.
 *
 * Every bid is kept — an officer's standing offer is simply their most recent
 * one, so a mistyped figure can be corrected by bidding again. The approved
 * price is a guide, not a floor: a low offer is stored and flagged, never
 * rejected, so management can still weigh it.
 */
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    const { amount, note } = bidSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        make: true,
        model: true,
        costing: { select: { approvedPrice: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    if (!canPlaceBid(user.role, vehicle.status)) {
      return fail(
        vehicle.status === "LIVE_FOR_RESALE"
          ? "Only sales officers can bid on a vehicle"
          : "This vehicle is not open for bidding",
        403,
      );
    }

    const approved = vehicle.costing?.approvedPrice ?? null;
    const belowApproved = approved !== null && amount < approved;

    const bid = await prisma.$transaction(async (tx) => {
      const created = await tx.bid.create({
        data: { vehicleId: id, bidderId: user.id, amount, note: note || null },
        select: { id: true, amount: true, note: true, createdAt: true },
      });

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "BID_PLACED",
        field: "bid",
        newValue: taka(amount),
        note: note || null,
      });

      return created;
    });

    return ok({
      bid: { ...bid, createdAt: bid.createdAt.toISOString() },
      belowApproved,
      approvedPrice: approved,
    });
  },
);

/**
 * The bid book. Sealed by default: a sales officer receives only their own
 * offers. Management receives every bid so a winner can be chosen.
 */
export const GET = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const seesAll = canViewAllBids(user.role);

    const bids = await prisma.bid.findMany({
      where: { vehicleId: id, ...(seesAll ? {} : { bidderId: user.id }) },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        amount: true,
        note: true,
        createdAt: true,
        bidderId: true,
        bidder: { select: { name: true, staffId: true } },
      },
    });

    return ok({
      sealed: !seesAll,
      bids: bids.map((b) => ({
        id: b.id,
        amount: b.amount,
        note: b.note,
        createdAt: b.createdAt.toISOString(),
        bidderId: b.bidderId,
        bidderName: b.bidder.name,
        bidderStaffId: b.bidder.staffId,
        isMine: b.bidderId === user.id,
      })),
    });
  },
);
