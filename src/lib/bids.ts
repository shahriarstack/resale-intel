// Reading the bid book.
//
// Every bid is kept, so a bidder may appear several times. Their *standing
// offer* is whichever bid they placed most recently — that is what a sale is
// judged on, and it lets an officer correct a mistyped figure by bidding again.

export interface BidRow {
  id: string;
  amount: number;
  note: string | null;
  createdAt: string;
  bidderId: string;
  bidderName: string;
  bidderStaffId: string;
  isMine: boolean;
}

/** One row per bidder — their latest bid — ranked highest offer first. */
export function standingOffers(bids: BidRow[]): BidRow[] {
  const latest = new Map<string, BidRow>();
  for (const b of bids) {
    const prev = latest.get(b.bidderId);
    if (!prev || Date.parse(b.createdAt) > Date.parse(prev.createdAt)) {
      latest.set(b.bidderId, b);
    }
  }
  return [...latest.values()].sort((a, b) => b.amount - a.amount);
}

/** The viewer's own standing offer, if they have one. */
export function myStandingOffer(bids: BidRow[]): BidRow | null {
  return standingOffers(bids).find((b) => b.isMine) ?? null;
}
