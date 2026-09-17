"use client";

import { Layers, MapPin } from "lucide-react";
import { matchesPart, type PartChoice } from "@/lib/recoveryRollup";

// The choice and the predicate live in lib/recoveryRollup.ts, beside the
// derivations that read them — the server narrows a book with the same
// `matchesPart` this control sets. Re-exported here because every caller
// already reaches for them alongside the control itself.
export { matchesPart };
export type { PartChoice };

/**
 * Which half of the field you are looking at.
 *
 * The recovery organisation is split in two, each half with its own manager,
 * and above them a head who reads both. That makes "part" the first cut on
 * every RM surface rather than a detail buried in a filter sheet — a
 * part-wise manager should be able to land on any page and narrow it to their
 * own book in one press, and the head should be able to put it back.
 *
 * It sits with the title rather than among the action buttons, because it is
 * not something you do to the page: it decides what the page IS. Every figure
 * underneath means something different depending on where this is set, and a
 * control with that much reach should be impossible to miss and impossible to
 * mistake for a button.
 *
 * Deliberately NOT persisted across pages. A scope that silently follows you
 * between screens is how someone reports half the book as the whole of it.
 *
 * Within a page it reaches everything. On the manager's dashboard it re-derives
 * the six headline figures, the exception rows and the territory table from the
 * same narrowed book — see `scopeManagerBook`. A control that changed some of
 * the numbers on a screen and not the others would be worse than no control:
 * the reader would have no way to tell which half of the page they were
 * looking at.
 */
const OPTIONS: { key: PartChoice; label: string; short: string }[] = [
  { key: "all", label: "Both parts", short: "All" },
  { key: "A", label: "Part A", short: "A" },
  { key: "B", label: "Part B", short: "B" },
];

export function PartFilter({
  value,
  onChange,
  counts,
}: {
  value: PartChoice;
  onChange: (v: PartChoice) => void;
  /** Optional per-part totals, shown on each option. */
  counts?: { all: number; A: number; B: number };
}) {
  return (
    <div className="part-filter" role="group" aria-label="Recovery part">
      <span className="part-filter-tag">
        {value === "all" ? <Layers size={11} /> : <MapPin size={11} />}
        Scope
      </span>
      <div className="part-filter-seg">
        {OPTIONS.map((o) => {
          const on = value === o.key;
          return (
            <button
              key={o.key}
              className="part-filter-btn"
              data-on={on || undefined}
              aria-pressed={on}
              onClick={() => onChange(o.key)}
              title={o.label}
            >
              {o.label}
              {counts && <span className="part-filter-count">{counts[o.key]}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
