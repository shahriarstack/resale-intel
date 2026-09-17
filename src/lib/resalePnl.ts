import { prisma } from "@/lib/prisma";
import { computeBreakdown } from "@/lib/costing";

/**
 * The realised resale book — what the sold units actually earned.
 *
 * Every other analytic surface in this product counts work in progress. This
 * one counts money that has finished moving, which makes it the only place the
 * business can ask "are we gaining or losing" and get an answer that is not a
 * forecast.
 *
 * Four definitions decide everything downstream, and getting any of them
 * loosely wrong would produce a report that looks authoritative and is not:
 *
 *  - **A sale is dated by `soldAt`, never by capture or approval.** A vehicle
 *    recovered in January and sold in April is April's revenue. Anything else
 *    and a month's figures keep moving after the month has closed.
 *
 *  - **Revenue is the WINNING BID, not the approved price.** The approved price
 *    is what management asked for; the bid is what a buyer paid. Reporting the
 *    former as revenue would book profit the business never received. Both are
 *    kept — the gap between them is `realisation`, and it is the single most
 *    useful number here for judging whether pricing is set well.
 *
 *  - **Cost is `computeBreakdown`, unchanged.** Not a second definition of
 *    cost computed locally. The vehicle detail screen shows a margin for one
 *    unit; if this report summed a different basis, the two would disagree on
 *    the same vehicle and neither would be believable. That helper already
 *    handles the as-is rule (repair that was never spent is not a cost).
 *
 *  - **A vehicle with no winning bid on record is EXCLUDED, not zeroed.**
 *    Treating an unknown sale price as zero would report the whole cost basis
 *    as a loss. Those rows are counted separately as `unpriced` so the reader
 *    can see the report is not covering the whole book.
 *
 * Months are bucketed in local time, deliberately. The people reading this
 * close their books on a Bangladesh calendar month, and a UTC bucket would put
 * a sale made on the 1st into the previous month for anyone east of Greenwich.
 */

/** How a sale is credited to a territory. */
export type Dimension = "territory" | "officer" | "model";

export interface SoldUnit {
  id: string;
  registrationNo: string;
  customerName: string;
  model: string;
  /** ISO month key, local time: "2026-08". */
  month: string;
  soldAt: string;
  territory: string;
  /** The sales officer credited with the sale — not necessarily who typed it. */
  officer: string;
  asIs: boolean;
  /** What management approved as the asking price. Null if never priced. */
  approvedPrice: number | null;
  /** What the buyer actually paid. */
  soldPrice: number;
  // The cost basis, as the five lines the business names it in:
  //   margin = sold price − (SOP + registration + service + other + commission)
  // Split rather than summed because "our margin fell" and "our margin fell
  // because SOP doubled" are different findings, and only the second is
  // actionable.
  sop: number;
  registration: number;
  /** The workshop bill. Zero on an as-is unit — that money was never spent. */
  service: number;
  /** Transport and sundries. */
  other: number;
  commission: number;
  /** The five above, summed. */
  totalCost: number;
  /** soldPrice − totalCost. Negative is a loss. */
  margin: number;
  /** margin as a share of the sold price. */
  marginPct: number;
  /** soldPrice − approvedPrice: sold above (+) or below (−) the asking price. */
  realisation: number | null;
  /** Capture → sale, in days. How long the money was tied up. */
  daysHeld: number | null;
}

export interface Bucket {
  key: string;
  label: string;
  units: number;
  soldValue: number;
  approvedValue: number;
  cost: number;
  sop: number;
  registration: number;
  service: number;
  other: number;
  commission: number;
  margin: number;
  /** Sold value over total cost — how many taka came back per taka spent. */
  multiple: number | null;
  /** Margin over sold value. Null when nothing sold. */
  marginPct: number | null;
  /** Mean sold price per unit. */
  avgPrice: number | null;
  /** Mean margin per unit — the figure that survives a change in volume. */
  avgMargin: number | null;
  realisation: number | null;
  avgDaysHeld: number | null;
  /** Units that lost money. */
  lossUnits: number;
  /**
   * How much those units lost, as a positive number.
   *
   * Kept apart from `margin`, which nets losses off against profits. Both are
   * true and they answer different questions: `margin` is what the book made,
   * `lossValue` is what leaked out of it. A book can show a healthy margin
   * while several trucks went out below cost, and netting them away is exactly
   * how those files stay unexamined.
   */
  lossValue: number;
}

