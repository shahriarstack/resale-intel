"use client";

import { useMemo } from "react";
import type { OffroadKind } from "@prisma/client";
import { RotateCcw, SlidersHorizontal } from "lucide-react";
import {
  ACCIDENT_SEVERITY_META,
  THANA_REASON_META,
} from "@/lib/offroad";
import type { CaseRow } from "@/lib/recoveryDesk";

/**
 * The filters the desk actually uses.
 *
 * A supervisor's question is never "show me all cases" — it is one of about
 * five: who is behind, whose patch is it, who is waiting on me, what have I
 * already extended, and what has gone quiet. Each control below is one of those
 * questions, which is why there is no generic "add a filter" builder: a builder
 * makes the common questions as expensive to ask as the rare ones.
 *
 * `urgency` and `flagged` are separated on purpose. "Overdue" is about the
 * vehicle; "waiting on me" is about a person. They correlate but they are not
 * the same list, and collapsing them would hide a fresh support request on a
 * case whose clock is perfectly healthy.
 */
export interface CaseFilterState {
  urgency: "all" | "overdue" | "due-soon" | "on-track";
  flagged: "all" | "support" | "attention" | "unflagged";
  /** Which half of the field. Two part-wise managers share this book, and
   *  the recovery head reads both. */
  part: "all" | "A" | "B";
  territory: string;
  officer: string;
  /** Accident severity or Thana reason, depending on the board. */
  reason: string;
  revised: "all" | "revised" | "untouched";
  /** Open cases with no flag, no revision and no movement for a fortnight. */
  stale: boolean;
}

export const EMPTY_FILTERS: CaseFilterState = {
  urgency: "all",
  flagged: "all",
  part: "all",
  territory: "all",
  officer: "all",
  reason: "all",
  revised: "all",
  stale: false,
};

const STALE_DAYS = 14;

export function activeFilterCount(f: CaseFilterState): number {
  return (
    (f.urgency !== "all" ? 1 : 0) +
    (f.flagged !== "all" ? 1 : 0) +
    (f.part !== "all" ? 1 : 0) +
    (f.territory !== "all" ? 1 : 0) +
    (f.officer !== "all" ? 1 : 0) +
    (f.reason !== "all" ? 1 : 0) +
    (f.revised !== "all" ? 1 : 0) +
    (f.stale ? 1 : 0)
  );
}

/** Apply the whole filter set to a list of cases. */
export function applyCaseFilters(rows: CaseRow[], f: CaseFilterState): CaseRow[] {
  return rows.filter((c) => {
    if (f.urgency === "overdue" && !c.clock.overdue) return false;
    if (f.urgency === "due-soon" && !(!c.clock.overdue && c.clock.daysLeft <= 3)) return false;
    if (f.urgency === "on-track" && (c.clock.overdue || c.clock.daysLeft <= 3)) return false;

    if (f.flagged === "support" && !c.openSupport) return false;
    if (f.flagged === "attention" && !c.openAttention) return false;
    if (f.flagged === "unflagged" && (c.openSupport || c.openAttention)) return false;

    if (f.part !== "all" && c.territory?.part !== f.part) return false;
    if (f.territory !== "all" && (c.territory?.name ?? "—") !== f.territory) return false;
    if (f.officer !== "all" && (c.openedBy?.name ?? "—") !== f.officer) return false;

    if (f.reason !== "all") {
      const key = c.kind === "ACCIDENT" ? c.accidentSeverity : c.thanaReason;
      if (key !== f.reason) return false;
    }

    if (f.revised === "revised" && !c.clock.revised) return false;
    if (f.revised === "untouched" && c.clock.revised) return false;

    if (
      f.stale &&
      !(c.clock.elapsedDays >= STALE_DAYS && c.flags.length === 0 && !c.clock.revised)
    ) {
      return false;
    }

    return true;
  });
}

