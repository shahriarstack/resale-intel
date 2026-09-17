"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarClock,
  Gavel,
  Loader2,
  PauseCircle,
  RefreshCw,
  SearchX,
  Store,
  Trophy,
  Users,
  X,
} from "lucide-react";
import type { ResaleVehicle } from "@/lib/resaleDesk";
import { sendJSON } from "@/lib/http";
import { taka, takaCompact, shortDate } from "@/lib/format";
import { offerFor, offererCount } from "@/lib/bids";
import { NumberField } from "@/components/ui/NumberField";
import { OfferBook, OfferIdentity } from "@/components/register/OfferBook";
import { defaultCycleEnd, MAX_EXTENSION_DAYS } from "@/lib/resale";
import { Chip } from "@/components/ui/Chip";
import { SearchBar } from "@/components/ui/SearchBar";
import { PanelHero } from "@/components/ui/PanelHero";
import { StatTile } from "@/components/ui/StatTile";
import { useToast } from "@/components/ui/Toast";
import { usePersistedEnum } from "@/lib/usePersisted";

/**
 * The Sr. Executive's resale desk.
 *
 * Two tabs for two different jobs. "On the market" is about choosing a buyer:
 * pick a vehicle, read every standing offer, sell to one of them. "Held" is
 * about the month turning over: the vehicles that did not sell, waiting to be
 * re-priced and put back.
 *
 * A master–detail layout rather than a table, because the decision needs both
 * halves at once — you cannot choose an offer without the vehicle's cost in
 * front of you, and you cannot judge the cost without seeing what was bid.
 */

type Tab = "market" | "held";
const TABS = ["market", "held"] as const;

