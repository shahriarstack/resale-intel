"use client";

import { useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Heart,
  Images,
  PackageCheck,
  PauseCircle,
  Plus,
  ShieldCheck,
  Trophy,
  Truck,
} from "lucide-react";
import { taka, shortDate } from "@/lib/format";
import { marketplaceRegFact } from "@/lib/registrationValidity";
import type { Listing } from "@/components/register/Storefront";

/**
 * One vehicle, as a product.
 *
 * The card carries exactly what a buyer's question needs — pictures, model,
 * registration, a few specifications and one price — and deliberately carries
 * nothing else. No status, no desk, no cost basis, no margin. An officer
 * standing in front of a customer needs the truck to look like a truck for
 * sale, and the company needs them negotiating without a cost sheet in their
 * pocket. Those two requirements happen to describe the same card.
 *
 * Two densities, because a phone and a desk ask different questions.
 * `ProductRow` answers "which of these forty" — a 108px thumbnail and three
 * lines, five to a screen. `ProductCard` answers "show me this one" — the
 * photograph at full width with the swipe on it. Phones open on rows; wide
 * screens open on cards.
 */

/**
 * The specification, as one mono line. Chips wrapped; a line does not.
 *
 * Location, not territory. A buyer's second question is always "where can I
 * see it" — the recovery territory answers "whose patch was it seized on",
 * which is a fact about the file and of no use to anyone selling.
 *
 * Mileage used to live in this sentence too. It doesn't any more — see
 * `QuickFacts` below — because it is the single number most used-vehicle
 * buyers decide on first, and a number that decides the sale should not be
 * sitting in the same muted, easy-to-skim-past run as the year and the yard
 * it's parked in.
 */
function metaLine(v: Listing): string {
  return [v.year, v.location ?? v.territory].filter(Boolean).join(" · ");
}

/**
 * Mileage and registration — the two facts pulled out of the meta line and
 * given their own small, coloured chips.
 *
 * Mileage always gets the accent treatment: it is a fact every buyer weighs,
 * whatever it says. Registration only speaks up when it has something a
 * buyer needs to act on soon — expired or ending — versus a calm confirmation
 * otherwise; `marketplaceRegFact` returns null for a sold vehicle (the
 * paperwork is the new owner's problem now) and the unset case that should
 * never occur for a live listing.
 */
