"use client";

import { Building2, MapPin, PenLine, UserRound } from "lucide-react";
import { taka, timeAgo } from "@/lib/format";
import { liveOffers, offerFor, type OfferRow } from "@/lib/bids";

/**
 * The offer book, as the desks that choose a buyer read it.
 *
 * Four facts per row, and management named all four: WHO the customer is, WHO
 * brought them in, out of WHICH territory, at WHAT level. A price on its own
 * is not a decision — an offer 3% under asking from a sales officer in the
 * territory the vehicle is parked in is a different proposition from the same
 * figure introduced by an engineer two districts away, and the desk cannot
 * tell those apart from an amount.
 *
 * The officer-facing surfaces never render this component. They receive their
 * own offers and nothing else.
 */

/** The identity line: customer, then the officer who introduced them. */
export function OfferIdentity({ o, compact }: { o: OfferRow; compact?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="flex min-w-0 items-center gap-1.5">
        <Building2 size={12} className="shrink-0 text-ink-3" />
        <span
          className={`truncate font-semibold text-ink ${compact ? "text-[12px]" : "text-[13px]"}`}
        >
          {offerFor(o)}
        </span>
      </div>
      <div className="sf-who mt-1">
        <span className="flex items-center gap-1">
          <UserRound size={9.5} />
          {o.officerName}
        </span>
        <span className="sf-level" data-level={o.officerLevel}>
          {o.officerLevel}
        </span>
        {o.officerTerritory && (
          <span className="flex items-center gap-1">
            <MapPin size={9.5} />
            {o.officerTerritory}
          </span>
        )}
        <span className="opacity-70">· {o.officerStaffId}</span>
      </div>
      {/* Only shown when the two differ. The shared sales desk means somebody
          often types an offer for a colleague, and the book has to be able to
          say so — silently crediting one and recording the other is how a
          commission argument starts. */}
      {o.enteredByOther && o.enteredByName && (
        <div className="sf-who mt-0.5 opacity-75">
          <PenLine size={9} />
          entered by {o.enteredByName}
        </div>
      )}
    </div>
  );
}

/** The money column: the offer, and how far it sits from the asking price. */
export function OfferAmount({ o, asking }: { o: OfferRow; asking: number | null }) {
  const gap = asking === null ? null : o.amount - asking;
  return (
    <div className="shrink-0 text-right">
      <div className="font-mono text-[13.5px] font-bold tabular-nums text-ink">
        {taka(o.amount)}
      </div>
      {gap !== null && gap !== 0 && (
        <div
          className="font-mono text-[9.5px]"
          style={{ color: gap > 0 ? "var(--ok)" : "var(--warn)" }}
        >
          {gap > 0 ? "+" : "−"}
          {taka(Math.abs(gap))}
        </div>
      )}
      {gap === 0 && <div className="font-mono text-[9.5px] text-ink-3">at asking</div>}
    </div>
  );
}

export function OfferBook({
  offers,
  asking,
  /** When set, rows become selectable — the Sr. Executive picking a buyer. */
  selectedId,
  onSelect,
  emptyLabel = "No customer offers on this vehicle yet.",
}: {
  offers: OfferRow[];
  asking: number | null;
  selectedId?: string | null;
  onSelect?: (o: OfferRow) => void;
  emptyLabel?: string;
}) {
  const live = liveOffers(offers);

  if (live.length === 0) {
    return <p className="py-6 text-center text-[13px] text-ink-3">{emptyLabel}</p>;
  }

  return (
    <ul className="flex flex-col gap-1.5">
      {live.map((o, i) => {
        const inner = (
          <>
            <span
              className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[9.5px] font-bold"
              style={
                i === 0
                  ? { background: "var(--ok-soft)", color: "var(--ok-ink)" }
                  : { background: "var(--surface-3)", color: "var(--ink-3)" }
              }
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <OfferIdentity o={o} />
              {o.note && (
                <p className="mt-1.5 rounded-md bg-surface-2 px-2 py-1 text-[11px] italic text-ink-2">
                  {o.note}
                </p>
              )}
              <div className="mt-1 font-mono text-[9px] text-ink-3" suppressHydrationWarning>
                {o.revisedAt ? `revised ${timeAgo(o.revisedAt)}` : timeAgo(o.createdAt)}
              </div>
            </div>
            <OfferAmount o={o} asking={asking} />
          </>
        );

        return (
          <li key={o.id}>
            {onSelect ? (
              <button
                className="sf-offer"
                data-picked={selectedId === o.id}
                data-top={i === 0 && selectedId !== o.id}
                onClick={() => onSelect(o)}
                aria-pressed={selectedId === o.id}
              >
                {inner}
              </button>
            ) : (
              <div className="sf-offer" data-top={i === 0}>
                {inner}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