export function ResaleDesk({
  onMarket,
  held,
  commonCycleEnd,
}: {
  onMarket: ResaleVehicle[];
  held: ResaleVehicle[];
  commonCycleEnd: string | null;
}) {
  const [tab, setTab] = usePersistedEnum<Tab>("ri:resale:tab", TABS, "market");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const list = tab === "market" ? onMarket : held;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (v) =>
        v.name.toLowerCase().includes(q) ||
        v.registrationNo.toLowerCase().includes(q) ||
        (v.territory ?? "").toLowerCase().includes(q) ||
        v.offers.some(
          (o) =>
            o.officerName.toLowerCase().includes(q) ||
            (o.customerName ?? "").toLowerCase().includes(q) ||
            (o.officerTerritory ?? "").toLowerCase().includes(q),
        ),
    );
  }, [list, search]);

  const open = filtered.find((v) => v.id === openId) ?? null;

  const marketValue = onMarket.reduce((s, v) => s + (v.askingPrice ?? 0), 0);
  const withOffers = onMarket.filter((v) => v.offers.length > 0).length;
  const heldValue = held.reduce((s, v) => s + (v.askingPrice ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-[1580px] px-5 py-6 lg:px-7">
      <PanelHero
        eyebrow="Resale"
        title="Sell & hold"
        subtitle="Choose the buyer for what is on the market, and re-price what came off it."
        art="desk"
      />

      <div className="stagger mt-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile
          icon={<Store size={17} />}
          tint="accent"
          label="On the market"
          value={onMarket.length}
          caption={marketValue > 0 ? `${takaCompact(marketValue)} asking` : "nothing listed"}
          onClick={() => { setTab("market"); setOpenId(null); }}
          active={tab === "market"}
        />
        <StatTile
          icon={<Users size={17} />}
          tint={withOffers > 0 ? "info" : "neutral"}
          label="With offers"
          value={withOffers}
          caption={`${onMarket.length - withOffers} with none yet`}
        />
        <StatTile
          icon={<PauseCircle size={17} />}
          tint={held.length > 0 ? "warn" : "neutral"}
          label="Held"
          value={held.length}
          caption={heldValue > 0 ? `${takaCompact(heldValue)} off market` : "none held"}
          onClick={() => { setTab("held"); setOpenId(null); }}
          active={tab === "held"}
        />
        <HoldDateTile commonCycleEnd={commonCycleEnd} liveCount={onMarket.length + held.length} />
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        <div className="seg" role="group" aria-label="Resale view">
          <button
            className="seg-btn"
            data-on={tab === "market"}
            onClick={() => { setTab("market"); setOpenId(null); }}
          >
            <Store size={12} />
            On the market
            <span className="ml-1.5 font-mono text-[10px] opacity-60">{onMarket.length}</span>
          </button>
          <button
            className="seg-btn"
            data-on={tab === "held"}
            onClick={() => { setTab("held"); setOpenId(null); }}
          >
            <PauseCircle size={12} />
            Held
            <span className="ml-1.5 font-mono text-[10px] opacity-60">{held.length}</span>
          </button>
        </div>
        <div className="min-w-[200px] flex-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search vehicle, registration, territory or bidder…"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="card mt-3.5 py-14 text-center">
          <SearchX size={22} className="mx-auto mb-2 text-ink-3" />
          <p className="text-[13px] text-ink-2">
            {search.trim()
              ? "Nothing matches that search."
              : tab === "market"
                ? "Nothing is on the marketplace right now."
                : "Nothing is held — every listed vehicle is inside its pricing month."}
          </p>
        </div>
      ) : (
        <div className="resale-split mt-3.5">
          {/* ---- Compact list ---- */}
          <ul className="resale-list">
            {filtered.map((v) => (
              <li key={v.id}>
                <button
                  className="resale-row"
                  data-open={openId === v.id}
                  onClick={() => setOpenId(openId === v.id ? null : v.id)}
                  aria-expanded={openId === v.id}
                >
                  <span className="resale-thumb">
                    {v.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.imageUrl} alt="" width={96} height={96} loading="lazy" />
                    ) : (
                      <Store size={15} className="text-ink-3" />
                    )}
                  </span>

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-1.5">
                      <span className="truncate text-[13px] font-semibold text-ink">{v.name}</span>
                      {v.grade && (
                        <span className="font-mono text-[9px] text-ink-3">{v.grade}</span>
                      )}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-ink-3">
                      {v.registrationNo}
                      {v.territory ? ` · ${v.territory}` : ""}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block font-mono text-[12px] font-bold tabular-nums text-ink">
                      {takaCompact(v.askingPrice)}
                    </span>
                    {v.offers.length > 0 ? (
                      <span className="block font-mono text-[9.5px] text-ok">
                        {v.offers.length} offer{v.offers.length === 1 ? "" : "s"} ·{" "}
                        {takaCompact(v.topOffer)}
                      </span>
                    ) : (
                      <span className="block font-mono text-[9.5px] text-ink-3">no offers</span>
                    )}
                  </span>

                  <span className="shrink-0">
                    {v.onHold ? (
                      <Chip tone="bad">{Math.abs(v.daysLeft ?? 0)}d held</Chip>
                    ) : v.daysLeft !== null && v.daysLeft <= 3 ? (
                      <Chip tone="warn">{v.daysLeft}d left</Chip>
                    ) : (
                      <Chip tone="neutral">{v.daysLeft ?? "—"}d</Chip>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          {/* ---- Detail ---- */}
          <div className="resale-detail">
            {open ? (
              tab === "market" ? (
                <SellPanel key={open.id} v={open} onDone={() => setOpenId(null)} />
              ) : (
                <ActivatePanel key={open.id} v={open} onDone={() => setOpenId(null)} />
              )
            ) : (
              <div className="card grid place-items-center px-6 py-16 text-center">
                <div>
                  {tab === "market" ? (
                    <Gavel size={22} className="mx-auto mb-2 text-ink-3" />
                  ) : (
                    <RefreshCw size={22} className="mx-auto mb-2 text-ink-3" />
                  )}
                  <p className="text-[13px] text-ink-2">
                    {tab === "market"
                      ? "Pick a vehicle to see every offer and choose a buyer."
                      : "Pick a held vehicle to re-price it and put it back on the market."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sell — every standing offer, and the decision
// ---------------------------------------------------------------------------

function SellPanel({ v, onDone }: { v: ResaleVehicle; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [chosen, setChosen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /**
   * The commission as finally agreed.
   *
   * Seeded from the figure set when the vehicle was priced, months back and
   * against an expected sale. What the dealer is actually paid is settled with
   * the buyer here, so this is the last moment the number can be made true —
   * and the margin beneath it moves as it is typed, because a commission
   * agreed without seeing what it does to the margin is a commission agreed
   * blind.
   */
  const [commission, setCommission] = useState(String(v.dealerCommission));

  const winner = v.offers.find((o) => o.id === chosen) ?? null;
  const settled = commission.trim() === "" ? 0 : Number(commission);
  const commissionMoved = settled !== v.dealerCommission;
  // The cost basis with the old commission swapped for the settled one.
  const finalCost = v.totalCost - v.dealerCommission + settled;
  const proceeds = winner ? winner.amount - finalCost : null;
  // Several offers from one officer is normal — they are fronting several
  // buyers — so the header counts customers and officers separately.
  const officerCount = offererCount(v.offers);

  const award = async () => {
    if (!winner) return;
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${v.id}/award`, "POST", {
        bidId: winner.id,
        // Sent only when it actually moved: omitted means "unchanged", which
        // the route can tell apart from a deliberate zero.
        ...(commissionMoved ? { dealerCommission: settled } : {}),
      });
      toast(`${v.name} sold to ${offerFor(winner)}`, "ok");
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not close the sale");
      setBusy(false);
    }
  };

  return (
    <div className="card p-4">
      <VehicleHead v={v} />

      <div className="insight-rule" />

      <div className="mb-2 flex items-baseline justify-between">
        <span className="label">Customer offers</span>
        <span className="font-mono text-[10px] text-ink-3">
          {v.offers.length === 0
            ? "none yet"
            : `${v.offers.length} customer${v.offers.length === 1 ? "" : "s"} · ${officerCount} officer${officerCount === 1 ? "" : "s"}`}
        </span>
      </div>

      {v.offers.length === 0 ? (
        <p className="insight-empty">
          No officer has put a customer forward on this vehicle. There is nobody to sell to yet —
          the asking price may be worth revisiting.
        </p>
      ) : (
        <OfferBook
          offers={v.offers}
          asking={v.askingPrice}
          selectedId={chosen}
          onSelect={(o) => setChosen(chosen === o.id ? null : o.id)}
        />
      )}

      {winner && (
        <div className="mt-3 rounded-[var(--radius)] border border-rule bg-surface-2 p-3">
          <div className="mb-2.5 border-b border-rule pb-2.5">
            <OfferIdentity o={winner} />
          </div>
          <div className="flex items-baseline justify-between text-[12px]">
            <span className="text-ink-2">Sale price</span>
            <span className="tnum text-ink">{taka(winner.amount)}</span>
          </div>
          <div className="mt-1 flex items-baseline justify-between text-[12px]">
            <span className="text-ink-2">Cost before commission</span>
            <span className="tnum text-ink">{taka(v.totalCost - v.dealerCommission)}</span>
          </div>

          {/* The one cost still open at this moment. */}
          <label className="label mb-1 mt-2.5 block" htmlFor={`comm-final-${v.id}`}>
            Dealer commission — as agreed
          </label>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[12px] text-ink-3">Tk</span>
            <NumberField
              id={`comm-final-${v.id}`}
              className="field h-9 flex-1 py-0 font-mono text-sm tnum"
              value={commission}
              onChange={setCommission}
              placeholder="0"
            />
          </div>
          <p className="mt-1 text-[11px] leading-snug text-ink-3">
            {commissionMoved ? (
              <>
                Set at {taka(v.dealerCommission)} when the vehicle was priced. Closing at{" "}
                {taka(settled)} — the new figure is written with the sale.
              </>
            ) : (
              <>Set at pricing. Change it here if the dealer settled at something else.</>
            )}
          </p>

          <div className="mt-2 flex items-baseline justify-between text-[12px]">
            <span className="text-ink-2">Total cost</span>
            <span className="tnum text-ink">{taka(finalCost)}</span>
          </div>
          <div className="mt-1.5 flex items-baseline justify-between border-t border-rule pt-1.5 text-[13px] font-semibold">
            <span className="text-ink">Realised margin</span>
            <span
              className="tnum"
              style={{ color: (proceeds ?? 0) >= 0 ? "var(--ok)" : "var(--bad)" }}
            >
              {taka(proceeds)}
            </span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <button
        className="btn btn-gradient btn-block mt-3"
        onClick={award}
        disabled={!winner || busy}
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : winner ? (
          <>
            <Trophy size={15} />
            Sell to {offerFor(winner)}
          </>
        ) : (
          "Choose an offer to sell"
        )}
      </button>
      <p className="mt-1.5 text-center font-mono text-[9.5px] text-ink-3">
        This is terminal — the vehicle leaves the marketplace.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activate — re-price a held vehicle and put it back
// ---------------------------------------------------------------------------

function ActivatePanel({ v, onDone }: { v: ResaleVehicle; onDone: () => void }) {
  const router = useRouter();
  const { toast } = useToast();
  const [sop, setSop] = useState(String(v.sopCost || ""));
  const [commission, setCommission] = useState(String(v.dealerCommission || ""));
  const [busy, setBusy] = useState<null | "reprice" | "asis">(null);
  const [error, setError] = useState("");

  const sopValue = parseFloat(sop) || 0;
  const commissionValue = parseFloat(commission) || 0;
  const base = v.totalCost - v.sopCost - v.dealerCommission;
  const newTotal = base + sopValue + commissionValue;
  const newMargin = v.askingPrice === null ? null : v.askingPrice - newTotal;
  const moved = sopValue - v.sopCost + (commissionValue - v.dealerCommission);

  const run = async (reprice: boolean) => {
    setBusy(reprice ? "reprice" : "asis");
    setError("");
    try {
      if (reprice) {
        await sendJSON(`/api/vehicles/${v.id}/sop`, "POST", {
          sopCost: sopValue,
          dealerCommission: commissionValue,
          relist: true,
        });
      } else {
        await sendJSON(`/api/vehicles/${v.id}/resale-cycle`, "POST", {
          endsAt: defaultCycleEnd().toISOString(),
        });
      }
      toast(`${v.name} is back on the market`, "ok");
      onDone();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not activate");
      setBusy(null);
    }
  };

  return (
    <div className="card p-4">
      <VehicleHead v={v} />

      <div className="mt-3 flex items-start gap-2 rounded-[var(--radius)] border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
        <PauseCircle size={15} className="mt-0.5 shrink-0" />
        <span className="text-[11.5px] leading-snug">
          Held for {Math.abs(v.daysLeft ?? 0)} days. Carrying it another month costs money — revise
          the figures before it goes back up.
        </span>
      </div>

      <div className="insight-rule" />

      <label className="label mb-1.5 block" htmlFor={`sop-${v.id}`}>
        SOP cost (Tk)
      </label>
      <NumberField
        id={`sop-${v.id}`}
        className="field tnum font-semibold"
        value={sop}
        onChange={setSop}
      />

      <label className="label mb-1.5 mt-3 block" htmlFor={`comm-${v.id}`}>
        Dealer commission (Tk)
      </label>
      <NumberField
        id={`comm-${v.id}`}
        className="field tnum font-semibold"
        value={commission}
        onChange={setCommission}
      />

      <div className="mt-3 rounded-[var(--radius)] border border-rule bg-surface-2 p-3 text-[12px]">
        <div className="flex justify-between text-ink-2">
          <span>New total cost</span>
          <span className="tnum text-ink">{taka(newTotal)}</span>
        </div>
        {moved !== 0 && (
          <div className="mt-1 flex justify-between text-ink-3">
            <span>Carrying cost added</span>
            <span className="tnum" style={{ color: moved > 0 ? "var(--warn)" : "var(--ok)" }}>
              {moved > 0 ? "+" : ""}
              {taka(moved)}
            </span>
          </div>
        )}
        {newMargin !== null && (
          <div className="mt-1.5 flex justify-between border-t border-rule pt-1.5 font-semibold">
            <span className="text-ink">Margin at {takaCompact(v.askingPrice)}</span>
            <span className="tnum" style={{ color: newMargin >= 0 ? "var(--ok)" : "var(--bad)" }}>
              {taka(newMargin)}
            </span>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <button
        className="btn btn-gradient btn-block mt-3"
        onClick={() => run(true)}
        disabled={busy !== null}
      >
        {busy === "reprice" ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            <RefreshCw size={15} />
            Re-price &amp; activate
          </>
        )}
      </button>

      {/* Kept deliberately quiet. Activating without revising is legitimate —
          a vehicle held over a weekend has not really cost another month — but
          it should not be the obvious button. */}
      <button
        className="btn btn-ghost btn-sm btn-block mt-2"
        onClick={() => run(false)}
        disabled={busy !== null}
      >
        {busy === "asis" ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          "Activate without changing the price"
        )}
      </button>

      <Link
        href={`/vehicles/${v.id}`}
        className="mt-2 block text-center font-mono text-[10px] text-ink-3 transition-colors hover:text-accent"
      >
        Open the full record
      </Link>
    </div>
  );
}

// ---------------------------------------------------------------------------

function VehicleHead({ v }: { v: ResaleVehicle }) {
  return (
    <div className="flex items-start gap-3">
      <span className="resale-hero">
        {v.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.imageUrl} alt="" width={160} height={120} />
        ) : (
          <Store size={20} className="text-ink-3" />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="truncate font-display text-[17px] font-bold leading-tight text-ink">
          {v.name}
        </h3>
        <p className="font-mono text-[10.5px] text-ink-3">
          {v.registrationNo}
          {v.make ? ` · ${v.make}` : ""}
          {v.year ? ` · ${v.year}` : ""}
        </p>
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="font-display text-[18px] font-bold tabular-nums text-ink">
            {takaCompact(v.askingPrice)}
          </span>
          <span className="font-mono text-[10px] text-ink-3">
            cost {takaCompact(v.totalCost)} · listed {v.daysListed}d
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The marketplace-wide hold date.
 *
 * A tile rather than a button in a toolbar: the date every live vehicle comes
 * off the market on is a standing fact about the desk, so it belongs beside
 * the other standing facts — and it opens the control that changes it.
 */
function HoldDateTile({
  commonCycleEnd,
  liveCount,
}: {
  commonCycleEnd: string | null;
  liveCount: number;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const suggested = defaultCycleEnd();
  const iso = (d: Date) => {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  };

  const apply = async (value: string) => {
    if (!value) {
      setError("Pick a date.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      // End of the chosen day, so "hold on the 1st" means the 1st is the first
      // day they are off the market, not the last day they are on it.
      const [y, m, d] = value.split("-").map(Number);
      const endsAt = new Date(y, m - 1, d, 0, 0, 0, 0);
      const res = await sendJSON<{ updated: number; unchanged: number }>(
        "/api/resale/hold-date",
        "POST",
        { endsAt: endsAt.toISOString() },
      );
      toast(
        res.updated === 0
          ? "Every vehicle already holds on that date"
          : `${res.updated} vehicle${res.updated === 1 ? "" : "s"} will hold on ${shortDate(endsAt)}`,
        "ok",
      );
      setOpen(false);
      setDate("");
      setBusy(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not set the hold date");
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="stat-tile text-left"
        style={{
          ["--tint-from" as string]: "var(--tint-warn-from)",
          ["--tint-to" as string]: "var(--tint-warn-to)",
          ["--tint-accent" as string]: "var(--tint-warn-ink)",
        }}
        onClick={() => {
          setDate(commonCycleEnd ? iso(new Date(commonCycleEnd)) : iso(suggested));
          setOpen(true);
        }}
      >
        <span className="stat-glyph">
          <CalendarClock size={17} />
        </span>
        <div className="pr-6 font-mono text-[9px] uppercase tracking-[0.13em] text-ink-3">
          Auto-hold on
        </div>
        <div className="mt-1.5 font-display text-[19px] font-bold leading-none text-ink">
          {commonCycleEnd ? shortDate(commonCycleEnd) : "Mixed"}
        </div>
        <div className="mt-1 truncate font-mono text-[9px] text-ink-3">
          {commonCycleEnd ? "tap to change" : "dates differ · tap to align"}
        </div>
      </button>

      {open && (
        <div className="backdrop backdrop-center" onClick={() => !busy && setOpen(false)}>
          <div className="modal-panel p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-display text-[17px] font-bold text-ink">Marketplace hold date</h3>
                <p className="mt-1 text-[12px] leading-relaxed text-ink-2">
                  Every listed vehicle comes off the market on this date and waits to be re-priced.
                  Applies to all {liveCount} live {liveCount === 1 ? "vehicle" : "vehicles"} at once.
                </p>
              </div>
              <button
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-3 hover:text-ink"
                onClick={() => setOpen(false)}
                aria-label="Close"
                disabled={busy}
              >
                <X size={16} />
              </button>
            </div>

            <label className="label mb-1.5 mt-4 block" htmlFor="hold-date">
              Hold from
            </label>
            <input
              id="hold-date"
              type="date"
              className="field"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />

            <button
              className="mt-2 w-full rounded-lg border border-dashed border-rule-strong px-3 py-2 text-left text-[11.5px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
              onClick={() => setDate(iso(suggested))}
            >
              Use the 1st of next month — {shortDate(suggested)}
            </button>

            <p className="mt-2 font-mono text-[9.5px] text-ink-3">
              At most {MAX_EXTENSION_DAYS} days out.
            </p>

            {error && (
              <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink" role="alert">
                <AlertCircle size={15} className="mt-0.5 shrink-0" />
                <span className="text-xs font-medium">{error}</span>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={busy}>
                Cancel
              </button>
              <button className="btn btn-gradient" onClick={() => apply(date)} disabled={busy}>
                {busy ? <Loader2 size={16} className="animate-spin" /> : "Set for all"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
