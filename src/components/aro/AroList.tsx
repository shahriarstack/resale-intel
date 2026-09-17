"use client";

import { Search, X, type LucideIcon } from "lucide-react";

/**
 * The furniture shared by the two ARO working screens.
 *
 * Extracted the moment there were two of them, rather than after they had
 * drifted: Captures and Off-road are the same shape — header, search, pills,
 * list — and the only reason they are separate screens is that they are
 * separate jobs.
 */

export function AroHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: string;
  sub: string;
}) {
  return (
    // Sized from the field scale in 17-field-density.css rather than inline.
    // These three lines used to open every working screen at 24px over a
    // 12.5px sentence, which is a magazine masthead on a surface that is not
    // a magazine — the officer came here for the list underneath it.
    <header className="mb-2.5">
      <div className="eyebrow fh-eyebrow" style={{ color: "var(--accent)" }}>
        {eyebrow}
      </div>
      <h1 className="fh-title mt-0.5">{title}</h1>
      <p className="fh-sub">{sub}</p>
    </header>
  );
}

export function AroSearch({
  value,
  onChange,
  placeholder = "Reg no, customer, model…",
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="pill-search">
      <span className="grid h-10 w-11 shrink-0 place-items-center text-ink-3">
        <Search size={16} />
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
      />
      {value && (
        <button
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="mr-3 grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

export interface AroTab {
  key: string;
  label: string;
  /**
   * Omitted where a count would be a number of nothing.
   *
   * The engineer's "Month" tab is a record, not a queue: a 0 beside it reads
   * as an empty bucket and would send somebody looking for work that was never
   * missing. A tab with nothing to count simply shows its label.
   */
  count?: number;
}

/** Flat pills. Sub-navigation WITHIN a screen — never a second nav bar. */
export function AroTabs({
  tabs,
  value,
  onChange,
}: {
  tabs: AroTab[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="no-scrollbar -mx-1 mt-2.5 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5">
      {tabs.map((t) => {
        const on = value === t.key;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            aria-pressed={on}
            className="flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors"
            style={
              on
                ? { background: "var(--accent)", color: "var(--on-accent)" }
                : { background: "var(--surface-2)", color: "var(--ink-2)" }
            }
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className="font-mono text-[10px] font-bold tnum"
                style={{ opacity: on ? 0.75 : 0.55 }}
              >
                {t.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export function AroList({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 flex flex-col gap-2.5">{children}</div>;
}

function Rows<T>({
  rows,
  render,
  empty,
  icon: Icon,
  searching,
}: {
  rows: T[];
  render: (row: T) => React.ReactNode;
  empty: string;
  icon: LucideIcon;
  searching: boolean;
}) {
  if (rows.length === 0) {
    return (
      <div
        className="card grid place-items-center gap-2 px-6 py-10 text-center"
        style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}
      >
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-3">
          <Icon size={19} strokeWidth={1.7} />
        </span>
        <p className="text-[12.5px] font-medium text-ink-2">
          {searching ? "Nothing matches your search." : empty}
        </p>
      </div>
    );
  }
  return <>{rows.map(render)}</>;
}

AroList.Rows = Rows;
