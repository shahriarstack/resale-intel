"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, Loader2, X } from "lucide-react";

/**
 * A URL-driven date window.
 *
 * The counts these filter are database aggregates, so narrowing the window has
 * to be a server round trip. Keeping the range in the URL rather than in
 * component state makes a filtered view shareable and survives a refresh, and
 * `startTransition` keeps the current table on screen and interactive while
 * the server re-counts instead of blanking to a skeleton.
 */

/** Local YYYY-MM-DD. `toISOString()` would shift the day by the UTC offset. */
function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

/**
 * Windows worth one click. Evaluated per render rather than frozen at module
 * load, so a tab left open overnight does not offer yesterday's "30 days".
 */
const PRESETS: { label: string; value: () => [string, string] }[] = [
  { label: "All time", value: () => ["", ""] },
  { label: "30 days", value: () => [daysAgo(30), iso(new Date())] },
  { label: "90 days", value: () => [daysAgo(90), iso(new Date())] },
  {
    label: "This year",
    value: () => [iso(new Date(new Date().getFullYear(), 0, 1)), iso(new Date())],
  },
];

export function DateRangeBar({
  from,
  to,
  basePath,
  label = "Captured",
  /** Query keys to preserve when the range changes (e.g. an open tab). */
  keep,
}: {
  from: string;
  to: string;
  /** Where to push to, e.g. "/dashboard". */
  basePath: string;
  label?: string;
  keep?: Record<string, string | undefined>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const apply = (nextFrom: string, nextTo: string) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(keep ?? {})) if (v) q.set(k, v);
    if (nextFrom) q.set("from", nextFrom);
    if (nextTo) q.set("to", nextTo);
    const qs = q.toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  };

  const ranged = Boolean(from || to);

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.13em] text-ink-3">
        <CalendarRange size={12} />
        {label}
      </span>

      <div className="seg" role="group" aria-label={`${label} range preset`}>
        {PRESETS.map((p) => {
          const [f, t] = p.value();
          const on = from === f && to === t;
          return (
            <button
              key={p.label}
              className="seg-btn"
              data-on={on}
              aria-pressed={on}
              onClick={() => apply(f, t)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5">
        <input
          type="date"
          className="field h-8 w-[142px] py-0 text-xs"
          aria-label={`${label} from`}
          value={from}
          max={to || undefined}
          onChange={(e) => apply(e.target.value, to)}
        />
        <span className="text-[11px] text-ink-3">to</span>
        <input
          type="date"
          className="field h-8 w-[142px] py-0 text-xs"
          aria-label={`${label} to`}
          value={to}
          min={from || undefined}
          onChange={(e) => apply(from, e.target.value)}
        />
      </div>

      {ranged && (
        <button className="btn btn-ghost btn-sm shrink-0" onClick={() => apply("", "")}>
          <X size={12} />
          Clear
        </button>
      )}

      {pending && (
        <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-3">
          <Loader2 size={11} className="animate-spin" />
          recounting…
        </span>
      )}
    </div>
  );
}