function QuickFacts({ v }: { v: Listing }) {
  const reg = marketplaceRegFact(v.registrationValidUntil, v.sold);
  if (!v.mileage && !reg) return null;
  return (
    <div className="sf-qfacts">
      {v.mileage && (
        <span className="sf-qf sf-qf-km">
          <Gauge size={10} /> {v.mileage} km
        </span>
      )}
      {reg && (
        <span className="sf-qf" data-tone={reg.tone}>
          <ShieldCheck size={10} /> {reg.label}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Photographs
// ---------------------------------------------------------------------------

/**
 * A swipe track on touch, an arrow carousel on a mouse.
 *
 * The photos are a scroll-snapping row rather than a cross-fade, so a thumb
 * drags the image with it — the gesture every phone gallery has taught, and
 * one a fade cannot answer. The arrows scroll the same track, so both inputs
 * drive one mechanism.
 */
function Gallery({
  images,
  alt,
  sold,
  onOpen,
  children,
}: {
  images: string[];
  alt: string;
  sold: boolean;
  /** Opening the listing. An overlay button UNDER the carousel controls — a
   *  button inside a button is invalid HTML and will not hydrate. */
  onOpen: () => void;
  children?: React.ReactNode;
}) {
  const track = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState(0);
  const count = images.length;

  const goTo = (n: number, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    const el = track.current;
    if (!el) return;
    const next = (n + count) % count;
    el.scrollTo({ left: el.clientWidth * next, behavior: "smooth" });
    setAt(next);
  };

  // The dots follow the track, not the other way round, so a swipe and an
  // arrow press are reported identically.
  const onScroll = () => {
    const el = track.current;
    if (!el || el.clientWidth === 0) return;
    const n = Math.round(el.scrollLeft / el.clientWidth);
    if (n !== at) setAt(n);
  };

  return (
    <div className="sf-media">
      {count > 0 ? (
        <div className="sf-swipe" ref={track} onScroll={onScroll}>
          {images.map((src, n) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={n === 0 ? alt : ""}
              width={960}
              height={600}
              loading={n === 0 ? "eager" : "lazy"}
              className="h-full w-full object-cover"
            />
          ))}
        </div>
      ) : (
        <div
          className="absolute inset-0 grid place-items-center"
          style={{ background: "linear-gradient(140deg, var(--surface-3), var(--surface-2))" }}
        >
          <Truck size={34} className="text-ink-3" strokeWidth={1.3} />
        </div>
      )}

      <button className="sf-open" onClick={onOpen} aria-label={`View ${alt}`} />

      {count > 1 && (
        <>
          <button
            className="sf-arrow"
            style={{ left: 8 }}
            onClick={(e) => goTo(at - 1, e)}
            aria-label="Previous photo"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            className="sf-arrow"
            style={{ right: 8 }}
            onClick={(e) => goTo(at + 1, e)}
            aria-label="Next photo"
          >
            <ChevronRight size={16} />
          </button>
          <div className="sf-dots">
            {images.map((src, n) => (
              <span key={src} className="sf-dot" data-on={n === at} />
            ))}
          </div>
        </>
      )}

      {sold && (
        <div className="sf-sold-veil">
          <span className="sf-sold-stamp">Sold</span>
        </div>
      )}

      {children}
    </div>
  );
}

/** The badge stack pinned to the top-left of the photograph. */
function Badges({ v, tiny }: { v: Listing; tiny?: boolean }) {
  return (
    <div className="sf-badges" style={tiny ? { left: 6, top: 6, gap: 4 } : undefined}>
      {v.isNew && !v.sold && <span className="sf-badge sf-badge-new">New</span>}
      {v.onHold && !tiny && (
        <span className="sf-badge sf-badge-dark">
          <PauseCircle size={9} /> Off market
        </span>
      )}
    </div>
  );
}

function SaveHeart({
  saved,
  onSave,
  small,
}: {
  saved: boolean;
  onSave: () => void;
  small?: boolean;
}) {
  return (
    <button
      className={`sf-heart${small ? " sf-heart-sm" : ""}`}
      data-on={saved}
      onClick={onSave}
      aria-pressed={saved}
      aria-label={saved ? "Remove from your shortlist" : "Save to your shortlist"}
    >
      <Heart size={small ? 12 : 14} fill={saved ? "currentColor" : "none"} />
    </button>
  );
}

/**
 * Price and the one action, on a single row.
 *
 * The number sits left at display weight; the add-offer control sits right as
 * a circle. The full-width labelled button this replaced cost a whole row of
 * height on every card to say a word the plus sign already says.
 */
function PriceRow({
  v,
  canOffer,
  seesOfferBook,
  onOffer,
}: {
  v: Listing;
  canOffer: boolean;
  seesOfferBook: boolean;
  onOffer: () => void;
}) {
  if (v.sold) {
    return (
      <div className="flex items-end justify-between gap-2">
        <div className="min-w-0">
          <span className="sf-price sf-price-sold" style={{ color: "var(--ok)" }}>
            {taka(v.soldAmount)}
          </span>
          <span className="sf-price-sub ml-1.5">sold</span>
          <span className="sf-meta mt-1">
            {v.soldCustomer ? `${v.soldCustomer} · ` : ""}
            {shortDate(v.soldAt)}
          </span>
        </div>
        {v.iBroughtIt && (
          <span
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full"
            style={{ background: "var(--ok-soft)", color: "var(--ok-ink)" }}
            title="Your customer took this one"
          >
            <Trophy size={14} />
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2.5">
      <div className="min-w-0">
        <span className="sf-price-eyebrow">Asking price</span>
        <span className="sf-price">{taka(v.price)}</span>
        {seesOfferBook && v.offerCount !== null && v.offerCount > 0 && (
          <span className="sf-price-sub ml-1.5" style={{ color: "var(--ok)" }}>
            best {taka(v.topOffer)}
          </span>
        )}
      </div>

      {v.onHold ? (
        <span className="sf-badge sf-badge-light shrink-0" style={{ color: "var(--warn)" }}>
          <PauseCircle size={9} /> On hold
        </span>
      ) : (
        canOffer && (
          <button
            className="sf-add"
            data-has={v.myOffers.length > 0}
            onClick={onOffer}
            aria-label={
              v.myOffers.length > 0
                ? `Add another customer offer on ${v.title}`
                : `Submit a customer offer on ${v.title}`
            }
          >
            <Plus size={18} />
          </button>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Densities
// ---------------------------------------------------------------------------

export function ProductCard({
  v,
  i,
  canOffer,
  seesOfferBook,
  saved,
  onSave,
  onOffer,
  onOpen,
}: {
  v: Listing;
  i: number;
  canOffer: boolean;
  seesOfferBook: boolean;
  saved: boolean;
  onSave: () => void;
  onOffer: () => void;
  onOpen: () => void;
}) {
  return (
    <article
      className="sf-card"
      // `backwards`, not `both`: the entrance keyframes touch `transform`, and
      // a `both` fill holds that transform forever after the animation ends —
      // which silently wins over `.sf-card:hover`'s own translateY, since a
      // filled animation outranks a plain cascaded rule for the properties it
      // touches. `backwards` still pre-applies the FROM frame during the
      // stagger delay (so cards don't flash in before their turn) but lets go
      // once the animation completes, which is what lets the hover lift work.
      style={{ animation: `slideUp 0.26s var(--ease-out-quart) ${Math.min(i, 9) * 0.03}s backwards` }}
    >
      <Gallery
        images={v.images}
        alt={`${v.title}, ${v.registrationNo}`}
        sold={v.sold}
        onOpen={onOpen}
      >
        <Badges v={v} />
        {v.provenance === "as-is" && (
          <span className="sf-chipmark" data-tone="warn" title="Sold in the condition it was recovered in">
            <PackageCheck size={9} /> As is
          </span>
        )}
        {v.images.length > 1 && (
          <span className="sf-badge sf-badge-dark absolute bottom-2 right-2 z-[5]">
            <Images size={9} /> {v.images.length}
          </span>
        )}
      </Gallery>

      <SaveHeart saved={saved} onSave={onSave} />

      <div className="sf-body">
        <button className="block min-w-0 text-left" onClick={onOpen}>
          <span className="flex items-baseline justify-between gap-2">
            <span className="sf-title truncate">{v.title}</span>
            {v.make && (
              <span className="sf-price-sub sf-card-make shrink-0">
                {v.make}
              </span>
            )}
          </span>
          <span className="sf-meta mt-0.5">
            {v.registrationNo}
            {metaLine(v) && ` · ${metaLine(v)}`}
          </span>
        </button>

        <QuickFacts v={v} />

        <PriceRow v={v} canOffer={canOffer} seesOfferBook={seesOfferBook} onOffer={onOffer} />

        {v.myOffers.length > 0 && !v.sold && (
          <div className="sf-mine">
            <span className="min-w-0 flex-1 truncate">
              {v.myOffers.length} of your customers · best {taka(v.myOffers[0].amount)}
            </span>
          </div>
        )}
      </div>
    </article>
  );
}

export function ProductRow({
  v,
  i,
  canOffer,
  seesOfferBook,
  saved,
  onSave,
  onOffer,
  onOpen,
}: {
  v: Listing;
  i: number;
  canOffer: boolean;
  seesOfferBook: boolean;
  saved: boolean;
  onSave: () => void;
  onOffer: () => void;
  onOpen: () => void;
}) {
  const hero = v.images[0] ?? null;

  return (
    <article
      className="sf-row"
      style={{ animation: `fadeIn 0.2s var(--ease-out-quart) ${Math.min(i, 11) * 0.02}s both` }}
    >
      <div className="sf-row-media">
        {hero ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={hero} alt="" width={340} height={260} loading="lazy" />
        ) : (
          <div
            className="absolute inset-0 grid place-items-center"
            style={{ background: "linear-gradient(140deg, var(--surface-3), var(--surface-2))" }}
          >
            <Truck size={22} className="text-ink-3" strokeWidth={1.4} />
          </div>
        )}
        <button
          className="sf-open"
          onClick={onOpen}
          aria-label={`View ${v.title}, ${v.registrationNo}`}
        />
        <Badges v={v} tiny />
        {/* Tucked into the foot of the thumbnail rather than the corner of the
            row: at this density the row's own top-right is where the title
            lives, and a heart parked over a truck's name is worse than a
            slightly smaller heart. */}
        <div className="sf-heart-slot">
          <SaveHeart saved={saved} onSave={onSave} small />
        </div>
        {v.sold && (
          <div className="sf-sold-veil">
            <span className="sf-sold-stamp" style={{ fontSize: 10, padding: "4px 9px" }}>
              Sold
            </span>
          </div>
        )}
      </div>

      <div className="sf-row-body">
        <button className="block min-w-0 text-left" onClick={onOpen}>
          <span className="flex items-baseline gap-1.5">
            {/* Sizes live in the stylesheet, not here.
                They were inline, which meant no stylesheet could reach them —
                the field density pass in 17-field-density.css silently did
                nothing to this row until they moved. `.sf-row` scopes them so
                the desk keeps the size it had. */}
            <span className="sf-title truncate">{v.title}</span>
            {v.make && <span className="sf-price-sub sf-row-make shrink-0">{v.make}</span>}
          </span>
          {/* Registration and specification share one line here. Two lines is
              13px per row, and at five rows a screen that is half a vehicle. */}
          <span className="sf-meta">
            {v.registrationNo}
            {metaLine(v) && ` · ${metaLine(v)}`}
          </span>
        </button>

        <QuickFacts v={v} />

        <div className="flex items-center justify-between gap-2">
          {/* Colour stays inline — it is state, and a sold price is green.
              The size does not. */}
          <span className="sf-price" style={v.sold ? { color: "var(--ok)" } : undefined}>
            {taka(v.sold ? v.soldAmount : v.price)}
          </span>

          {!v.sold && !v.onHold && canOffer && (
            <button
              className="sf-add"
              data-has={v.myOffers.length > 0}
              style={{ width: 34, height: 34 }}
              onClick={onOffer}
              aria-label={
                v.myOffers.length > 0
                  ? `Add another customer offer on ${v.title}`
                  : `Submit a customer offer on ${v.title}`
              }
            >
              <Plus size={16} />
            </button>
          )}
          {!v.sold && v.onHold && (
            <span className="sf-price-sub shrink-0" style={{ color: "var(--warn)" }}>
              on hold
            </span>
          )}
          {v.sold && v.iBroughtIt && (
            <Trophy size={15} className="shrink-0" style={{ color: "var(--ok)" }} />
          )}
        </div>

        {(v.myOffers.length > 0 || (seesOfferBook && (v.offerCount ?? 0) > 0)) && (
          <span className="sf-meta" style={{ color: "var(--accent-ink)" }}>
            {v.myOffers.length > 0
              ? `${v.myOffers.length} of your customers · best ${taka(v.myOffers[0].amount)}`
              : `${v.offerCount} offers · best ${taka(v.topOffer)}`}
          </span>
        )}
      </div>
    </article>
  );
}
