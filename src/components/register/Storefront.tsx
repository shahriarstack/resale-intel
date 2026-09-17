"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { VehicleGrade } from "@prisma/client";
import {
  ArrowUp,
  Check,
  Heart,
  LayoutGrid,
  MapPin,
  Rows3,
  Search,
  SearchX,
  ShoppingBag,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tag,
  Users,
  X,
} from "lucide-react";
import { taka, takaCompact, number as fmtNumber } from "@/lib/format";
import type { OfferRow } from "@/lib/bids";
import { usePersistedEnum, usePersistedJSON } from "@/lib/usePersisted";
import { useIsClient } from "@/lib/useIsClient";
import { ProductCard, ProductRow } from "@/components/register/ProductCard";
import { QuickView } from "@/components/register/QuickView";
import { OfferSheet } from "@/components/register/OfferSheet";
import { MyOffersDrawer } from "@/components/register/MyOffersDrawer";
import type { Provenance } from "@/lib/photos";

/**
 * The Marketplace.
 *
 * Three roles buy through this page — sales officers, AROs and service
 * engineers — and none of them sees a status, a desk, or a cost. What they see
 * is stock: photographs, a specification, one price, and a way to put a named
 * customer's offer against it. The approving desks get the same shop with the
 * offer book added, because they are choosing between buyers rather than
 * finding one.
 *
 * Built for a phone, then widened. The people who sell out of this catalogue
 * are standing in a yard, so the opening screen spends its height on stock
 * rather than on chrome: a two-line masthead, one swipeable row of facets, and
 * compact rows five to a screen. The secondary facets — make, territory, price
 * band, sort — live in a bottom sheet rather than in a rail that would wrap to
 * three lines and cost more than the vehicles it filters.
 *
 * Everything that filters is a facet on the PRODUCT, never on the process. You
 * can narrow by grade, make, territory, price and what you have already quoted
 * on; there is deliberately no way to narrow by "which desk has it", because
 * on this surface that question does not exist.
 */

export interface Listing {
  id: string;
  title: string;
  make: string | null;
  year: number | null;
  mileage: string | null;
  registrationNo: string;
  /** The paperwork's own clock — independent of `status`, and still ticking
   *  for as long as the vehicle sits unsold. Null only if Registration has
   *  never touched the file, which should not happen for anything live on
   *  this page (see lib/registrationValidity.ts). */
  registrationValidUntil: string | null;
  grade: VehicleGrade | null;
  territory: string | null;
  /** Where the vehicle physically is — a yard, a depot, a showroom. */
  location: string | null;
  hasSleeperCabin: boolean;
  listedAt: string;
  isNew: boolean;
  images: string[];
  /** Which state of the vehicle these photographs are of. */
  provenance: Provenance;
  /** Faults documented but deliberately not repaired. As-is listings only. */
  knownFaults: string[];
  price: number | null;
  sold: boolean;
  onHold: boolean;

  /** The viewer's own offers — always theirs to read, whatever their role. */
  myOffers: OfferRow[];

  /** The whole book. Empty unless the viewer is a desk that chooses a buyer. */
  offers: OfferRow[];
  offerCount: number | null;
  topOffer: number | null;

  soldAt: string | null;
  soldAmount: number | null;
  soldCustomer: string | null;
  soldVia: string | null;
  iBroughtIt: boolean;
}

export interface SalesOfficer {
  id: string;
  name: string;
  staffId: string;
  salesTerritory: string | null;
}

type SortKey = "newest" | "price-low" | "price-high" | "name";
type Density = "rows" | "cards";
type Band = "all" | "u10" | "10-20" | "20-40" | "40p";

const DENSITIES = ["rows", "cards"] as const;
const SORTS = ["newest", "price-low", "price-high", "name"] as const;

// Price bands in lakh, which is how this market talks about truck money.
const BANDS: { key: Band; label: string; min: number; max: number }[] = [
  { key: "all", label: "Any price", min: 0, max: Infinity },
  { key: "u10", label: "Under 10 L", min: 0, max: 1_000_000 },
  { key: "10-20", label: "10 L – 20 L", min: 1_000_000, max: 2_000_000 },
  { key: "20-40", label: "20 L – 40 L", min: 2_000_000, max: 4_000_000 },
  { key: "40p", label: "40 L and above", min: 4_000_000, max: Infinity },
];

