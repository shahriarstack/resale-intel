"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BedDouble,
  Calendar,
  Camera,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gauge,
  Heart,
  MapPin,
  PackageCheck,
  PauseCircle,
  Plus,
  Share2,
  ShieldCheck,
  Sparkles,
  Tag,
  Truck,
  Users,
  X,
} from "lucide-react";
import { taka, shortDate, timeAgo } from "@/lib/format";
import { marketplaceRegFact } from "@/lib/registrationValidity";
import { offerFor } from "@/lib/bids";
import { OfferBook } from "@/components/register/OfferBook";
import { useIsClient } from "@/lib/useIsClient";
import { useToast } from "@/components/ui/Toast";
import type { Listing } from "@/components/register/Storefront";
import { PROVENANCE_META } from "@/lib/photos";

/**
 * The product page, without leaving the shop.
 *
 * For the three field roles this IS the vehicle page — they never open
 * /vehicles/[id], because that surface is the file: desk chain, audit trail,
 * cost basis. Everything an officer legitimately needs in front of a customer
 * is here instead: every photograph, the specification, the price, and their
 * own offers.
 *
 * Management gets the same view plus two things a desk needs and an officer
 * must not have — the offer book, and a way through to the file itself.
 */

export function QuickView({
  v,
  canOffer,
  seesOfferBook,
  storefront,
  saved,
  onSave,
  onOffer,
  onClose,
  onStep,
}: {
  v: Listing;
  canOffer: boolean;
  seesOfferBook: boolean;
  storefront: boolean;
  saved: boolean;
  onSave: () => void;
  onOffer: () => void;
  onClose: () => void;
  /** Move to the previous / next listing without closing — a shopping gesture. */
  onStep: (delta: number) => void;
}) {
  const { toast } = useToast();
  const isClient = useIsClient();
  const [shot, setShot] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") onStep(1);
      if (e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, onStep]);

  if (!isClient) return null;

  const count = v.images.length;
  const regFact = marketplaceRegFact(v.registrationValidUntil, v.sold);

  const share = async () => {
    const line = `${v.title} · ${v.registrationNo} · ${taka(v.price)}`;
    try {
      await navigator.clipboard.writeText(line);
      toast("Vehicle details copied", "ok");
    } catch {
      toast("Could not copy on this device");
    }
  };

  return createPortal(
    <div className="backdrop backdrop-sheet" onClick={onClose} role="dialog" aria-modal="true">
      <div className="sf-sheet sf-qv" onClick={(e) => e.stopPropagation()}>
        <span className="sf-grip" />

        {/* ---- Bar ------------------------------------------------------- */}
        <div className="flex items-center gap-2 border-b border-rule px-3 py-2 sm:px-4 sm:py-2.5">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onStep(-1)}
            aria-label="Previous vehicle"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onStep(1)}
            aria-label="Next vehicle"
          >
            <ChevronRight size={14} />
          </button>
          <span className="ml-1 hidden font-mono text-[10px] text-ink-3 lg:inline">
            ← → to browse
          </span>
          <div className="flex-1" />
          <button className="btn btn-ghost btn-sm" onClick={share} aria-label="Copy the details">
            <Share2 size={13} />
            <span className="hidden sm:inline">Copy</span>
          </button>
          <button
            className="btn btn-ghost btn-sm"
            onClick={onSave}
            aria-pressed={saved}
            style={saved ? { color: "var(--bad)" } : undefined}
          >
            <Heart size={13} fill={saved ? "currentColor" : "none"} />
            <span className="hidden sm:inline">{saved ? "Saved" : "Save"}</span>
          </button>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="sf-sheet-body sf-qv-body">
          {/* ---- Photographs --------------------------------------------- */}
          <div>
            <div className="sf-stage">
              {count > 0 ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.images[shot]} alt={v.title} width={1200} height={900} />
              ) : (
                <div
                  className="absolute inset-0 grid place-items-center"
                  style={{
                    background: "linear-gradient(140deg, var(--surface-3), var(--surface-2))",
                  }}
                >
                  <Truck size={48} className="text-ink-3" strokeWidth={1.2} />
                </div>
              )}

              {count > 1 && (
                <>
                  <button
                    className="sf-arrow"
                    style={{ left: 10, opacity: 1 }}
                    onClick={() => setShot((n) => (n - 1 + count) % count)}
                    aria-label="Previous photo"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <button
                    className="sf-arrow"
                    style={{ right: 10, opacity: 1 }}
                    onClick={() => setShot((n) => (n + 1) % count)}
                    aria-label="Next photo"
                  >
                    <ChevronRight size={16} />
                  </button>
                </>
              )}

              {v.sold && (
                <div className="sf-sold-veil">
                  <span className="sf-sold-stamp">Sold</span>
                </div>
              )}

              {/* What state of the vehicle you are looking at.
                  Bottom-left, on the photograph itself, because that is the
                  only place a caption about a photograph cannot be mistaken
                  for a caption about something else on the page. */}
              {count > 0 && v.provenance !== "none" && (
                <span className="sf-shotmark" data-tone={PROVENANCE_META[v.provenance].tone}>
                  {v.provenance === "refurbished" ? <Sparkles size={10} /> : <Camera size={10} />}
                  {PROVENANCE_META[v.provenance].label}
                </span>
              )}

              {v.isNew && (
                <div className="absolute left-3 top-3 z-[5] flex flex-col items-start gap-1.5">
                  <span className="sf-badge sf-badge-new">Just listed</span>
                </div>
              )}
            </div>

            {count > 1 && (
              <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
                {v.images.map((src, n) => (
                  <button
                    key={src}
                    className="sf-thumb"
                    data-on={n === shot}
                    onClick={() => setShot(n)}
                    aria-label={`Photo ${n + 1}`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt="" width={124} height={92} loading="lazy" />
                  </button>
                ))}
              </div>
            )}

            {/* ---- As-is disclosure ---- */}
            {v.provenance === "as-is" && (
              <div className="px-4 pb-4">
                <div className="sf-asis">
                  <div className="sf-asis-head">
                    <PackageCheck size={14} />
                    Sold as is
                  </div>
                  <p className="sf-asis-body">
                    {PROVENANCE_META["as-is"].blurb}
                  </p>
                  {v.knownFaults.length > 0 && (
                    <>
                      <div className="sf-asis-label">
                        Known faults, not repaired
                      </div>
                      <ul className="sf-asis-list">
                        {v.knownFaults.map((f) => (
                          <li key={f}>{f}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              </div>
            )}

          </div>

          {/* ---- Facts, price, offers ------------------------------------- */}
          <div className="border-t border-rule px-4 py-4 md:border-l md:border-t-0 md:px-5">
            <h2 className="font-display text-[26px] font-bold leading-tight text-ink">
              {v.title}
            </h2>
            <p className="mt-1 font-mono text-[11px] text-ink-3">
              {v.registrationNo}
              {v.make && ` · ${v.make}`}
              {!v.sold && ` · listed ${timeAgo(v.listedAt)}`}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {v.year && (
                <span className="sf-spec">
                  <Calendar size={10} /> {v.year}
                </span>
              )}
              {/* Accent tone, unlike the rest of this row — mileage is the
                  one spec here that actually decides a used-vehicle sale, and
                  a chip identical to "sleeper cabin" undersold that. */}
              {v.mileage && (
                <span className="sf-spec" data-tone="accent">
                  <Gauge size={10} /> {v.mileage} km
                </span>
              )}
              {v.location && (
                <span className="sf-spec">
                  <MapPin size={10} /> {v.location}
                </span>
              )}
              {v.hasSleeperCabin && (
                <span className="sf-spec">
                  <BedDouble size={10} /> Sleeper cabin
                </span>
              )}
              {regFact && (
                <span className="sf-spec" data-tone={regFact.tone}>
                  <ShieldCheck size={10} /> {regFact.label}
                </span>
              )}
            </div>

            {/* Price block */}
            <div
              className="mt-4 rounded-[var(--radius-lg)] border p-4"
              style={{
                borderColor: v.sold ? "color-mix(in srgb, var(--ok) 30%, transparent)" : "var(--accent-line)",
                background: v.sold ? "var(--ok-soft)" : "var(--accent-soft)",
              }}
            >
              {v.sold ? (
                <>
                  <div className="label mb-1" style={{ color: "var(--ok)" }}>
                    Sold for
                  </div>
                  <div className="sf-price" style={{ color: "var(--ok)", fontSize: 30 }}>
                    {taka(v.soldAmount)}
                  </div>
                  <div className="mt-1.5 font-mono text-[11px]" style={{ color: "var(--ok)" }}>
                    {v.soldCustomer ?? "—"} · {shortDate(v.soldAt)}
                    {v.soldVia && ` · via ${v.soldVia}`}
                  </div>
                </>
              ) : (
                <>
                  <div className="label mb-1 flex items-center gap-1.5" style={{ color: "var(--accent-ink)" }}>
                    <Tag size={11} /> Asking price
                  </div>
                  <div className="sf-price" style={{ fontSize: 32, color: "var(--accent-ink)" }}>
                    {taka(v.price)}
                  </div>
                  {v.onHold ? (
                    <div
                      className="mt-2.5 flex items-start gap-2 text-[11.5px]"
                      style={{ color: "var(--warn)" }}
                    >
                      <PauseCircle size={13} className="mt-px shrink-0" />
                      <span>
                        Temporarily off the market while the price is revised for the new month.
                        Offers already submitted still stand.
                      </span>
                    </div>
                  ) : (
                    canOffer && (
                      <button className="btn btn-primary btn-block mt-3" onClick={onOffer}>
                        <Plus size={15} />
                        {v.myOffers.length > 0 ? "Add another customer" : "Submit customer offer"}
                      </button>
                    )
                  )}
                </>
              )}
            </div>

            {/* The officer's own offers, always visible to them */}
            {v.myOffers.length > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="label">Your customers on this vehicle</span>
                  <span className="font-mono text-[10px] text-ink-3">{v.myOffers.length}</span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {v.myOffers.map((o) => (
                    <li key={o.id} className="sf-offer">
                      <Users size={13} className="mt-0.5 shrink-0 text-accent" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold text-ink">
                          {offerFor(o)}
                        </div>
                        {o.note && (
                          <p className="mt-0.5 text-[11px] italic text-ink-2">{o.note}</p>
                        )}
                        <div
                          className="mt-0.5 font-mono text-[9px] text-ink-3"
                          suppressHydrationWarning
                        >
                          {o.revisedAt ? `revised ${timeAgo(o.revisedAt)}` : timeAgo(o.createdAt)}
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums text-ink">
                        {taka(o.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
                {canOffer && !v.onHold && !v.sold && (
                  <button className="btn btn-ghost btn-block mt-2" onClick={onOffer}>
                    <Plus size={14} /> Manage these offers
                  </button>
                )}
              </div>
            )}

            {/* The book — management only. */}
            {seesOfferBook && (
              <div className="mt-5 border-t border-rule pt-4">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="label">Offer book</span>
                  <span className="font-mono text-[10px] text-ink-3">
                    {v.offerCount ?? 0} on the table
                  </span>
                </div>
                <OfferBook offers={v.offers} asking={v.price} />
              </div>
            )}

            {!storefront && (
              <Link
                href={`/vehicles/${v.id}`}
                className="btn btn-ghost btn-block mt-4"
                onClick={onClose}
              >
                <ExternalLink size={14} /> Open the full file
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
