"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { VehicleGrade } from "@prisma/client";
import {
  Store,
  Gavel,
  Truck,
  Images,
  MapPin,
  Gauge,
  Calendar,
  LayoutGrid,
  Rows3,
  ArrowUpDown,
  Trophy,
  CheckCircle2,
  Tag,
  X,
} from "lucide-react";
import { GRADE_META } from "@/lib/grades";
import { takaCompact, shortDate, number as fmtNumber } from "@/lib/format";
import { SearchBar } from "@/components/ui/SearchBar";
import { BidModal } from "@/components/register/BidModal";

export interface MarketVehicle {
  id: string;
  title: string;
  make: string | null;
  year: number | null;
  mileage: string | null;
  registrationNo: string;
  grade: VehicleGrade | null;
  territory: string | null;
  updatedAt: string;
  imageUrl: string | null;
  photoCount: number;
  approvedPrice: number | null;
  sold: boolean;
  myBid: { amount: number; createdAt: string } | null;
  myBidCount: number;
  topBid: number | null;
  bidderCount: number | null;
  soldAt: string | null;
  winningAmount: number | null;
  winnerName: string | null;
  iWon: boolean | null;
}

type SortKey = "newest" | "price-high" | "price-low" | "name";
type View = "grid" | "list";

export function RegisterClient({
  vehicles,
  canBid,
  seesAllBids,
}: {
  vehicles: MarketVehicle[];
  canBid: boolean;
  seesAllBids: boolean;
}) {
  const [tab, setTab] = useState<"live" | "sold">("live");
  const [search, setSearch] = useState("");
  const [grade, setGrade] = useState<VehicleGrade | "all">("all");
  const [make, setMake] = useState("all");
  const [territory, setTerritory] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const [view, setView] = useState<View>("grid");
  const [bidding, setBidding] = useState<MarketVehicle | null>(null);

  const live = vehicles.filter((v) => !v.sold);
  const sold = vehicles.filter((v) => v.sold);
  const pool = tab === "live" ? live : sold;

  const makes = useMemo(
    () => [...new Set(vehicles.map((v) => v.make).filter(Boolean) as string[])].sort(),
    [vehicles],
  );
  const territories = useMemo(
    () => [...new Set(vehicles.map((v) => v.territory).filter(Boolean) as string[])].sort(),
    [vehicles],
  );

  const list = useMemo(() => {
    let out = pool;

    if (grade !== "all") out = out.filter((v) => v.grade === grade);
    if (make !== "all") out = out.filter((v) => v.make === make);
    if (territory !== "all") out = out.filter((v) => v.territory === territory);

    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          (v.make ?? "").toLowerCase().includes(q) ||
          v.registrationNo.toLowerCase().includes(q) ||
          (v.territory ?? "").toLowerCase().includes(q),
      );
    }

    return [...out].sort((a, b) => {
      switch (sort) {
        case "price-high":
          return (b.approvedPrice ?? 0) - (a.approvedPrice ?? 0);
        case "price-low":
          return (a.approvedPrice ?? 0) - (b.approvedPrice ?? 0);
        case "name":
          return a.title.localeCompare(b.title);
        default:
          return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
      }
    });
  }, [pool, grade, make, territory, search, sort]);

  const filtersOn =
    search.trim() !== "" || grade !== "all" || make !== "all" || territory !== "all";
  const clear = () => {
    setSearch("");
    setGrade("all");
    setMake("all");
    setTerritory("all");
  };

  const myOpenBids = live.filter((v) => v.myBid).length;

  return (
    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-7 sm:py-8">
      <header className="mb-5" style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}>
        <div className="eyebrow text-accent">Resale marketplace</div>
        <h1 className="page-title mt-1 text-[28px] sm:text-[32px]">Live Register</h1>
        <p className="mt-1.5 text-[14px] text-ink-2">
          {canBid
            ? "Browse approved stock and place a sealed bid. The highest offer wins."
            : "Every vehicle approved and ready for resale."}
          {canBid && myOpenBids > 0 && (
            <>
              {" "}
              <span className="font-semibold text-accent">
                You have {myOpenBids} open bid{myOpenBids === 1 ? "" : "s"}.
              </span>
            </>
          )}
        </p>
      </header>

      {/* Live / Sold */}
      <div className="mb-5 flex gap-5 border-b border-rule">
        <Tab label={`Live (${live.length})`} on={tab === "live"} onClick={() => setTab("live")} />
        <Tab label={`Sold (${sold.length})`} on={tab === "sold"} onClick={() => setTab("sold")} />
      </div>

      {/* Toolbar */}
      <div
        className="mb-5 flex flex-wrap items-center gap-2.5"
        style={{ animation: "slideUp 0.25s ease 0.04s both" }}
      >
        <SearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search model, reg no, territory…"
          className="min-w-[210px] flex-1 sm:max-w-xs"
        />

        <select
          className="field w-auto"
          value={grade}
          onChange={(e) => setGrade(e.target.value as VehicleGrade | "all")}
          aria-label="Filter by grade"
        >
          <option value="all">All grades</option>
          {(["A", "B", "C", "D"] as VehicleGrade[]).map((g) => (
            <option key={g} value={g}>
              Grade {g} · {GRADE_META[g].label}
            </option>
          ))}
        </select>

        {makes.length > 1 && (
          <select
            className="field w-auto"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            aria-label="Filter by make"
          >
            <option value="all">All makes</option>
            {makes.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}

        {territories.length > 1 && (
          <select
            className="field w-auto"
            value={territory}
            onChange={(e) => setTerritory(e.target.value)}
            aria-label="Filter by territory"
          >
            <option value="all">All territories</option>
            {territories.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        <select
          className="field w-auto"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort"
        >
          <option value="newest">Newest first</option>
          <option value="price-high">Price: high to low</option>
          <option value="price-low">Price: low to high</option>
          <option value="name">Model A–Z</option>
        </select>

        {filtersOn && (
          <button className="btn btn-ghost btn-sm" onClick={clear}>
            <X size={13} /> Clear
          </button>
        )}

        <div className="ml-auto flex overflow-hidden rounded-lg border border-rule-strong">
          <ViewBtn on={view === "grid"} onClick={() => setView("grid")} label="Grid view">
            <LayoutGrid size={15} />
          </ViewBtn>
          <ViewBtn on={view === "list"} onClick={() => setView("list")} label="List view" divider>
            <Rows3 size={15} />
          </ViewBtn>
        </div>
      </div>

      {list.length === 0 ? (
        <Empty tab={tab} filtered={filtersOn} onClear={clear} />
      ) : view === "grid" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((v, i) => (
            <GridCard
              key={v.id}
              v={v}
              i={i}
              canBid={canBid}
              seesAllBids={seesAllBids}
              onBid={() => setBidding(v)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {list.map((v, i) => (
            <ListRow
              key={v.id}
              v={v}
              i={i}
              canBid={canBid}
              seesAllBids={seesAllBids}
              onBid={() => setBidding(v)}
            />
          ))}
        </div>
      )}

      {list.length > 0 && (
        <p className="mt-6 text-center font-mono text-[11px] text-ink-3">
          {list.length === pool.length
            ? `${fmtNumber(pool.length)} vehicle${pool.length === 1 ? "" : "s"}`
            : `${list.length} of ${pool.length} shown`}
        </p>
      )}

      {bidding && (
        <BidModal
          vehicleId={bidding.id}
          title={bidding.title}
          make={bidding.make}
          registrationNo={bidding.registrationNo}
          approvedPrice={bidding.approvedPrice}
          currentBid={bidding.myBid?.amount ?? null}
          onClose={() => setBidding(null)}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cards
// ---------------------------------------------------------------------------

function Hero({ v, tall }: { v: MarketVehicle; tall?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden bg-surface-3 ${tall ? "aspect-[16/10]" : "h-full"}`}
      style={{ minHeight: tall ? undefined : 104 }}
    >
      {v.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={v.imageUrl}
          alt={v.title}
          loading="lazy"
          width={960}
          height={600}
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      ) : (
        <div
          className="grid h-full w-full place-items-center"
          style={{
            background: "linear-gradient(135deg, var(--surface-3), var(--surface-2))",
          }}
        >
          <Truck size={tall ? 40 : 24} className="text-ink-3" strokeWidth={1.4} />
        </div>
      )}

      {/* grade */}
      {v.grade && (
        <span
          className="absolute left-2.5 top-2.5 rounded-md px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-wide backdrop-blur"
          style={{
            background: "rgba(255,255,255,0.92)",
            color: `var(--${GRADE_META[v.grade].tone === "neutral" ? "ink-2" : GRADE_META[v.grade].tone})`,
          }}
        >
          Grade {v.grade}
        </span>
      )}

      {/* photo count */}
      {tall && v.photoCount > 0 && (
        <span
          className="absolute right-2.5 top-2.5 flex items-center gap-1 rounded-md px-1.5 py-1 font-mono text-[10px] font-semibold backdrop-blur"
          style={{ background: "rgba(19,26,34,0.6)", color: "#fff" }}
        >
          <Images size={11} /> {v.photoCount}
        </span>
      )}

      {/* sold veil */}
      {v.sold && (
        <div className="absolute inset-0 grid place-items-center" style={{ background: "rgba(19,26,34,0.55)" }}>
          <span
            className="rounded-lg px-3 py-1.5 font-display text-sm font-bold uppercase tracking-widest"
            style={{ background: "var(--ok)", color: "#fff" }}
          >
            Sold
          </span>
        </div>
      )}
    </div>
  );
}

function Specs({ v }: { v: MarketVehicle }) {
  return (
    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 font-mono text-[10px] text-ink-3">
      {v.year && (
        <span className="flex items-center gap-1">
          <Calendar size={10} /> {v.year}
        </span>
      )}
      {v.mileage && (
        <span className="flex items-center gap-1">
          <Gauge size={10} /> {v.mileage} km
        </span>
      )}
      {v.territory && (
        <span className="flex items-center gap-1">
          <MapPin size={10} /> {v.territory}
        </span>
      )}
    </div>
  );
}

function Title({ v }: { v: MarketVehicle }) {
  return (
    <div className="flex items-start justify-between gap-2">
      <h3 className="min-w-0 font-display text-lg font-bold leading-tight text-ink">
        {v.title}
      </h3>
      {v.make && (
        <span
          className="shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide"
          style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}
        >
          {v.make}
        </span>
      )}
    </div>
  );
}

/** Price block + bid state + CTA — shared by both card layouts. */
function Money({
  v,
  canBid,
  seesAllBids,
  onBid,
}: {
  v: MarketVehicle;
  canBid: boolean;
  seesAllBids: boolean;
  onBid: () => void;
}) {
  if (v.sold) {
    return (
      <div className="mt-3 border-t border-rule pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <div className="min-w-0">
            <div className="label mb-0.5">Sold for</div>
            <div
              className="truncate font-display text-[19px] font-bold tnum"
              style={{ color: "var(--ok)", letterSpacing: "-0.02em" }}
            >
              {takaCompact(v.winningAmount)}
            </div>
          </div>
          {v.iWon === true ? (
            <span className="chip chip-ok">
              <Trophy size={11} /> You won
            </span>
          ) : v.myBid ? (
            <span className="chip chip-neutral">Outbid</span>
          ) : null}
        </div>
        {v.winnerName && (
          <div className="mt-1.5 font-mono text-[10px] text-ink-3">
            {v.winnerName} · {shortDate(v.soldAt)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mt-3 border-t border-rule pt-3">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="label mb-0.5">Asking</div>
          <div
            className="truncate font-display text-[19px] font-bold tnum text-ink"
            style={{ letterSpacing: "-0.02em" }}
          >
            {takaCompact(v.approvedPrice)}
          </div>
        </div>

        {seesAllBids ? (
          <div className="shrink-0 text-right">
            <div className="label mb-0.5">Top bid</div>
            <div
              className="font-mono text-[13px] font-semibold tnum"
              style={{ color: v.topBid ? "var(--accent)" : "var(--ink-3)" }}
            >
              {v.topBid ? takaCompact(v.topBid) : "—"}
            </div>
            {v.bidderCount !== null && v.bidderCount > 0 && (
              <div className="font-mono text-[9px] text-ink-3">
                {v.bidderCount} bidder{v.bidderCount === 1 ? "" : "s"}
              </div>
            )}
          </div>
        ) : v.myBid ? (
          <div className="shrink-0 text-right">
            <div className="label mb-0.5">Your bid</div>
            <div className="font-mono text-[13px] font-semibold tnum" style={{ color: "var(--accent)" }}>
              {takaCompact(v.myBid.amount)}
            </div>
          </div>
        ) : null}
      </div>

      {canBid && (
        <button
          className={`btn btn-block mt-3 ${v.myBid ? "btn-ghost" : "btn-primary"}`}
          onClick={onBid}
        >
          <Gavel size={15} /> {v.myBid ? "Update bid" : "Place bid"}
        </button>
      )}
    </div>
  );
}

function GridCard({
  v,
  i,
  canBid,
  seesAllBids,
  onBid,
}: {
  v: MarketVehicle;
  i: number;
  canBid: boolean;
  seesAllBids: boolean;
  onBid: () => void;
}) {
  return (
    <article
      className="card card-lift group flex flex-col overflow-hidden p-0 aura-glass transition-all duration-300 hover:scale-[1.02]"
      style={{ animation: `slideUp 0.25s ease ${Math.min(i, 12) * 0.04}s both` }}
    >
      <Link href={`/vehicles/${v.id}`} className="block">
        <Hero v={v} tall />
      </Link>

      <div className="flex flex-1 flex-col p-4">
        <Link href={`/vehicles/${v.id}`} className="block">
          <Title v={v} />
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">{v.registrationNo}</p>
          <Specs v={v} />
        </Link>
        <div className="flex-1" />
        <Money v={v} canBid={canBid} seesAllBids={seesAllBids} onBid={onBid} />
      </div>
    </article>
  );
}

function ListRow({
  v,
  i,
  canBid,
  seesAllBids,
  onBid,
}: {
  v: MarketVehicle;
  i: number;
  canBid: boolean;
  seesAllBids: boolean;
  onBid: () => void;
}) {
  return (
    <article
      className="card card-lift group grid grid-cols-[120px_1fr] overflow-hidden p-0 sm:grid-cols-[190px_1fr] aura-glass transition-all duration-300 hover:scale-[1.01]"
      style={{ animation: `fadeIn 0.2s ease ${Math.min(i, 12) * 0.03}s both` }}
    >
      <Link href={`/vehicles/${v.id}`} className="block">
        <Hero v={v} />
      </Link>
      <div className="flex flex-col p-4 sm:flex-row sm:items-center sm:gap-6">
        <Link href={`/vehicles/${v.id}`} className="min-w-0 flex-1">
          <Title v={v} />
          <p className="mt-0.5 font-mono text-[11px] text-ink-3">{v.registrationNo}</p>
          <Specs v={v} />
        </Link>
        <div className="sm:w-56 sm:shrink-0">
          <Money v={v} canBid={canBid} seesAllBids={seesAllBids} onBid={onBid} />
        </div>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------

function Tab({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="-mb-px border-b-2 pb-2.5 text-sm font-semibold transition-colors"
      style={
        on
          ? { borderColor: "var(--accent)", color: "var(--accent)" }
          : { borderColor: "transparent", color: "var(--ink-3)" }
      }
    >
      {label}
    </button>
  );
}

function ViewBtn({
  on,
  onClick,
  label,
  divider,
  children,
}: {
  on: boolean;
  onClick: () => void;
  label: string;
  divider?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      className={`grid h-9 w-9 place-items-center transition-colors ${divider ? "border-l border-rule-strong" : ""}`}
      style={
        on
          ? { background: "var(--accent)", color: "var(--on-accent)" }
          : { background: "var(--surface)", color: "var(--ink-3)" }
      }
    >
      {children}
    </button>
  );
}

function Empty({
  tab,
  filtered,
  onClear,
}: {
  tab: "live" | "sold";
  filtered: boolean;
  onClear: () => void;
}) {
  return (
    <div
      className="card grid place-items-center gap-3 px-6 py-20 text-center aura-glass aura-float"
      style={{ animation: "fadeIn 0.3s ease" }}
    >
      <div className="grid h-16 w-16 place-items-center rounded-full bg-surface-2">
        {tab === "sold" ? (
          <CheckCircle2 size={30} className="text-ink-3" strokeWidth={1.6} />
        ) : (
          <Store size={30} className="text-ink-3" strokeWidth={1.6} />
        )}
      </div>
      <p className="text-sm font-medium text-ink-2">
        {filtered
          ? "No vehicles match these filters."
          : tab === "sold"
            ? "Nothing has been sold yet."
            : "No vehicles are live for resale yet."}
      </p>
      {filtered && (
        <button className="btn btn-ghost btn-sm" onClick={onClear}>
          <Tag size={13} /> Clear filters
        </button>
      )}
    </div>
  );
}
