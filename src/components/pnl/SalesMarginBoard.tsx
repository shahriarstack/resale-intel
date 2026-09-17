"use client";

import { useMemo, useState } from "react";
import {
  BadgeDollarSign,
  CalendarRange,
  Coins,
  Download,
  Layers,
  MapPin,
  Percent,
  TrendingDown,
  Scale,
  Timer,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { StatTile } from "@/components/ui/StatTile";
import { ConsolePage, ConsoleSection } from "@/components/recovery/ConsolePage";
import { MonthChart } from "@/components/pnl/MonthChart";
import { TerritoryPnlTable } from "@/components/pnl/TerritoryPnlTable";
import { CostWaterfall } from "@/components/pnl/CostWaterfall";
import { Highlights } from "@/components/pnl/Highlights";
import { TrendChart } from "@/components/pnl/TrendChart";
import { millions } from "@/lib/format";
import { CSV_BOM, toCsv, stamp } from "@/lib/csv";
import {
  byDimension,
  byMonth,
  byTerritoryMonth,
  monthLabel,
  monthSpan,
  rollUp,
  type ResalePnl,
  type SoldUnit,
} from "@/lib/resalePnl";

/**
 * The realised resale book.
 *
 * Everything is computed on the client from one payload. The sold book is a
 * closed set that grows by a few dozen rows a month, so shipping it whole and
 * re-aggregating on each filter change costs one small download and makes
 * every control instant — where a server round trip per filter would make the
 * page feel like a report you query rather than a book you leaf through.
 *
 * Margin, as the business defines it:
 *
 *   margin = sold value − (SOP + registration + service + other + commission)
 *
 * The same five lines `computeBreakdown` sums on the vehicle screen — one
 * definition, deliberately, because two totals for one vehicle would make both
 * unbelievable. Note what is NOT in it: a sold vehicle carries no acquisition
 * or outstanding-loan value on its record, so this is margin over the cost of
 * getting the vehicle sold, not over what was lent against it.
 *
 * Dealer commission is the one line still open at the moment of sale — set
 * months earlier at pricing, settled with the buyer at the close — so these
 * figures move when a sale is confirmed. That is correct: the commission in
 * the basis is the one actually paid.
 *
 * The figure that does discriminate is REALISATION — sold against the approved
 * asking price. That is a like-for-like comparison of two numbers the business
 * controls, and it is where a weak territory actually shows up.
 */

type Range = "all" | "6" | "12";

export function SalesMarginBoard({ data }: { data: ResalePnl }) {
  const [range, setRange] = useState<Range>("12");
  const [month, setMonth] = useState<string | null>(null);
  const [territory, setTerritory] = useState<string>("all");

  // Every month between the first and last sale — including the empty ones,
  // so a dead month reads as a gap rather than being quietly skipped.
  const allMonths = useMemo(() => monthSpan(data.months), [data.months]);

  const windowMonths = useMemo(() => {
    if (range === "all") return allMonths;
    return allMonths.slice(-Number(range));
  }, [allMonths, range]);

  /** The rows the whole page is computed from. */
  const scoped = useMemo(() => {
    const inWindow = new Set(month ? [month] : windowMonths);
    return data.units.filter(
      (u) =>
        inWindow.has(u.month) &&
        (territory === "all" || u.territory === territory),
    );
  }, [data.units, windowMonths, month, territory]);

  /**
   * The same rows one period earlier, for the deltas on the tiles.
   *
   * Only when a FULL prior window of the same length exists. Comparing twelve
   * months against however many happen to precede them reads as growth when it
   * is really just a shorter window — the first cut of this page showed
   * "+500%" for exactly that reason. A partial comparison is worse than none,
   * so a short history gets no delta at all.
   */
  const previous = useMemo(() => {
    const span = windowMonths.length;
    const end = allMonths.length - span;
    const keys = month ? [prevMonth(month)] : allMonths.slice(end - span, end);
    if (keys.length === 0 || (!month && keys.length < span)) return null;
    const set = new Set(keys);
    const units = data.units.filter(
      (u) =>
        set.has(u.month) && (territory === "all" || u.territory === territory),
    );
    return units.length ? rollUp("prev", "Previous", units) : null;
  }, [data.units, allMonths, windowMonths, month, territory]);

  /** The window's rows regardless of which month is picked — for the trend. */
  const trendUnits = useMemo(() => {
    const inWindow = new Set(windowMonths);
    return data.units.filter(
      (u) => inWindow.has(u.month) && (territory === "all" || u.territory === territory),
    );
  }, [data.units, windowMonths, territory]);

  const now = useMemo(() => rollUp("now", "Current", scoped), [scoped]);
  const monthly = useMemo(
    () => byMonth(scoped, month ? [month] : windowMonths),
    [scoped, windowMonths, month],
  );
  // Territory is the only cut this desk acts on — see TerritoryPnlTable.
  const grouped = useMemo(() => byDimension(scoped, "territory"), [scoped]);

  /**
   * Each territory as its own monthly line.
   *
   * Always over the FULL window, never the single picked month: a trend drawn
   * across one month is a dot, and the reader who filtered to March still
   * wants to see how March compares with the months either side of it.
   */
  const trend = useMemo(
    () => byTerritoryMonth(trendUnits, windowMonths),
    [trendUnits, windowMonths],
  );

  const delta = (get: (b: typeof now) => number | null) => {
    if (!previous) return null;
    const a = get(previous);
    const b = get(now);
    if (a === null || b === null || a === 0) return null;
    // Rounded here: StatTile prints whatever it is given, and an unrounded
    // ratio renders as "500.421052631578%".
    return Math.round(((b - a) / Math.abs(a)) * 100);
  };

  const periodLabel = month
    ? monthLabel(month)
    : range === "all"
      ? `All ${allMonths.length} months`
      : `Last ${range} months`;

  const exportCsv = () => {
    const head = [
      "Registration",
      "Sold on",
      "Territory",
      "Sales officer",
      "Model",
      "As-is",
      "Asking price",
      "Sold price",
      "vs asking",
      "SOP",
      "Registration",
      "Service",
      "Other",
      "Dealer commission",
      "Total cost",
      "Margin",
      "Margin %",
      "Days held",
    ];
    const body = [...scoped]
      .sort((a, b) => b.soldAt.localeCompare(a.soldAt))
      .map((u: SoldUnit) => [
        u.registrationNo,
        u.soldAt.slice(0, 10),
        u.territory,
        u.officer,
        u.model,
        u.asIs ? "Yes" : "No",
        u.approvedPrice ?? "",
        u.soldPrice,
        u.realisation ?? "",
        u.sop,
        u.registration,
        u.service,
        u.other,
        u.commission,
        u.totalCost,
        u.margin,
        u.marginPct.toFixed(1),
        u.daysHeld ?? "",
      ]);
    // BOM first, or Excel opens a UTF-8 file as Windows-1252 and mangles every
    // territory name that is not plain ASCII.
    const csv = CSV_BOM + toCsv([head, ...body]);
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `resale-margin-${stamp()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ConsolePage
      eyebrow="Realised resale book"
      title="Sales & Margin"
      icon={BadgeDollarSign}
      intro="Every vehicle that has finished selling — what it fetched, what it cost, and where the book is earning."
      filter={
        <div className="pnl-filters">
          <div className="pnl-seg" role="group" aria-label="Period">
            <span className="pnl-seg-tag">
              <CalendarRange size={11} />
              Period
            </span>
            {(["6", "12", "all"] as Range[]).map((r) => (
              <button
                key={r}
                className="pnl-seg-btn"
                data-on={!month && range === r ? true : undefined}
                aria-pressed={!month && range === r}
                onClick={() => {
                  setRange(r);
                  setMonth(null);
                }}
              >
                {r === "all" ? "All time" : `${r} months`}
              </button>
            ))}
          </div>

          <label className="pnl-select">
            <span className="pnl-select-tag">Month</span>
            <select
              value={month ?? ""}
              onChange={(e) => setMonth(e.target.value || null)}
              aria-label="Specific month"
            >
              <option value="">Every month in period</option>
              {[...allMonths].reverse().map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
          </label>

          <label className="pnl-select">
            <span className="pnl-select-tag">
              <MapPin size={11} />
              Territory
            </span>
            <select
              value={territory}
              onChange={(e) => setTerritory(e.target.value)}
              aria-label="Territory"
            >
              <option value="all">All territories</option>
              {data.territories.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          {(month || territory !== "all") && (
            <button
              className="pnl-clear"
              onClick={() => {
                setMonth(null);
                setTerritory("all");
              }}
            >
              <X size={12} />
              Clear
            </button>
          )}
        </div>
      }
      actions={
        <button
          className="btn btn-ghost btn-sm"
          onClick={exportCsv}
          disabled={scoped.length === 0}
        >
          <Download size={14} />
          Export {scoped.length} sales
        </button>
      }
    >
      {/* ---- The book in six figures ---- */}
      <ConsoleSection
        title={periodLabel}
        hint={
          previous
            ? "Figures in millions of Taka. Change is against the period immediately before this one."
            : "Figures in millions of Taka. No earlier period to compare against."
        }
        actions={
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <Truck size={13} />
            {now.units} sold{territory !== "all" && ` in ${territory}`}
            {/* A sold vehicle with no recorded price is outside every figure on
                this page. Saying so is not optional — a reader who assumes the
                report covers the whole book will under-count it — but it is a
                footnote, so it is worn as one. */}
            {data.unpriced > 0 && (
              <span title={`${data.unpriced} sold vehicle${data.unpriced === 1 ? "" : "s"} had no winning offer recorded, so ${data.unpriced === 1 ? "it is" : "they are"} excluded from every figure here.`}>
                · {data.unpriced} unpriced, excluded
              </span>
            )}
          </span>
        }
      >
        {/* The readings sit inside an instrument frame — this page reports a
            closed book rather than queuing work, and it should not look like
            the consoles that do. */}
        <div className="pnl-instrument grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
          <StatTile
            icon={<Truck size={16} />}
            tint="accent"
            ground="solid"
            label="Trucks sold"
            value={now.units}
            caption={
              now.lossUnits ? `${now.lossUnits} sold at a loss` : "none at a loss"
            }
            trendPct={delta((b) => b.units)}
          />
          <StatTile
            icon={<Coins size={16} />}
            tint="info"
            ground="solid"
            label="Sales"
            value={now.soldValue}
            display={millions(now.soldValue)}
            caption={`${millions(now.avgPrice)} a truck`}
            trendPct={delta((b) => b.soldValue)}
          />
          <StatTile
            icon={<Layers size={16} />}
            tint="warn"
            ground="solid"
            label="Costs"
            value={now.cost}
            display={millions(now.cost)}
            caption={`SOP ${millions(now.sop)} + additional ${millions(now.cost - now.sop)}`}
            trendPct={delta((b) => b.cost)}
          />
          <StatTile
            icon={<TrendingUp size={16} />}
            tint={now.margin < 0 ? "bad" : "ok"}
            ground="solid"
            label="Profit"
            value={now.margin}
            display={millions(now.margin)}
            caption={`${millions(now.avgMargin)} a truck`}
            trendPct={delta((b) => b.margin)}
          />
          <StatTile
            icon={<Percent size={16} />}
            tint={(now.marginPct ?? 0) < 0 ? "bad" : "ok"}
            ground="solid"
            label="Profit rate"
            value={now.marginPct ?? 0}
            display={
              now.marginPct === null ? "—" : `${now.marginPct.toFixed(1)}%`
            }
            caption={
              now.multiple === null
                ? "of sales"
                : `${now.multiple.toFixed(2)}x back on every 1 spent`
            }
          />
          {/* Loss stands on its own tile rather than hiding inside the profit
              total. A book can net a healthy profit while a handful of trucks
              went out below cost, and those are the files somebody has to open
              — netting them away is how they stay unopened. */}
          <StatTile
            icon={<TrendingDown size={16} />}
            tint={now.lossValue > 0 ? "bad" : "neutral"}
            ground="solid"
            label="Loss"
            value={now.lossValue}
            display={now.lossValue > 0 ? millions(now.lossValue) : "0"}
            caption={
              now.lossUnits === 0
                ? "nothing sold below cost"
                : `${now.lossUnits} truck${now.lossUnits === 1 ? "" : "s"} sold below cost`
            }
          />
        </div>

        {/* What the charts below say, in sentences — see Highlights. */}
        <Highlights now={now} territories={grouped} />
      </ConsoleSection>

      {/* ---- Month by month ---- */}
      <ConsoleSection
        title="Month by month"
        hint="Sold value against the cost that earned it, and whether each month closed above or below the asking price. Click a month to filter the page to it."
        actions={
          month && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setMonth(null)}
            >
              <X size={13} />
              Showing {monthLabel(month)}
            </button>
          )
        }
      >
        <div className="card p-4">
          <MonthChart
            buckets={month ? byMonth(scoped, windowMonths) : monthly}
            picked={month}
            onPick={(k) => setMonth((m) => (m === k ? null : k))}
          />
        </div>
      </ConsoleSection>

      {/* ---- Territory trends ---- */}
      <ConsoleSection
        title="Territory trends"
        hint="Each territory's own line across the same months. Hover a name to follow it; switch what is plotted with the buttons."
        actions={
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <MapPin size={13} />
            {trend.length} territor{trend.length === 1 ? "y" : "ies"}
          </span>
        }
      >
        <div className="card p-4">
          <TrendChart series={trend} months={windowMonths} />
        </div>
      </ConsoleSection>

      {/* ---- Where the money went ---- */}
      <ConsoleSection
        title="Where the money went"
        hint="The profit formula, drawn to scale. Each bar is its share of sales, so what the costs take out of a sale is visible without doing the arithmetic."
        actions={
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <Scale size={13} />
            {now.multiple === null ? "—" : `${now.multiple.toFixed(2)}× return on cost`}
          </span>
        }
      >
        <div className="card p-4">
          <CostWaterfall bucket={now} />
        </div>
      </ConsoleSection>

      {/* ---- The cut ---- */}
      <ConsoleSection
        title="By sales territory"
        hint="The same period, split by territory. Every column sorts — click a heading."
        actions={
          <span className="flex items-center gap-1.5 text-[11.5px] text-ink-3">
            <Timer size={13} />
            {now.avgDaysHeld === null
              ? "—"
              : `${Math.round(now.avgDaysHeld)}d`}{" "}
            average hold
          </span>
        }
      >
        <TerritoryPnlTable rows={grouped} />
      </ConsoleSection>
    </ConsolePage>
  );
}

/** The month before `key`, as a key. */
function prevMonth(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
