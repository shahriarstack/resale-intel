"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Building2, Crown, Loader2, Plus, Trophy, Users, X } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { taka, timeAgo, shortDate } from "@/lib/format";
import { liveOffers, offerFor, offererCount, type OfferRow } from "@/lib/bids";
import { useToast } from "@/components/ui/Toast";
import { OfferBook, OfferIdentity } from "@/components/register/OfferBook";
import { OfferSheet } from "@/components/register/OfferSheet";

/**
 * The offer book on the vehicle's own file.
 *
 * Two readings of the same list. An officer sees only the customers they put
 * forward. The Sr. Executive sees every offer with the buyer, the officer who
 * introduced them, their territory and their level — and picks one to close
 * the sale against.
 */
export function BidsPanel({
  vehicleId,
  title,
  make,
  registrationNo,
  image,
  offers,
  sealed,
  canOffer,
  canAward,
  approvedPrice,
  sold,
  winningBidId,
}: {
  vehicleId: string;
  title: string;
  make: string | null;
  registrationNo: string;
  image: string | null;
  offers: OfferRow[];
  /** True when the viewer only receives the offers they submitted. */
  sealed: boolean;
  canOffer: boolean;
  canAward: boolean;
  approvedPrice: number | null;
  sold: { at: string | null; amount: number | null; customer: string | null; via: string | null } | null;
  winningBidId: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [awarding, setAwarding] = useState<OfferRow | null>(null);
  const [showSheet, setShowSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const live = useMemo(() => liveOffers(offers), [offers]);
  const mine = useMemo(() => live.filter((o) => o.isMine), [live]);
  const officers = useMemo(() => offererCount(offers), [offers]);
  const award = async () => {
    if (!awarding) return;
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/award`, "POST", { bidId: awarding.id });
      toast(`Sold to ${offerFor(awarding)} for ${taka(awarding.amount)}`, "ok");
      setAwarding(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not award the sale");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.12s both" }}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[15px] font-bold text-ink">
          <span className="text-accent">
            <Users size={17} />
          </span>
          {sealed ? "Your customer offers" : "Offer book"}
        </h2>
        {!sealed && live.length > 0 && (
          <span className="font-mono text-[10.5px] text-ink-3">
            {live.length} offer{live.length === 1 ? "" : "s"} · {officers} officer
            {officers === 1 ? "" : "s"}
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
          <div className="min-w-0">
            <div className="font-display text-base font-bold" style={{ color: "var(--ok)" }}>
              Sold for {taka(sold.amount)}
            </div>
            <div className="mt-0.5 font-mono text-[10.5px]" style={{ color: "var(--ok)" }}>
              {sold.customer ?? "—"}
              {sold.via && ` · introduced by ${sold.via}`}
              {" · "}
              {shortDate(sold.at)}
            </div>
          </div>
        </div>
      )}

      {sealed ? (
        // ---- The officer's own customers ---------------------------------
        mine.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-3">
            You have not put a customer forward on this vehicle.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {mine.map((o) => {
              const delta = approvedPrice === null ? null : o.amount - approvedPrice;
              const won = winningBidId === o.id;
              return (
                <li key={o.id} className="sf-offer" data-top={won}>
                  <span className="mt-0.5 shrink-0 text-ink-3">
                    {won ? <Crown size={13} className="text-ok" /> : <Building2 size={13} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold text-ink">
                      {offerFor(o)}
                    </div>
                    <div
                      className="mt-0.5 font-mono text-[9.5px] text-ink-3"
                      suppressHydrationWarning
                    >
                      {o.revisedAt ? `revised ${timeAgo(o.revisedAt)}` : timeAgo(o.createdAt)}
                    </div>
                    {o.note && <p className="mt-1 text-[11px] italic text-ink-2">{o.note}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="font-mono text-[13px] font-bold tabular-nums text-ink">
                      {taka(o.amount)}
                    </div>
                    {delta !== null && delta !== 0 && (
                      <div
                        className="font-mono text-[9px]"
                        style={{ color: delta > 0 ? "var(--ok)" : "var(--warn)" }}
                      >
                        {delta > 0 ? "+" : "−"}
                        {taka(Math.abs(delta))}
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )
      ) : (
        // ---- The whole book, for the desk that closes the sale ------------
        <OfferBook
          offers={offers}
          asking={approvedPrice}
          selectedId={canAward && !sold ? awarding?.id ?? null : undefined}
          onSelect={canAward && !sold ? (o) => setAwarding(awarding?.id === o.id ? null : o) : undefined}
          emptyLabel="No officer has put a customer forward yet."
        />
      )}

      {canOffer && !sold && (
        <button
          className={`btn btn-block mt-4 ${mine.length > 0 ? "btn-ghost" : "btn-primary"}`}
          onClick={() => setShowSheet(true)}
        >
          <Plus size={15} />
          {mine.length > 0 ? "Manage your offers" : "Submit customer offer"}
        </button>
      )}

      {sealed && mine.length > 0 && (
        <p className="mt-3 font-mono text-[9.5px] leading-relaxed text-ink-3">
          Other officers cannot see your customers, and you cannot see theirs.
        </p>
      )}

      {showSheet && (
        <OfferSheet
          target={{
            id: vehicleId,
            title,
            make,
            registrationNo,
            image,
            price: approvedPrice,
            myOffers: mine,
          }}
          // No roster on the vehicle file. This surface is reached by an
          // officer working their own file, so the offer is theirs — the
          // shared-desk question only arises on the marketplace.
          salesOfficers={[]}
          viewerId=""
          onClose={() => setShowSheet(false)}
        />
      )}

      {/* ---- Closing the sale --------------------------------------------- */}
      {awarding && (
        <div className="backdrop backdrop-center" onClick={() => !busy && setAwarding(null)}>
          <div className="modal-panel max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-start justify-between gap-3">
              <h3 className="font-display text-xl font-bold text-ink">Close the sale</h3>
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
              This sells the vehicle to this customer and takes it off the marketplace. It is
              terminal.
            </p>

            <div className="mt-4 rounded-xl border border-rule bg-surface-2 p-4">
              <div className="label mb-1">Winning offer</div>
              <div className="font-display text-2xl font-bold tnum text-ink">
                {taka(awarding.amount)}
              </div>
              <div className="mt-2">
                <OfferIdentity o={awarding} />
              </div>
              {approvedPrice !== null && (
                <div
                  className="mt-2 font-mono text-[10.5px]"
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
                  borderColor: "color-mix(in srgb, var(--warn) 34%, transparent)",
                  background: "var(--warn-soft)",
                  color: "var(--warn)",
                }}
              >
                <AlertCircle size={14} className="mt-px shrink-0" />
                This offer is below the approved selling price.
              </div>
            )}

            {error && (
              <div
                className="mt-3 rounded-lg border px-3 py-2.5 text-xs font-medium text-bad"
                style={{
                  borderColor: "color-mix(in srgb, var(--bad) 26%, transparent)",
                  background: "var(--bad-soft)",
                }}
                role="alert"
              >
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
