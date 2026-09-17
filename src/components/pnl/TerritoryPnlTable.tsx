"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { millions, taka } from "@/lib/format";
import type { Bucket } from "@/lib/resalePnl";

/**
 * The book by sales territory.
 *
 * One dimension, deliberately. An earlier cut let the reader re-group by
 * officer and by model as well, and neither answered a question this desk
 * actually asks: territory is how the sales force is organised, how targets
 * are set, and who gets the phone call — so it is the only cut that leads to
 * an action. The extra switches made the table look configurable rather than
 * useful.
 *
 * This is also the charts' table view: every figure drawn above is readable
 * here as a number, which is what keeps the colour in those charts optional
 * rather than load-bearing.
 *
 * No currency prefix on the cells. The unit is stated once above the table;
 * forty repetitions of "Tk" down a column is ink the eye already skips, and it
 * crowds the digits actually being compared. Each row's hover title carries
 * the fully written figures for anyone who wants them.
 *
 * Sorted by sales on open, not alphabetically — the first question is always
 * "who is carrying this book", and a name-ordered table answers a question
 * nobody asked.
 */

type Key = keyof Pick<
  Bucket,
  | "label"
  | "units"
  | "soldValue"
  | "cost"
  | "margin"
  | "marginPct"
  | "avgMargin"
  | "realisation"
  | "avgDaysHeld"
  | "lossUnits"
>;

interface Col {
  key: Key;
  /** The heading. Plain words — this is read by people who sell trucks. */
  label: string;
  /** The one-line explanation, on hover. */
  hint: string;
  align: "left" | "right";
  render: (b: Bucket) => React.ReactNode;
}

const COLUMNS: Col[] = [
  {
    key: "label",
    label: "Territory",
    hint: "Sales territory the vehicle was sold in",
    align: "left",
    render: (b) => <span className="font-semibold text-ink">{b.label}</span>,
  },
  {
    key: "units",
    label: "Sold",
    hint: "Vehicles sold in this territory",
    align: "right",
    render: (b) => b.units,
  },
  {
    key: "soldValue",
    label: "Sales (M)",
    hint: "What the buyers paid, added up",
    align: "right",
    render: (b) => millions(b.soldValue),
  },
  {
    key: "cost",
    label: "Costs (M)",
    hint: "SOP + registration + service + other + dealer commission",
    align: "right",
    render: (b) => millions(b.cost),
  },
  {
    key: "margin",
    label: "Profit (M)",
    hint: "Sales less costs",
    align: "right",
    render: (b) => (
      <span className="font-semibold" style={{ color: b.margin < 0 ? "var(--bad)" : undefined }}>
        {millions(b.margin)}
      </span>
    ),
  },
  {
    key: "marginPct",
    label: "Profit rate",
    hint: "Profit as a share of sales, weighted by value",
    align: "right",
    render: (b) => <RateMeter pct={b.marginPct} />,
  },
  {
    key: "avgMargin",
    label: "Profit / truck (M)",
    hint: "Profit per vehicle — the figure that survives a change in volume",
    align: "right",
    render: (b) => millions(b.avgMargin),
  },
  {
    key: "realisation",
    label: "Against asking (M)",
    hint: "Sold above (+) or below (−) the price management approved. The clearest read on whether pricing is set well.",
    align: "right",
    render: (b) => <AskingGap gap={b.realisation} />,
  },
  {
    key: "avgDaysHeld",
    label: "Days to sell",
    hint: "Capture to sale, on average — how long the money sat still",
    align: "right",
    render: (b) => (b.avgDaysHeld === null ? "—" : Math.round(b.avgDaysHeld)),
  },
  {
    key: "lossUnits",
    label: "Sold at a loss",
    hint: "Vehicles that fetched less than they cost",
    align: "right",
    render: (b) =>
      b.lossUnits === 0 ? (
        <span className="text-ink-3">none</span>
      ) : (
        <span className="font-semibold" style={{ color: "var(--bad)" }}>
          {b.lossUnits}
        </span>
      ),
  },
];

