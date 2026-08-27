"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Trophy, Loader2, AlertCircle, X, Crown } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { taka, timeAgo, shortDate } from "@/lib/format";
import { standingOffers, type BidRow } from "@/lib/bids";
import { useToast } from "@/components/ui/Toast";
import { BidModal } from "@/components/register/BidModal";

export function BidsPanel({
  vehicleId,
  title,
  make,
  registrationNo,
  bids,
  sealed,
  canBid,
  canAward,
  approvedPrice,
  sold,
  winningBidId,
}: {
  vehicleId: string;
  title: string;
  make: string | null;
  registrationNo: string;
  bids: BidRow[];
  /** True when the viewer only receives their own bids. */
  sealed: boolean;
  canBid: boolean;
  canAward: boolean;
  approvedPrice: number | null;
  sold: { at: string | null; amount: number | null; winner: string | null } | null;
  winningBidId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [awarding, setAwarding] = useState<BidRow | null>(null);
  const [showBid, setShowBid] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const offers = useMemo(() => standingOffers(bids), [bids]);
  const myOffer = offers.find((o) => o.isMine) ?? null;

  const award = async () => {
    if (!awarding) return;
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/award`, "POST", { bidId: awarding.id });
      toast(`Sold to ${awarding.bidderName} for ${taka(awarding.amount)}`);
      setAwarding(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not award the sale");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-4" style={{ animation: "fadeIn 0.2s ease 0.12s both" }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-ink">
          <span className="text-accent">
            <Gavel size={17} />
          </span>
          {sealed ? "Your bids" : "Bid book"}
        </h2>
        {!sealed && offers.length > 0 && (
          <span className="font-mono text-[11px] text-ink-3">
            {offers.length} bidder{offers.length === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {/* Sale outcome */}
      {sold && (
        <div
          className="mb-4 flex items-start gap-3 rounded-xl px-3.5 py-3"
          style={{ background: "var(--ok-soft)" }}
        >
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
            style={{ background: "var(--ok)", color: "#fff" }}
          >
            <Trophy size={17} />
          </span>
          <div>
            <div className="font-display text-base font-bold" style={{ color: "var(--ok)" }}>
              Sold for {taka(sold.amount)}
            </div>
            <div className="mt-0.5 font-mono text-[11px]" style={{ color: "var(--ok)" }}>
              {sold.winner ?? "—"} · {shortDate(sold.at)}
            </div>
          </div>
        </div>
      )}

      {offers.length === 0 ? (
        <p className="py-6 text-center text-sm text-ink-3">
          {sealed ? "You have not bid on this vehicle." : "No bids yet."}
        </p>
      ) : (
        <ol className="flex flex-col divide-y divide-rule">
          {offers.map((o, i) => {
            const won = winningBidId === o.id;
            const delta = approvedPrice === null ? null : o.amount - approvedPrice;
            return (
              <li
                key={o.id}
                className="flex items-start gap-3 py-3 first:pt-0 last:pb-0"
                style={{ animation: `fadeIn 0.2s ease ${Math.min(i, 8) * 0.03}s both` }}
              >
                {!sealed && (
                  <span
                    className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold"
                    style={
                      won
                        ? { background: "var(--ok)", color: "#fff" }
                        : i === 0
                          ? { background: "var(--accent-soft)", color: "var(--accent)" }
                          : { background: "var(--surface-3)", color: "var(--ink-3)" }
                    }
                  >
                    {won ? <Crown size={12} /> : i + 1}
                  </span>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-sm font-bold tnum text-ink">
                      {taka(o.amount)}
                    </span>
                    {delta !== null && (
                      <span
                        className="font-mono text-[10px]"
                        style={{ color: delta >= 0 ? "var(--ok)" : "var(--warn)" }}
                      >
                        {delta >= 0 ? "+" : "−"}
                        {taka(Math.abs(delta))} vs asking
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-ink-3">
                    {sealed ? "You" : `${o.bidderName} · ${o.bidderStaffId}`}
                    {" · "}
                    <span suppressHydrationWarning>{timeAgo(o.createdAt)}</span>
                    {o.isMine && !sealed && (
                      <span className="ml-1.5 font-semibold text-accent">you</span>
                    )}
                  </div>
                  {o.note && (
                    <p className="mt-1.5 rounded-md bg-surface-2 px-2 py-1.5 text-xs italic text-ink-2">
                      &ldquo;{o.note}&rdquo;
                    </p>
                  )}
                </div>

                {canAward && !sold && (
                  <button
                    className="btn btn-ghost btn-sm shrink-0"
                    onClick={() => {
                      setError("");
                      setAwarding(o);
                    }}
                  >
                    Award
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}

      {canBid && !sold && (
        <button
          className={`btn btn-block mt-4 ${myOffer ? "btn-ghost" : "btn-primary"}`}
          onClick={() => setShowBid(true)}
        >
          <Gavel size={15} /> {myOffer ? "Update your bid" : "Place a bid"}
        </button>
      )}

      {sealed && offers.length > 0 && (
        <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-3">
          Bids are sealed — you cannot see other officers&rsquo; offers, and they cannot see yours.
        </p>
      )}

      {showBid && (
        <BidModal
          vehicleId={vehicleId}
          title={title}
          make={make}
          registrationNo={registrationNo}
          approvedPrice={approvedPrice}
          currentBid={myOffer?.amount ?? null}
          onClose={() => setShowBid(false)}
        />
      )}

      {awarding && (
        <div className="backdrop backdrop-center" onClick={() => !busy && setAwarding(null)}>
          <div className="modal-panel max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="font-display text-xl font-bold text-ink">Award the sale</h3>
              <button
                className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                onClick={() => setAwarding(null)}
                disabled={busy}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-ink-2">
              This closes bidding and marks the vehicle sold. It is terminal — the vehicle leaves
              the marketplace.
            </p>

            <div className="mt-4 rounded-xl border border-rule bg-surface-2 p-4">
              <div className="label mb-1">Winning bid</div>
              <div className="font-display text-2xl font-bold tnum text-ink">
                {taka(awarding.amount)}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-3">
                {awarding.bidderName} · {awarding.bidderStaffId}
              </div>
              {approvedPrice !== null && (
                <div
                  className="mt-2 font-mono text-[11px]"
                  style={{
                    color: awarding.amount >= approvedPrice ? "var(--ok)" : "var(--warn)",
                  }}
                >
                  {awarding.amount >= approvedPrice ? "+" : "−"}
                  {taka(Math.abs(awarding.amount - approvedPrice))} vs the asking price
                </div>
              )}
            </div>

            {approvedPrice !== null && awarding.amount < approvedPrice && (
              <div
                className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs"
                style={{
                  borderColor: "var(--warn)",
                  background: "var(--warn-soft)",
                  color: "var(--warn)",
                }}
              >
                <AlertCircle size={14} className="mt-px shrink-0" />
                This offer is below the approved selling price.
              </div>
            )}

            {error && (
              <div className="mt-3 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-xs font-medium text-bad">
                {error}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-2.5">
              <button className="btn btn-ghost" onClick={() => setAwarding(null)} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn-ok" onClick={award} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : "Confirm sale"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
