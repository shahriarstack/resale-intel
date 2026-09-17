import { prisma } from "@/lib/prisma";
import { readCycle, type CycleState } from "@/lib/resale";
import { liveOffers, type OfferRow } from "@/lib/bids";
import { OFFER_SELECT, shapeOffer } from "@/lib/offerQuery";
import { computeBreakdown } from "@/lib/costing";
import { heroShot } from "@/lib/photos";

/**
 * The Sr. Executive's resale desk.
 *
 * Two lists off one query, split by a clock rather than by a column: a live
 * vehicle inside its pricing month is ON THE MARKET, one past it is HELD. The
 * split is derived, so nothing has to run at midnight to move a row from one
 * list to the other.
 *
 * Offers come back whole because this desk is where a winner is chosen — a
 * count would not be enough, and a second round trip per vehicle to fetch the
 * book would make opening a row feel slow. Each offer carries the customer it
 * is for, the officer who introduced them, their territory and their level:
 * choosing between two similar figures is a judgement about who is behind
 * them, and that judgement cannot be made from an amount alone.
 */

export interface ResaleVehicle {
  id: string;
  registrationNo: string;
  name: string;
  make: string | null;
  year: number | null;
  mileage: string | null;
  territory: string | null;
  grade: string | null;
  imageUrl: string | null;
  /** Sold in the condition it was recovered in — no repair money in the cost. */
  asIs: boolean;

  askingPrice: number | null;
  totalCost: number;
  sopCost: number;
  dealerCommission: number;
  /** Asking price less total cost. Null when never priced. */
  margin: number | null;

  cycleEndsAt: string | null;
  onHold: boolean;
  /** Whole days left in the pricing month; negative once held. */
  daysLeft: number | null;
  /** Days since the vehicle reached the marketplace. */
  daysListed: number;

  /** Every offer ever submitted, newest first — withdrawn ones included. */
  bids: OfferRow[];
  /** Still on the table, best price first. */
  offers: OfferRow[];
  topOffer: number | null;
}

export interface ResaleDeskData {
  onMarket: ResaleVehicle[];
  held: ResaleVehicle[];
  /** The end date shared by every live vehicle, when they agree on one. */
  commonCycleEnd: string | null;
  generatedAt: string;
}

const DAY = 86_400_000;

export async function getResaleDesk(): Promise<ResaleDeskData> {
  const now = new Date();

  const vehicles = await prisma.vehicle.findMany({
    where: { status: "LIVE_FOR_RESALE" },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      registrationNo: true,
      make: true,
      model: true,
      year: true,
      mileage: true,
      grade: true,
      updatedAt: true,
      resaleCycleEndsAt: true,
      asIs: true,
      territory: { select: { name: true } },
      photos: { select: { slot: true, url: true } },
      costing: {
        select: {
          repairCost: true,
          transportCost: true,
          otherCost: true,
          sopCost: true,
          dealerCommission: true,
          approvedPrice: true,
        },
      },
      regLines: { select: { amount: true } },
      bids: { orderBy: { createdAt: "desc" }, select: OFFER_SELECT },
    },
    take: 500,
  });

  const shaped: ResaleVehicle[] = vehicles.map((v) => {
    const cost = computeBreakdown(v.costing, v.regLines, v.asIs);
    const cycle: CycleState = readCycle(v.resaleCycleEndsAt, now);

    // The Sr. Executive is management here, so the book is open — `isMine` is
    // false throughout because they never submit offers themselves.
    // The Sr. Executive is management here, so the book is open. An empty
    // viewer id keeps `isMine` false throughout — they never offer themselves.
    const bids: OfferRow[] = v.bids.map((b) => shapeOffer(b, ""));

    const offers = liveOffers(bids);

    const hero = heroShot(v.photos, v.asIs);

    return {
      id: v.id,
      registrationNo: v.registrationNo,
      name: v.model?.trim() || v.make?.trim() || "Vehicle",
      make: v.make,
      year: v.year,
      mileage: v.mileage,
      territory: v.territory?.name ?? null,
      grade: v.grade,
      imageUrl: hero,
      asIs: v.asIs,
      askingPrice: cost.approvedPrice,
      totalCost: cost.total,
      sopCost: cost.sop,
      dealerCommission: cost.dealerCommission,
      margin: cost.margin,
      cycleEndsAt: v.resaleCycleEndsAt?.toISOString() ?? null,
      onHold: cycle.onHold,
      daysLeft: cycle.daysLeft,
      // updatedAt is the last time anything moved on the row, which for a
      // listed vehicle is when it went live or was last re-priced. Good enough
      // for "how long has this been sitting", and free.
      daysListed: Math.max(0, Math.floor((now.getTime() - v.updatedAt.getTime()) / DAY)),
      bids,
      offers,
      topOffer: offers[0]?.amount ?? null,
    };
  });

  const onMarket = shaped.filter((v) => !v.onHold);
  const held = shaped.filter((v) => v.onHold);

  // When every live vehicle shares one end date — the normal state, since the
  // bulk control sets them together — that date is the desk's hold date.
  const ends = new Set(shaped.map((v) => v.cycleEndsAt ?? "none"));
  const commonCycleEnd =
    ends.size === 1 && !ends.has("none") ? [...ends][0] : null;

  return {
    onMarket,
    held,
    commonCycleEnd,
    generatedAt: now.toISOString(),
  };
}