export interface ResalePnl {
  units: SoldUnit[];
  /** Sold vehicles with no winning bid recorded — outside every total above. */
  unpriced: number;
  /** Every month that has a sale, oldest first. */
  months: string[];
  territories: string[];
}

const MONTH_LABEL = new Intl.DateTimeFormat("en-GB", { month: "short", year: "numeric" });

/** Local-time month key. `toISOString()` would shift this by the UTC offset. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return MONTH_LABEL.format(new Date(y, m - 1, 1));
}

export async function getResalePnl(): Promise<ResalePnl> {
  const vehicles = await prisma.vehicle.findMany({
    where: { status: "SOLD", soldAt: { not: null } },
    select: {
      id: true,
      registrationNo: true,
      customerName: true,
      make: true,
      model: true,
      soldAt: true,
      captureDate: true,
      winningBidId: true,
      asIs: true,
      territory: { select: { name: true } },
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
    },
    orderBy: { soldAt: "desc" },
  });

  // The winning bids, fetched in one query rather than per vehicle. `winningBidId`
  // is a plain column (a relation would cycle with Bid.vehicleId), so the join
  // has to happen here.
  const bidIds = vehicles.map((v) => v.winningBidId).filter((x): x is string => !!x);
  const bids = bidIds.length
    ? await prisma.bid.findMany({
        where: { id: { in: bidIds } },
        select: {
          id: true,
          amount: true,
          salesOfficer: { select: { name: true } },
          bidder: { select: { name: true } },
        },
      })
    : [];
  const bidById = new Map(bids.map((b) => [b.id, b]));

  const units: SoldUnit[] = [];
  let unpriced = 0;

  for (const v of vehicles) {
    const bid = v.winningBidId ? bidById.get(v.winningBidId) : undefined;
    if (!bid) {
      // No recorded sale price. Excluded rather than counted at zero — see the
      // header note; a zero here would book the entire cost basis as a loss.
      unpriced++;
      continue;
    }

    const cost = computeBreakdown(v.costing, v.regLines, v.asIs);
    const soldPrice = bid.amount;
    const margin = soldPrice - cost.total;
    const soldAt = v.soldAt!;

    units.push({
      id: v.id,
      registrationNo: v.registrationNo,
      customerName: v.customerName,
      model: [v.make, v.model].filter(Boolean).join(" ") || "—",
      month: monthKey(soldAt),
      soldAt: soldAt.toISOString(),
      territory: v.territory?.name ?? "Unassigned",
      // Credited officer first: the sales team shares one marketplace, so the
      // account that typed an offer is often not whose customer it is.
      officer: bid.salesOfficer?.name ?? bid.bidder?.name ?? "—",
      asIs: v.asIs,
      approvedPrice: cost.approvedPrice,
      soldPrice,
      sop: cost.sop,
      registration: cost.registration,
      service: cost.repair,
      other: cost.transport + cost.other,
      commission: cost.dealerCommission,
      totalCost: cost.total,
      margin,
      marginPct: soldPrice === 0 ? 0 : (margin / soldPrice) * 100,
      realisation: cost.approvedPrice === null ? null : soldPrice - cost.approvedPrice,
      daysHeld: Math.max(
        0,
        Math.round((soldAt.getTime() - v.captureDate.getTime()) / 86_400_000),
      ),
    });
  }

  return {
    units,
    unpriced,
    months: [...new Set(units.map((u) => u.month))].sort(),
    territories: [...new Set(units.map((u) => u.territory))].sort(),
  };
}

// ---------------------------------------------------------------------------
// Aggregation — pure, so the client can re-run it on every filter change
// without a round trip.
// ---------------------------------------------------------------------------

/**
 * Roll a set of units into one bucket.
 *
 * Averages are computed over the units present, never over a fixed
 * denominator: a month with three sales has an average margin of three, not of
 * three-out-of-however-many-we-hoped-for. `null` where there is nothing to
 * average, so the UI can print an em dash instead of a misleading zero.
 */