const SORT_LABEL: Record<SortKey, string> = {
  newest: "Newest first",
  "price-low": "Price: low to high",
  "price-high": "Price: high to low",
  name: "Model A–Z",
};

export function Storefront({
  listings,
  canOffer,
  seesOfferBook,
  storefront,
  viewerLevel,
  openId,
  salesOfficers,
  viewerId,
}: {
  listings: Listing[];
  canOffer: boolean;
  seesOfferBook: boolean;
  /** True for the three offer-taking roles: no status, no cost, ever. */
  storefront: boolean;
  viewerLevel: string;
  /** A vehicle to open on arrival — a deep link into one listing. */
  openId: string | null;
  /** The roster the offer form credits an offer to. */
  salesOfficers: SalesOfficer[];
  viewerId: string;
}) {
  const [tab, setTab] = useState<"live" | "sold">(
    openId && listings.find((v) => v.id === openId)?.sold ? "sold" : "live",
  );
  const [search, setSearch] = useState("");
  const [make, setMake] = useState("all");
  const [territory, setTerritory] = useState("all");
  const [location, setLocation] = useState("all");
  const [band, setBand] = useState<Band>("all");
  const [onlySaved, setOnlySaved] = useState(false);
  const [onlyMine, setOnlyMine] = useState(false);
  const [sort, setSort] = usePersistedEnum<SortKey>("ri:sf:sort", SORTS, "newest");

  // Density defaults by who is looking. The field roles are on phones and want
  // to scan forty vehicles; the desks are on a wide screen with room for the
  // photographs. Either can switch, and the choice is remembered.
  const [density, setDensity] = usePersistedEnum<Density>(
    "ri:sf:density",
    DENSITIES,
    storefront ? "rows" : "cards",
  );

  // The shortlist lives in this browser only. It is a convenience for one
  // officer's day, not a company record, so it never leaves the device.
  const [saved, setSaved] = usePersistedJSON<string[]>("ri:sf:saved", []);

  const [quickId, setQuickId] = useState<string | null>(openId);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);

  // The rail shows a bottom edge once it has actually stuck to the top, which
  // is the only moment it needs one.
  const railRef = useRef<HTMLDivElement>(null);
  const [stuck, setStuck] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = railRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setStuck(e.intersectionRatio < 1), {
      threshold: [1],
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // A long catalogue on a phone is a long way back up.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 700);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const live = useMemo(() => listings.filter((v) => !v.sold), [listings]);
  const sold = useMemo(() => listings.filter((v) => v.sold), [listings]);
  const pool = tab === "live" ? live : sold;

  const makes = useMemo(
    () => [...new Set(listings.map((v) => v.make).filter(Boolean) as string[])].sort(),
    [listings],
  );
  const territories = useMemo(
    () => [...new Set(listings.map((v) => v.territory).filter(Boolean) as string[])].sort(),
    [listings],
  );
  // Where the stock is standing. For a sales officer this is the useful
  // geography — "which of these can I show a buyer this afternoon" — and it is
  // a different question from the recovery territory, which only says whose
  // patch the vehicle was seized on.
  const locations = useMemo(
    () => [...new Set(listings.map((v) => v.location).filter(Boolean) as string[])].sort(),
    [listings],
  );

  const list = useMemo(() => {
    let out = pool;

    if (make !== "all") out = out.filter((v) => v.make === make);
    if (territory !== "all") out = out.filter((v) => v.territory === territory);
    if (location !== "all") out = out.filter((v) => v.location === location);
    if (onlySaved) out = out.filter((v) => saved.includes(v.id));
    if (onlyMine) out = out.filter((v) => v.myOffers.length > 0);

    if (band !== "all") {
      const b = BANDS.find((x) => x.key === band)!;
      out = out.filter((v) => v.price !== null && v.price >= b.min && v.price < b.max);
    }

    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          (v.make ?? "").toLowerCase().includes(q) ||
          v.registrationNo.toLowerCase().includes(q) ||
          (v.territory ?? "").toLowerCase().includes(q) ||
          (v.location ?? "").toLowerCase().includes(q) ||
          v.myOffers.some((o) => (o.customerName ?? "").toLowerCase().includes(q)),
      );
    }

    return [...out].sort((a, b) => {
      switch (sort) {
        case "price-high":
          return (b.price ?? 0) - (a.price ?? 0);
        case "price-low":
          return (a.price ?? Infinity) - (b.price ?? Infinity);
        case "name":
          return a.title.localeCompare(b.title);
        default:
          return Date.parse(b.listedAt) - Date.parse(a.listedAt);
      }
    });
  }, [pool, make, territory, location, band, onlySaved, onlyMine, saved, search, sort]);

  // What the Filters button carries a count for. Shortlist and quoted stay out
  // of it: those have their own chips on the rail, and counting a filter the
  // user can already see the state of is just noise on the badge.
  const sheetFilters =
    (make !== "all" ? 1 : 0) +
    (territory !== "all" ? 1 : 0) +
    (location !== "all" ? 1 : 0) +
    (band !== "all" ? 1 : 0);
  const filtersOn =
    search.trim() !== "" ||
    sheetFilters > 0 ||
    onlySaved ||
    onlyMine;

  const clear = useCallback(() => {
    setSearch("");
    setMake("all");
    setTerritory("all");
    setLocation("all");
    setBand("all");
    setOnlySaved(false);
    setOnlyMine(false);
  }, []);

  const toggleSave = (id: string) =>
    setSaved(saved.includes(id) ? saved.filter((x) => x !== id) : [...saved, id]);

  // Headline facts come off the live pool, not the filtered one — otherwise
  // the band you picked rewrites the range that told you which band to pick.
  const prices = live.map((v) => v.price).filter((p): p is number => p !== null && p > 0);
  const lowest = prices.length ? Math.min(...prices) : null;
  const highest = prices.length ? Math.max(...prices) : null;
  const freshCount = live.filter((v) => v.isNew).length;
  const myOfferCount = listings.reduce((n, v) => n + v.myOffers.length, 0);
  const myVehicleCount = listings.filter((v) => v.myOffers.length > 0).length;

  const quick = list.find((v) => v.id === quickId) ?? listings.find((v) => v.id === quickId) ?? null;
  const offerTarget = listings.find((v) => v.id === offerId) ?? null;

  // Arrow-key browsing inside the listing view walks the filtered list, so it
  // follows what is actually on screen.
  const stepQuick = useCallback(
    (delta: number) => {
      if (!quickId || list.length === 0) return;
      const at = list.findIndex((v) => v.id === quickId);
      const next = list[(at + delta + list.length) % list.length];
      if (next) setQuickId(next.id);
    },
    [quickId, list],
  );

  const cardProps = (v: Listing, i: number) => ({
    v,
    i,
    canOffer: canOffer && !v.onHold && !v.sold,
    seesOfferBook,
    saved: saved.includes(v.id),
    onSave: () => toggleSave(v.id),
    onOffer: () => setOfferId(v.id),
    onOpen: () => setQuickId(v.id),
  });

  return (
    <div className="sf-page">
      {/* ---- Masthead ---------------------------------------------------- */}
      <header className="sf-hero" style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}>
        {/* A field of dots rather than a photograph — the band reads as a
            considered surface at every width instead of as "art on tablet,
            nothing on a phone," and it costs no image request at all. */}
        <div className="sf-hero-dots" aria-hidden="true" />
        <div className="sf-hero-glow" aria-hidden="true" />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="eyebrow">{storefront ? viewerLevel : "Resale"}</div>
            <h1 className="sf-headline mt-1">Marketplace</h1>
          </div>

          {canOffer && (
            <button
              className="btn btn-sm shrink-0"
              style={{
                background: "#fff",
                color: "var(--accent-ink)",
                boxShadow: "0 2px 8px -2px rgba(17,17,28,0.28)",
              }}
              onClick={() => setDrawer(true)}
              aria-label="Your customer offers"
            >
              <ShoppingBag size={14} />
              <span className="hidden sm:inline">Offers</span>
              {myOfferCount > 0 && (
                <span
                  className="rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold"
                  style={{ background: "var(--accent-soft)" }}
                >
                  {myOfferCount}
                </span>
              )}
            </button>
          )}
        </div>

        <p className="sf-hero-sub mt-1.5 hidden max-w-lg text-[13px] leading-relaxed sm:block">
          {canOffer
            ? "Refurbished, registered and priced. Find the right unit for your buyer and put their price forward — as many customers per vehicle as you have."
            : "Every vehicle approved and released for resale, with the offers standing against each."}
        </p>

        <div className="mt-3 flex flex-col gap-2.5 lg:flex-row lg:items-center">
          <div className="sf-search lg:max-w-md">
            <Search size={17} className="shrink-0 text-ink-3" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Model, registration, location…"
              aria-label="Search the marketplace"
            />
            {search && (
              <button
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="sf-track">
            <span className="sf-fact">
              <span className="sf-fact-icon"><Store size={13} /></span>
              <span className="sf-fact-text">
                <strong>{live.length}</strong>
                <em>Available</em>
              </span>
            </span>
            {lowest !== null && highest !== null && (
              <span className="sf-fact">
                <span className="sf-fact-icon"><Tag size={13} /></span>
                <span className="sf-fact-text">
                  <strong>{takaCompact(lowest)}–{takaCompact(highest)}</strong>
                  <em>Price range</em>
                </span>
              </span>
            )}
            {freshCount > 0 && (
              <span className="sf-fact">
                <span className="sf-fact-icon"><Sparkles size={13} /></span>
                <span className="sf-fact-text">
                  <strong>{freshCount}</strong>
                  <em>New</em>
                </span>
              </span>
            )}
            {locations.length > 1 && (
              <span className="sf-fact">
                <span className="sf-fact-icon"><MapPin size={13} /></span>
                <span className="sf-fact-text">
                  <strong>{locations.length}</strong>
                  <em>Locations</em>
                </span>
              </span>
            )}
            {canOffer && myOfferCount > 0 && (
              <span className="sf-fact">
                <span className="sf-fact-icon"><Users size={13} /></span>
                <span className="sf-fact-text">
                  <strong>{myOfferCount}</strong>
                  <em>on {myVehicleCount} vehicles</em>
                </span>
              </span>
            )}
          </div>
        </div>
      </header>

      {/* ---- Facets ------------------------------------------------------ */}
      <div ref={railRef} className="sf-rail" data-stuck={stuck}>
        <button
          className="sf-pill shrink-0"
          data-active={sheetFilters > 0}
          onClick={() => setSheet(true)}
          aria-label="More filters and sorting"
        >
          <SlidersHorizontal size={12} />
          <span className="hidden lg:inline">Filters</span>
          {sheetFilters > 0 && <span className="sf-pill-count">{sheetFilters}</span>}
        </button>

        <div className="sf-track">
          <button className="sf-pill" data-on={tab === "live"} onClick={() => setTab("live")}>
            Available <span className="sf-pill-count">{live.length}</span>
          </button>
          <button className="sf-pill" data-on={tab === "sold"} onClick={() => setTab("sold")}>
            Sold <span className="sf-pill-count">{sold.length}</span>
          </button>

          <span className="mx-0.5 h-3.5 w-px shrink-0 bg-rule-strong" aria-hidden="true" />

          <button className="sf-pill" data-on={onlySaved} onClick={() => setOnlySaved(!onlySaved)}>
            <Heart size={11} fill={onlySaved ? "currentColor" : "none"} />
            Saved
            {saved.length > 0 && <span className="sf-pill-count">{saved.length}</span>}
          </button>

          {canOffer && myOfferCount > 0 && (
            <button className="sf-pill" data-on={onlyMine} onClick={() => setOnlyMine(!onlyMine)}>
              <Users size={11} /> Quoted
              <span className="sf-pill-count">{myVehicleCount}</span>
            </button>
          )}

          {filtersOn && (
            <button className="sf-pill" onClick={clear}>
              <X size={11} /> Clear
            </button>
          )}
        </div>

        <div className="sf-density shrink-0" role="group" aria-label="Layout density">
          <button
            className="sf-density-btn"
            data-on={density === "cards"}
            onClick={() => setDensity("cards")}
            aria-label="Photo cards"
            title="Photo cards"
          >
            <LayoutGrid size={13} />
          </button>
          <button
            className="sf-density-btn"
            data-on={density === "rows"}
            onClick={() => setDensity("rows")}
            aria-label="Compact list"
            title="Compact list"
          >
            <Rows3 size={13} />
          </button>
        </div>
      </div>

      {/* ---- Stock ------------------------------------------------------- */}
      {list.length === 0 ? (
        <div className="sf-empty mt-3">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-surface-2">
            {filtersOn ? (
              <SearchX size={24} className="text-ink-3" strokeWidth={1.5} />
            ) : (
              <Store size={24} className="text-ink-3" strokeWidth={1.5} />
            )}
          </div>
          <p className="max-w-xs text-[13px] leading-snug text-ink-2">
            {filtersOn
              ? "Nothing in stock matches that. Try widening the price band or clearing a filter."
              : tab === "sold"
                ? "Nothing has been sold through the marketplace yet."
                : "No vehicles are on the marketplace right now. New stock appears the moment it is approved."}
          </p>
          {filtersOn && (
            <button className="btn btn-ghost btn-sm" onClick={clear}>
              <X size={13} /> Clear filters
            </button>
          )}
        </div>
      ) : density === "cards" ? (
        <div className="sf-grid mt-3">
          {list.map((v, i) => (
            <ProductCard key={v.id} {...cardProps(v, i)} />
          ))}
        </div>
      ) : (
        <div className="sf-stack mt-3">
          {list.map((v, i) => (
            <ProductRow key={v.id} {...cardProps(v, i)} />
          ))}
        </div>
      )}

      {list.length > 0 && (
        <p className="mt-5 text-center font-mono text-[10px] text-ink-3">
          {list.length === pool.length
            ? `${fmtNumber(pool.length)} vehicle${pool.length === 1 ? "" : "s"}`
            : `${list.length} of ${pool.length} shown`}
          {lowest !== null && tab === "live" && ` · from ${taka(lowest)}`}
        </p>
      )}

      {scrolled && (
        <button
          className="sf-totop"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="Back to top"
        >
          <ArrowUp size={17} />
        </button>
      )}

      {/* ---- Layers ------------------------------------------------------ */}
      {sheet && (
        <FilterSheet
          makes={makes}
          territories={territories}
          locations={locations}
          make={make}
          territory={territory}
          location={location}
          band={band}
          sort={sort}
          onMake={setMake}
          onTerritory={setTerritory}
          onLocation={setLocation}
          onBand={setBand}
          onSort={setSort}
          onClear={clear}
          onClose={() => setSheet(false)}
          resultCount={list.length}
        />
      )}

      {quick && (
        <QuickView
          // Keyed on the vehicle: stepping to the next listing remounts the
          // dialog, which resets the photo it opens on without an effect
          // reaching in to do it.
          key={quick.id}
          v={quick}
          canOffer={canOffer && !quick.onHold && !quick.sold}
          seesOfferBook={seesOfferBook}
          storefront={storefront}
          saved={saved.includes(quick.id)}
          onSave={() => toggleSave(quick.id)}
          onOffer={() => setOfferId(quick.id)}
          onClose={() => setQuickId(null)}
          onStep={stepQuick}
        />
      )}

      {offerTarget && (
        <OfferSheet
          target={{
            id: offerTarget.id,
            title: offerTarget.title,
            make: offerTarget.make,
            registrationNo: offerTarget.registrationNo,
            image: offerTarget.images[0] ?? null,
            price: offerTarget.price,
            myOffers: offerTarget.myOffers,
          }}
          salesOfficers={salesOfficers}
          viewerId={viewerId}
          onClose={() => setOfferId(null)}
        />
      )}

      {drawer && (
        <MyOffersDrawer
          listings={listings}
          onClose={() => setDrawer(false)}
          onOpenVehicle={(id) => {
            setDrawer(false);
            setQuickId(id);
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The filter sheet
// ---------------------------------------------------------------------------

/**
 * Make, territory, price band and sort — the facets that would have wrapped
 * the rail onto a third line for the sake of controls nobody touches on every
 * visit.
 *
 * Options are rendered as tappable rows rather than as a `<select>`: a native
 * picker on a phone covers the screen with a wheel and hides the result count,
 * and the count is the point — the footer says how much stock survives the
 * choices while they are being made.
 */
function FilterSheet({
  makes,
  territories,
  locations,
  make,
  territory,
  location,
  band,
  sort,
  onMake,
  onTerritory,
  onLocation,
  onBand,
  onSort,
  onClear,
  onClose,
  resultCount,
}: {
  makes: string[];
  territories: string[];
  locations: string[];
  make: string;
  territory: string;
  location: string;
  band: Band;
  sort: SortKey;
  onMake: (v: string) => void;
  onTerritory: (v: string) => void;
  onLocation: (v: string) => void;
  onBand: (v: Band) => void;
  onSort: (v: SortKey) => void;
  onClear: () => void;
  onClose: () => void;
  resultCount: number;
}) {
  const isClient = useIsClient();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  if (!isClient) return null;

  return createPortal(
    <div
      className="backdrop backdrop-sheet"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Filters and sorting"
    >
      <div className="sf-sheet" style={{ "--sheet-w": "420px" } as React.CSSProperties} onClick={(e) => e.stopPropagation()}>
        <span className="sf-grip" />

        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-4">
          <h2 className="font-display text-lg font-bold text-ink">Filter & sort</h2>
          <button
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={17} />
          </button>
        </div>

        <div className="sf-sheet-body px-5 pb-4">
          <Group label="Sort by">
            {SORTS.map((s) => (
              <Row key={s} label={SORT_LABEL[s]} on={sort === s} onClick={() => onSort(s)} />
            ))}
          </Group>

          <Group label="Price">
            {BANDS.map((b) => (
              <Row key={b.key} label={b.label} on={band === b.key} onClick={() => onBand(b.key)} />
            ))}
          </Group>

          {locations.length > 1 && (
            <Group label="Where it is now">
              <Row
                label="Anywhere"
                on={location === "all"}
                onClick={() => onLocation("all")}
              />
              {locations.map((l) => (
                <Row key={l} label={l} on={location === l} onClick={() => onLocation(l)} />
              ))}
            </Group>
          )}

          {makes.length > 1 && (
            <Group label="Make">
              <Row label="All makes" on={make === "all"} onClick={() => onMake("all")} />
              {makes.map((m) => (
                <Row key={m} label={m} on={make === m} onClick={() => onMake(m)} />
              ))}
            </Group>
          )}

          {territories.length > 1 && (
            <Group label="Territory">
              <Row
                label="All territories"
                on={territory === "all"}
                onClick={() => onTerritory("all")}
              />
              {territories.map((t) => (
                <Row key={t} label={t} on={territory === t} onClick={() => onTerritory(t)} />
              ))}
            </Group>
          )}
        </div>

        <div className="flex items-center gap-2.5 border-t border-rule px-5 py-3">
          <button className="btn btn-ghost" onClick={onClear}>
            Reset
          </button>
          <button className="btn btn-primary flex-1" onClick={onClose}>
            Show {resultCount} vehicle{resultCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Group({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 last:mb-0">
      <div className="label mb-1.5">{label}</div>
      <div className="flex flex-col">{children}</div>
    </section>
  );
}

function Row({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      className="flex items-center justify-between gap-3 rounded-lg px-2.5 py-2.5 text-left text-[13.5px] transition-colors hover:bg-surface-2"
      onClick={onClick}
      aria-pressed={on}
      style={on ? { color: "var(--accent-ink)", fontWeight: 600 } : { color: "var(--ink-2)" }}
    >
      {label}
      {on && <Check size={15} className="shrink-0 text-accent" />}
    </button>
  );
}
