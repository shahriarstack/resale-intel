"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronDown, Loader2, Search } from "lucide-react";
import { getJSON } from "@/lib/http";
import { timeAgo, shortDate } from "@/lib/format";
import { Chip } from "@/components/ui/Chip";
import type { DeskHistoryRow } from "@/lib/deskHistory";

type Window = "30" | "90" | "365" | "all";

const WINDOWS: { key: Window; label: string; days: number | null }[] = [
  { key: "30", label: "30 days", days: 30 },
  { key: "90", label: "90 days", days: 90 },
  { key: "365", label: "This year", days: 365 },
  { key: "all", label: "All time", days: null },
];

/**
 * "Have I already done this one?"
 *
 * Every approving desk in this app is a queue: it shows what still needs a
 * decision and, the instant that decision is made, the file is gone from
 * view. Right for the queue — wrong the moment someone gets asked about a
 * vehicle they know they already actioned and has no way to check without
 * hunting through the vehicle's own page.
 *
 * Collapsed by default and fetched only on first open, because this is a
 * lookup tool, not a dashboard block competing with the queue above it for
 * attention. It fetches its own window locally rather than through the URL —
 * the page's own `from`/`to` params, where a desk has them, already belong to
 * a different control (the workload table on the Service Manager's desk).
 */
export function ApprovedHistory() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<DeskHistoryRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [win, setWin] = useState<Window>("90");
  const [search, setSearch] = useState("");

  const load = async (w: Window) => {
    setLoading(true);
    setError("");
    try {
      const spec = WINDOWS.find((x) => x.key === w)!;
      const params = new URLSearchParams();
      if (spec.days !== null) {
        const from = new Date();
        from.setDate(from.getDate() - spec.days);
        params.set("from", from.toISOString().slice(0, 10));
      }
      const qs = params.toString();
      setRows(await getJSON<DeskHistoryRow[]>(`/api/desk/history${qs ? `?${qs}` : ""}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load history");
    } finally {
      setLoading(false);
    }
  };

  const shown = useMemo(() => {
    if (!rows) return [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.registrationNo.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q) ||
        (r.territory ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  return (
    <section className="dh-card">
      <button
        type="button"
        className="dh-toggle"
        onClick={() => {
          // Fetches once, the moment it is first opened by a person — not on
          // mount, so a desk that never expands this never pays for it.
          if (!open && rows === null) load(win);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
      >
        <span className="dh-toggle-title">
          <CheckCircle2 size={13} />
          Approved history
        </span>
        <span className="dh-toggle-meta">
          {open ? "Hide" : "What this desk has already decided"}
          <ChevronDown size={14} style={{ transform: open ? "rotate(180deg)" : undefined }} />
        </span>
      </button>

      {open && (
        <div className="dh-body">
          <div className="dh-controls">
            <div className="seg" role="group" aria-label="Time window">
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  className="seg-btn"
                  data-on={win === w.key}
                  onClick={() => {
                    setWin(w.key);
                    load(w.key);
                  }}
                >
                  {w.label}
                </button>
              ))}
            </div>
            <div className="pill-search dh-search">
              <span className="grid h-8 w-9 shrink-0 place-items-center text-ink-3">
                <Search size={14} />
              </span>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search vehicle, customer, territory…"
                className="h-8 min-w-0 flex-1 bg-transparent pr-3 text-[12.5px] text-ink outline-none placeholder:text-ink-3"
              />
            </div>
          </div>

          {error && <p className="sc-error mt-2.5">{error}</p>}

          {loading ? (
            <div className="grid place-items-center py-10 text-ink-3">
              <Loader2 size={16} className="animate-spin" />
            </div>
          ) : shown.length === 0 ? (
            <p className="dh-empty">
              {rows === null
                ? " "
                : rows.length === 0
                  ? "Nothing decided in this window yet."
                  : "Nothing here matches your search."}
            </p>
          ) : (
            <div className="dh-table-wrap">
              <table className="dtable w-full">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Customer</th>
                    <th>Decision</th>
                    <th>By</th>
                    <th className="text-right">When</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id}>
                      <td>
                        <Link href={`/vehicles/${r.vehicleId}`} className="dh-vehicle">
                          <span className="dh-vehicle-name">{r.name}</span>
                          <span className="dh-vehicle-reg">{r.registrationNo}</span>
                        </Link>
                      </td>
                      <td className="text-ink-2">{r.customerName}</td>
                      <td>
                        <Chip tone={r.tone}>{r.label}</Chip>
                        {r.note && <p className="dh-note">{r.note}</p>}
                      </td>
                      <td className="text-ink-3">{r.actorName ?? "—"}</td>
                      <td className="text-right" title={shortDate(r.at)}>
                        <span className="font-mono text-[11px] text-ink-3">{timeAgo(r.at)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