export function TerritoryPnlTable({ rows }: { rows: Bucket[] }) {
  const [sort, setSort] = useState<Key>("soldValue");
  const [dir, setDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const out = [...rows];
    out.sort((a, b) => {
      const x = a[sort];
      const y = b[sort];
      // Nulls always sink, in both directions: an unknown is not a small
      // number and must never win a "worst performer" sort.
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      const cmp =
        typeof x === "string" ? x.localeCompare(y as string) : (x as number) - (y as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return out;
  }, [rows, sort, dir]);

  const total = useMemo(() => totalRow(rows), [rows]);

  const click = (k: Key) => {
    if (k === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(k);
      // Open a numeric column at its most interesting end rather than
      // ascending from zero.
      setDir(k === "label" ? "asc" : "desc");
    }
  };

  return (
    <div className="pnl-table-wrap">
      <div className="pnl-scroll">
        <table className="pnl-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} data-align={c.align} title={c.hint}>
                  <button className="pnl-th" onClick={() => click(c.key)} data-align={c.align}>
                    <span>{c.label}</span>
                    {sort === c.key ? (
                      dir === "asc" ? (
                        <ArrowUp size={11} />
                      ) : (
                        <ArrowDown size={11} />
                      )
                    ) : (
                      <ChevronsUpDown size={11} className="pnl-th-idle" />
                    )}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-8 text-center text-[13px] text-ink-3">
                  Nothing sold in this range.
                </td>
              </tr>
            ) : (
              sorted.map((b) => (
                <tr
                  key={b.key}
                  title={`${b.label}: ${b.units} sold, ${taka(b.soldValue)} in sales, ${taka(b.margin)} profit`}
                >
                  {COLUMNS.map((c) => (
                    <td key={c.key} data-align={c.align}>
                      {c.render(b)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
          {sorted.length > 0 && (
            <tfoot>
              <tr>
                {COLUMNS.map((c) => (
                  <td key={c.key} data-align={c.align}>
                    {c.key === "label" ? "All territories" : c.render(total)}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

/** The footer. Summed from the rows, never averaged from their averages. */
function totalRow(rows: Bucket[]): Bucket {
  const s = (f: (b: Bucket) => number) => rows.reduce((a, b) => a + f(b), 0);
  const soldValue = s((b) => b.soldValue);
  const margin = s((b) => b.margin);
  const units = s((b) => b.units);
  const cost = s((b) => b.cost);
  const withGap = rows.filter((b) => b.realisation !== null);
  const withDays = rows.filter((b) => b.avgDaysHeld !== null);

  return {
    key: "all",
    label: "All territories",
    units,
    soldValue,
    approvedValue: s((b) => b.approvedValue),
    cost,
    sop: s((b) => b.sop),
    registration: s((b) => b.registration),
    service: s((b) => b.service),
    other: s((b) => b.other),
    commission: s((b) => b.commission),
    margin,
    multiple: cost === 0 ? null : soldValue / cost,
    marginPct: soldValue === 0 ? null : (margin / soldValue) * 100,
    avgPrice: units === 0 ? null : soldValue / units,
    avgMargin: units === 0 ? null : margin / units,
    realisation: withGap.length ? withGap.reduce((a, b) => a + b.realisation!, 0) : null,
    // Weighted by units, not a mean of means — a territory that sold one
    // vehicle must not pull the average as hard as one that sold twenty.
    avgDaysHeld: withDays.length
      ? withDays.reduce((a, b) => a + b.avgDaysHeld! * b.units, 0) /
        withDays.reduce((a, b) => a + b.units, 0)
      : null,
    lossUnits: s((b) => b.lossUnits),
    lossValue: s((b) => b.lossValue),
  };
}

/**
 * Profit rate as a number with a track behind it.
 *
 * A same-hue meter, not a colour scale: it encodes one ratio against a fixed
 * 100% track, so two rows are comparable by bar length at a glance without
 * reading either number. It turns red only when profit is actually negative,
 * where the colour is the fact rather than decoration.
 */
function RateMeter({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-ink-3">—</span>;
  const neg = pct < 0;
  return (
    <span className="pnl-meter">
      <span className="pnl-meter-num" style={neg ? { color: "var(--bad)" } : undefined}>
        {pct.toFixed(1)}%
      </span>
      <span className="pnl-meter-track">
        <span
          className="pnl-meter-fill"
          style={{
            width: `${Math.min(100, Math.abs(pct))}%`,
            background: neg ? "var(--bad)" : "var(--chart-value)",
          }}
        />
      </span>
    </span>
  );
}

/**
 * How the territory sold against the price management approved.
 *
 * Signed AND worded, not just coloured: "above" and "below" carry the meaning
 * for a reader who cannot separate the green from the red.
 */
function AskingGap({ gap }: { gap: number | null }) {
  if (gap === null) return <span className="text-ink-3">not priced</span>;
  const over = gap >= 0;
  return (
    <span className="pnl-gap" style={{ color: over ? "var(--ok)" : "var(--bad)" }}>
      <span className="pnl-gap-num">
        {over ? "+" : "−"}
        {millions(Math.abs(gap))}
      </span>
      <span className="pnl-gap-word">{over ? "above" : "below"}</span>
    </span>
  );
}
