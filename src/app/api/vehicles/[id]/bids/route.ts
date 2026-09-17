import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { bidSchema } from "@/lib/validation";
import { canPlaceBid, canViewAllBids } from "@/lib/rbac";
import { readCycle } from "@/lib/resale";
import { recordEvent } from "@/lib/audit";
import { taka } from "@/lib/format";
import { OFFER_SELECT, shapeOffer } from "@/lib/offerQuery";

/**
 * Submit a customer's offer on a live vehicle.
 *
 * An officer may submit as many as they have buyers — each row is a different
 * customer, not a raised bid — so nothing here dedupes or supersedes. The
 * asking price is a guide, not a floor: a low offer is stored and flagged,
 * never rejected, because the desk choosing a buyer is entitled to weigh it.
 */
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;
    const { salesOfficerId, customerName, amount, note } = bidSchema.parse(
      await request.json(),
    );

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        resaleCycleEndsAt: true,
        costing: { select: { approvedPrice: true } },
      },
    });
    if (!vehicle) return fail("Vehicle not found", 404);

    // A vehicle whose pricing month has run out is still listed but closed:
    // taking an offer against a stale cost basis is what the hold prevents.
    const cycle = readCycle(vehicle.resaleCycleEndsAt);
    if (!canPlaceBid(user.role, vehicle.status, cycle.onHold)) {
      if (vehicle.status === "LIVE_FOR_RESALE" && cycle.onHold) {
        return fail(
          "This vehicle is on hold while its price is revised for the new month",
          409,
        );
      }
      return fail(
        vehicle.status === "LIVE_FOR_RESALE"
          ? "Your role cannot submit customer offers"
          : "This vehicle is not open for offers",
        403,
      );
    }

    // Crediting the offer to someone else is a sales-desk move, so the target
    // has to actually be an active sales officer. Without this check the
    // field is a free-text way to attribute a customer to any account in the
    // system, which is exactly the sort of thing an offer book must not allow.
    let creditedTo: string | null = null;
    if (salesOfficerId && salesOfficerId !== user.id) {
      const officer = await prisma.user.findUnique({
        where: { id: salesOfficerId },
        select: { id: true, role: true, isActive: true },
      });
      if (!officer || !officer.isActive || officer.role !== "SALES_TEAM") {
        return fail("Choose an active sales officer for this offer", 422);
      }
      creditedTo = officer.id;
    }

    const approved = vehicle.costing?.approvedPrice ?? null;
    const belowApproved = approved !== null && amount < approved;

    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.bid.create({
        data: {
          vehicleId: id,
          bidderId: user.id,
          salesOfficerId: creditedTo,
          customerName,
          amount,
          note: note || null,
        },
        select: OFFER_SELECT,
      });

      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "BID_PLACED",
        field: "offer",
        newValue: `${customerName} — ${taka(amount)}`,
        note: note || null,
      });

      return row;
    });

    return ok({
      offer: shapeOffer(created, user.id),
      belowApproved,
      approvedPrice: approved,
    });
  },
);

/**
 * The offer book. Sealed sideways: an officer receives only the offers they
 * submitted. The desks that choose a buyer receive every offer, each carrying
 * the customer, the officer, their territory and their level.
 */
export const GET = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireUser();
    const { id } = await context.params;

    const seesAll = canViewAllBids(user.role);

    const rows = await prisma.bid.findMany({
      where: { vehicleId: id, ...(seesAll ? {} : { bidderId: user.id }) },
      orderBy: { createdAt: "desc" },
      select: OFFER_SELECT,
    });

    return ok({
      sealed: !seesAll,
      offers: rows.map((r) => shapeOffer(r, user.id)),
    });
  },
);