export function CaseFilters({
  kind,
  rows,
  value,
  onChange,
}: {
  /** Which board this is, so the reason list matches what is on it. */
  kind: OffroadKind;
  /** The UNFILTERED rows — the option lists come from what actually exists. */
  rows: CaseRow[];
  value: CaseFilterState;
  onChange: (next: CaseFilterState) => void;
}) {
  const set = <K extends keyof CaseFilterState>(key: K, v: CaseFilterState[K]) =>
    onChange({ ...value, [key]: v });

  // Options are drawn from the data rather than from master lists: a territory
  // with no cases on this board is a filter that can only ever return nothing.
  const territories = useMemo(
    () => [...new Set(rows.map((c) => c.territory?.name ?? "—"))].sort(),
    [rows],
  );
  const officers = useMemo(
    () => [...new Set(rows.map((c) => c.openedBy?.name ?? "—"))].sort(),
    [rows],
  );

  const reasons =
    kind === "ACCIDENT"
      ? (["MINOR", "MODERATE", "MAJOR", "TOTAL_LOSS"] as const).map((k) => ({
          value: k,
          label: ACCIDENT_SEVERITY_META[k].label,
        }))
      : (["ACCIDENT", "DRUG_CASE", "ILLEGAL_GOODS", "THEFT", "CUSTOMS", "OTHER"] as const).map(
          (k) => ({ value: k, label: THANA_REASON_META[k].label }),
        );

  const count = activeFilterCount(value);

  // Counts on the quick chips, so the desk can see there is nothing overdue
  // without having to select it and read an empty board.
  const n = {
    overdue: rows.filter((c) => c.clock.overdue).length,
    support: rows.filter((c) => c.openSupport).length,
    attention: rows.filter((c) => c.openAttention).length,
    stale: rows.filter(
      (c) => c.clock.elapsedDays >= STALE_DAYS && c.flags.length === 0 && !c.clock.revised,
    ).length,
  };

  return (
    <div className="card mt-4 p-3.5">
      <div className="mb-3 flex items-center gap-2">
        <SlidersHorizontal size={14} className="text-ink-3" />
        <span className="label !mb-0">Filters</span>
        {count > 0 && (
          <>
            <span
              className="grid h-4 min-w-4 place-items-center rounded-full px-1 font-mono text-[9px] font-bold"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              {count}
            </span>
            <button
              className="ml-auto flex items-center gap-1 text-[11.5px] font-semibold text-ink-3 hover:text-ink"
              onClick={() => onChange(EMPTY_FILTERS)}
            >
              <RotateCcw size={12} /> Reset
            </button>
          </>
        )}
      </div>

      {/* One-tap answers to the four questions asked most often. Chips rather
          than another dropdown because these are the ones worth a single tap. */}
      <div className="flex flex-wrap gap-1.5">
        <QuickChip
          label="Overdue"
          count={n.overdue}
          tone="var(--bad)"
          on={value.urgency === "overdue"}
          onClick={() => set("urgency", value.urgency === "overdue" ? "all" : "overdue")}
        />
        <QuickChip
          label="Waiting on me"
          count={n.support}
          tone="var(--accent)"
          on={value.flagged === "support"}
          onClick={() => set("flagged", value.flagged === "support" ? "all" : "support")}
        />
        <QuickChip
          label="I flagged"
          count={n.attention}
          tone="var(--warn)"
          on={value.flagged === "attention"}
          onClick={() => set("flagged", value.flagged === "attention" ? "all" : "attention")}
        />
        <QuickChip
          label="Gone quiet"
          count={n.stale}
          tone="var(--ink-3)"
          on={value.stale}
          onClick={() => set("stale", !value.stale)}
        />
      </div>

      <div className="mt-3 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
        <Select
          label="Window"
          value={value.urgency}
          onChange={(v) => set("urgency", v as CaseFilterState["urgency"])}
          options={[
            { value: "all", label: "Any" },
            { value: "overdue", label: "Past window" },
            { value: "due-soon", label: "Due within 3 days" },
            { value: "on-track", label: "On track" },
          ]}
        />
        <Select
          label="Recovery part"
          value={value.part}
          onChange={(v) => set("part", v as CaseFilterState["part"])}
          options={[
            { value: "all", label: "Both parts" },
            { value: "A", label: "Part A" },
            { value: "B", label: "Part B" },
          ]}
        />
        <Select
          label="Territory"
          value={value.territory}
          onChange={(v) => set("territory", v)}
          options={[
            { value: "all", label: "All territories" },
            ...territories.map((t) => ({ value: t, label: t })),
          ]}
        />
        <Select
          label="Officer"
          value={value.officer}
          onChange={(v) => set("officer", v)}
          options={[
            { value: "all", label: "All officers" },
            ...officers.map((o) => ({ value: o, label: o })),
          ]}
        />
        <Select
          label={kind === "ACCIDENT" ? "Severity" : "Reason"}
          value={value.reason}
          onChange={(v) => set("reason", v)}
          options={[{ value: "all", label: "Any" }, ...reasons]}
        />
        <Select
          label="Flags"
          value={value.flagged}
          onChange={(v) => set("flagged", v as CaseFilterState["flagged"])}
          options={[
            { value: "all", label: "Any" },
            { value: "support", label: "Support requested" },
            { value: "attention", label: "Flagged by me" },
            { value: "unflagged", label: "No open flag" },
          ]}
        />
        <Select
          label="Window revised"
          value={value.revised}
          onChange={(v) => set("revised", v as CaseFilterState["revised"])}
          options={[
            { value: "all", label: "Any" },
            { value: "revised", label: "Already extended" },
            { value: "untouched", label: "Original estimate" },
          ]}
        />
      </div>
    </div>
  );
}

function QuickChip({
  label,
  count,
  tone,
  on,
  onClick,
}: {
  label: string;
  count: number;
  tone: string;
  on: boolean;
  onClick: () => void;
}) {
  const empty = count === 0;
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      disabled={empty && !on}
      className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold transition-colors disabled:opacity-45"
      style={
        on
          ? { borderColor: tone, background: `color-mix(in srgb, ${tone} 12%, var(--surface))`, color: tone }
          : { borderColor: "var(--rule)", background: "var(--surface)", color: "var(--ink-3)" }
      }
    >
      {label}
      <span
        className="grid h-[16px] min-w-[16px] place-items-center rounded-full px-1 font-mono text-[9px] font-bold"
        style={on ? { background: tone, color: "#fff" } : { background: "var(--surface-3)" }}
      >
        {count}
      </span>
    </button>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="float-field">
      <span className="float-label">{label}</span>
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