export function rollUp(key: string, label: string, units: SoldUnit[]): Bucket {
  const n = units.length;
  const sum = (f: (u: SoldUnit) => number) => units.reduce((a, u) => a + f(u), 0);

  const soldValue = sum((u) => u.soldPrice);
  const cost = sum((u) => u.totalCost);
  const margin = sum((u) => u.margin);
  const withApproved = units.filter((u) => u.realisation !== null);
  const withDays = units.filter((u) => u.daysHeld !== null);

  return {
    key,
    label,
    units: n,
    soldValue,
    approvedValue: sum((u) => u.approvedPrice ?? 0),
    cost,
    sop: sum((u) => u.sop),
    registration: sum((u) => u.registration),
    service: sum((u) => u.service),
    other: sum((u) => u.other),
    commission: sum((u) => u.commission),
    margin,
    multiple: cost === 0 ? null : soldValue / cost,
    // Weighted by value, not a mean of per-unit percentages. Averaging
    // percentages would let a cheap unit with a freak margin outweigh an
    // expensive one, which is how a book that lost money reports a healthy rate.
    marginPct: soldValue === 0 ? null : (margin / soldValue) * 100,
    avgPrice: n === 0 ? null : soldValue / n,
    avgMargin: n === 0 ? null : margin / n,
    realisation: withApproved.length === 0 ? null : withApproved.reduce((a, u) => a + u.realisation!, 0),
    avgDaysHeld:
      withDays.length === 0 ? null : withDays.reduce((a, u) => a + u.daysHeld!, 0) / withDays.length,
    lossUnits: units.filter((u) => u.margin < 0).length,
    // Positive: a loss of 40,000 is reported as 40,000, never as -40,000. The
    // tile already says the word "Loss"; a minus sign on top of it reads as a
    // double negative.
    lossValue: units.reduce((a, u) => a + (u.margin < 0 ? -u.margin : 0), 0),
  };
}

/** Group units by month, with empty months filled in so a gap reads as a gap. */
export function byMonth(units: SoldUnit[], months: string[]): Bucket[] {
  const map = new Map<string, SoldUnit[]>();
  for (const u of units) {
    const list = map.get(u.month);
    if (list) list.push(u);
    else map.set(u.month, [u]);
  }
  // A month with no sales is a real and important observation — dropping it
  // would let a trend line hop over a dead month as though it never happened.
  return months.map((m) => rollUp(m, monthLabel(m), map.get(m) ?? []));
}

/** Every month between the first and last sale, so the series has no holes. */
export function monthSpan(months: string[]): string[] {
  if (months.length === 0) return [];
  const [fy, fm] = months[0].split("-").map(Number);
  const [ly, lm] = months[months.length - 1].split("-").map(Number);
  const out: string[] = [];
  for (let y = fy, m = fm; y < ly || (y === ly && m <= lm); ) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

const DIMENSION_OF: Record<Dimension, (u: SoldUnit) => string> = {
  territory: (u) => u.territory,
  officer: (u) => u.officer,
  model: (u) => u.model,
};

/** Group units by a chosen dimension, biggest book first. */
export function byDimension(units: SoldUnit[], dim: Dimension): Bucket[] {
  const pick = DIMENSION_OF[dim];
  const map = new Map<string, SoldUnit[]>();
  for (const u of units) {
    const k = pick(u);
    const list = map.get(k);
    if (list) list.push(u);
    else map.set(k, [u]);
  }
  return [...map.entries()]
    .map(([k, list]) => rollUp(k, k, list))
    .sort((a, b) => b.soldValue - a.soldValue);
}

/** One territory's month-by-month series, for the trend lines. */
export interface TerritorySeries {
  territory: string;
  /** One bucket per month in the window, empty months included. */
  points: Bucket[];
  /** Totals across the window — used to rank and to label the line. */
  total: Bucket;
}

/**
 * Every territory as its own monthly series, over the same month axis.
 *
 * The shared axis is the point: the series are only comparable if they all run
 * across the identical set of months, empty ones included. Building each
 * territory's months from just the months IT sold in would give six lines of
 * different lengths that appear to move together while measuring different
 * periods.
 *
 * Ordered by total sales, so the legend and the drawing order put the biggest
 * book first and a reader scanning the legend meets the territories in the
 * order they matter.
 */
export function byTerritoryMonth(units: SoldUnit[], months: string[]): TerritorySeries[] {
  const byTerritory = new Map<string, SoldUnit[]>();
  for (const u of units) {
    const list = byTerritory.get(u.territory);
    if (list) list.push(u);
    else byTerritory.set(u.territory, [u]);
  }

  return [...byTerritory.entries()]
    .map(([territory, list]) => ({
      territory,
      points: byMonth(list, months),
      total: rollUp(territory, territory, list),
    }))
    .sort((a, b) => b.total.soldValue - a.total.soldValue);
}
