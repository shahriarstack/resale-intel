/**
 * The monthly resale cycle.
 *
 * SOP is priced for a month. When that month ends, everything still unsold
 * comes off the market until the Sr. Executive re-prices it — carrying a
 * vehicle another month costs money, and last month's asking price no longer
 * reflects what it cost to hold.
 *
 * The hold is DERIVED, not written.
 *
 * A vehicle is on hold when its `resaleCycleEndsAt` is in the past. Nothing
 * runs at midnight on the 1st; the comparison simply starts returning true.
 * That means there is no scheduled job to fail, no half-processed table if it
 * dies at row 400, and no drift between "what the batch did" and "what the
 * rule says". It also means a manager extending a deadline sees the effect
 * immediately rather than at the next run.
 */

export interface CycleState {
  /** When the current pricing month runs out. Null on vehicles never listed. */
  endsAt: Date | null;
  /** True when that instant has passed and the vehicle is off the market. */
  onHold: boolean;
  /** Whole days until the hold bites; negative once it has. Null when unset. */
  daysLeft: number | null;
  /** True inside the last three days — worth re-pricing before it stops. */
  closing: boolean;
}

const DAY = 86_400_000;

/** The default end of a pricing cycle: midnight opening the 1st of next month. */
export function defaultCycleEnd(from: Date = new Date()): Date {
  return new Date(from.getFullYear(), from.getMonth() + 1, 1, 0, 0, 0, 0);
}

/**
 * Read a vehicle's cycle.
 *
 * A live vehicle with no `resaleCycleEndsAt` is treated as NOT held. Those are
 * records listed before this feature existed, and silently pulling the whole
 * existing marketplace off sale on deploy would be a migration disguised as a
 * rule. They hold from the first time the Sr. Executive re-prices them.
 */
export function readCycle(endsAt: Date | string | null | undefined, now = new Date()): CycleState {
  if (!endsAt) {
    return { endsAt: null, onHold: false, daysLeft: null, closing: false };
  }
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const ms = end.getTime() - now.getTime();
  const daysLeft = Math.floor(ms / DAY);
  return {
    endsAt: end,
    onHold: ms <= 0,
    daysLeft,
    closing: ms > 0 && daysLeft <= 3,
  };
}

/**
 * Is this vehicle biddable right now?
 *
 * Status alone is not enough once cycles exist: a LIVE_FOR_RESALE vehicle
 * whose month has run out is listed but closed, and the bid endpoint has to
 * say so rather than quietly accepting an offer against a stale price.
 */
export function isBiddable(
  status: string,
  endsAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  return status === "LIVE_FOR_RESALE" && !readCycle(endsAt, now).onHold;
}

/** How the cycle reads on screen. */
export function cycleLabel(c: CycleState): string {
  if (!c.endsAt) return "No pricing month set";
  if (c.onHold) {
    const over = Math.abs(c.daysLeft ?? 0);
    return over === 0 ? "Held — pricing month ended today" : `Held for ${over}d — needs re-pricing`;
  }
  if (c.daysLeft === 0) return "Pricing month ends today";
  return `${c.daysLeft}d left in this pricing month`;
}

/**
 * The furthest a cycle may be pushed out.
 *
 * An extension is meant to buy days at the end of a month, not to opt a
 * vehicle out of re-pricing altogether. Two months is generous and still
 * bounded; without a ceiling "extend" becomes "never revise".
 */
export const MAX_EXTENSION_DAYS = 62;

/**
 * Has this vehicle only just appeared on the marketplace?
 *
 * A week, and the clock read lives here rather than in the page for the same
 * reason readCycle's does: a component that reads the wall clock while it
 * renders has no stable answer, and every other derived-from-time fact in this
 * app is already resolved in a plain function like this one.
 */
export function isFreshListing(
  listedAt: Date | string | null | undefined,
  now = new Date(),
): boolean {
  if (!listedAt) return false;
  const at = typeof listedAt === "string" ? new Date(listedAt) : listedAt;
  return now.getTime() - at.getTime() < 7 * DAY;
}
