"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Clock,
  Loader2,
  Pencil,
  Search,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { sendJSON } from "@/lib/http";
import { useToast } from "@/components/ui/Toast";
import { Chip } from "@/components/ui/Chip";
import type { Tone } from "@/lib/status";
import {
  CostLineEditor,
  cleanLines,
  linesTotal,
  newLine,
  type EditableLine,
} from "@/components/vehicle/CostLineEditor";
import { ValidityDaysPicker } from "@/components/registration/ValidityDaysPicker";
import { taka, shortDate } from "@/lib/format";
import { DEFAULT_VALID_DAYS, type ValidityRow, type ValidityState } from "@/lib/registrationValidity";

const STATE_META: Record<ValidityState, { label: string; tone: Tone }> = {
  expired: { label: "Expired", tone: "bad" },
  expiring: { label: "Ending soon", tone: "warn" },
  valid: { label: "Valid", tone: "ok" },
  sold: { label: "Sold", tone: "neutral" },
  unset: { label: "Not set", tone: "neutral" },
};

const SUGGESTIONS = ["Registration renewal", "Fitness renewal"];

const toEditable = (lines: { description: string; amount: number }[]): EditableLine[] =>
  lines.length
    ? lines.map((l, i) => ({ key: `i${i}`, description: l.description, amount: String(l.amount) }))
    : [newLine()];

/**
 * Registration's standing watch, as its own board.
 *
 * Everywhere else in this app, once a desk submits a file it is gone from
 * their screen. Registration's paperwork does not work that way — both the
 * validity window AND what it would cost to renew keep mattering long after
 * the file has moved on to pricing, gone live, even sold — so this is not a
 * queue of things waiting on them, it is a watchlist of things they are still
 * responsible FOR.
 *
 * The editor opens as a second row directly under the one it belongs to
 * rather than as a modal: this is a running estimate being nudged, usually by
 * a few thousand taka, and a full dialog for that is more ceremony than the
 * decision deserves.
 *
 * It edits the COST as well as the date, deliberately. An earlier version let
 * this row move the date only and pointed at the vehicle page for the money —
 * which made "update" a half-truth and split one thought across two screens.
 * The reason Registration revisits a vehicle at all is almost always that the
 * number moved.
 */
export function ValidityBoard({ initial }: { initial: ValidityRow[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [rows, setRows] = useState(initial);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [days, setDays] = useState(String(DEFAULT_VALID_DAYS));
  const [lines, setLines] = useState<EditableLine[]>([newLine()]);
  const [busy, setBusy] = useState(false);

  const counts = useMemo(() => {
    const c: Record<ValidityState, number> = { expired: 0, expiring: 0, valid: 0, sold: 0, unset: 0 };
    for (const r of rows) c[r.state]++;
    return c;
  }, [rows]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.registrationNo.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        r.customerName.toLowerCase().includes(q),
    );
  }, [rows, search]);

  const startEdit = (row: ValidityRow) => {
    setEditingId(row.id);
    setDays(String(row.validDays ?? DEFAULT_VALID_DAYS));
    setLines(toEditable(row.lines));
  };

  const addSuggestion = (label: string) =>
    setLines((ls) =>
      // A blank first row is the empty state, not a real line — fill it in
      // rather than leaving it and adding a second empty one beside it.
      ls.length === 1 && !ls[0].description.trim() && !ls[0].amount
        ? [{ ...ls[0], description: label }]
        : [...ls, { ...newLine(), description: label }],
    );

  const save = async (id: string) => {
    const n = parseInt(days, 10);
    if (!n || n < 1) {
      toast("Choose how long this estimate stays valid", "bad");
      return;
    }
    const clean = cleanLines(lines);
    if (clean.some((l) => !l.description)) {
      toast("Every cost line needs a description", "bad");
      return;
    }
    setBusy(true);
    try {
      const res = await sendJSON<{ validUntil: string; days: number; costTotal: number }>(
        `/api/vehicles/${id}/registration-validity`,
        "POST",
        { days: n, lines: clean },
      );
      setRows((rs) =>
        rs.map((r) =>
          r.id === id
            ? {
                ...r,
                validUntil: res.validUntil,
                validDays: res.days,
                daysLeft: Math.ceil(
                  (new Date(res.validUntil).getTime() - Date.now()) / 86_400_000,
                ),
                state: r.sold ? "sold" : "valid",
                costTotal: res.costTotal,
                lines: clean.map((l) => ({ description: l.description, amount: l.amount })),
              }
            : r,
        ),
      );
      toast("Registration status updated", "ok");
      setEditingId(null);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save", "bad");
    } finally {
      setBusy(false);
    }
  };

  if (rows.length === 0) return null;

  return (
    <section className="dh-card">
      <div className="dh-toggle" style={{ cursor: "default" }}>
        <span className="dh-toggle-title">
          <ShieldCheck size={13} />
          Registration status &amp; costing
        </span>
        <span className="dh-toggle-meta">every vehicle you have registered</span>
      </div>

      <div className="dh-body" style={{ display: "block" }}>
        <div className="rv-stats">
          <RvStat icon={<AlertTriangle size={13} />} label="Expired" value={counts.expired} tone="bad" />
          <RvStat icon={<Clock size={13} />} label="Ending soon" value={counts.expiring} tone="warn" />
          <RvStat icon={<ShieldCheck size={13} />} label="Valid" value={counts.valid} tone="ok" />
          <RvStat icon={<ShieldOff size={13} />} label="Sold — untracked" value={counts.sold} tone="neutral" />
        </div>

        <div className="dh-controls mt-3">
          <div className="pill-search dh-search">
            <span className="grid h-8 w-9 shrink-0 place-items-center text-ink-3">
              <Search size={14} />
            </span>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search vehicle, reg no, customer…"
              className="h-8 min-w-0 flex-1 bg-transparent pr-3 text-[12.5px] text-ink outline-none placeholder:text-ink-3"
            />
          </div>
        </div>

        <div className="dh-table-wrap mt-2.5">
          <table className="dtable w-full">
            <thead>
              <tr>
                <th>Vehicle</th>
                <th>Customer</th>
                <th>Valid until</th>
                <th>Status</th>
                <th className="text-right">Est. cost</th>
                <th className="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <Fragment key={r.id}>
                  <tr data-dim={r.sold}>
                    <td>
                      <Link href={`/vehicles/${r.id}`} className="dh-vehicle">
                        <span className="dh-vehicle-name">{r.name}</span>
                        <span className="dh-vehicle-reg">{r.registrationNo}</span>
                      </Link>
                    </td>
                    <td className="text-ink-2">{r.customerName}</td>
                    <td className="tnum text-ink-2">{r.validUntil ? shortDate(r.validUntil) : "—"}</td>
                    <td>
                      <Chip tone={STATE_META[r.state].tone}>
                        {STATE_META[r.state].label}
                        {!r.sold && r.daysLeft !== null && (
                          <span className="rv-days">
                            {r.daysLeft < 0 ? ` · ${Math.abs(r.daysLeft)}d over` : ` · ${r.daysLeft}d left`}
                          </span>
                        )}
                      </Chip>
                    </td>
                    <td className="tnum text-right text-ink-2">
                      {r.costTotal > 0 ? taka(r.costTotal) : <span className="text-ink-3">—</span>}
                    </td>
                    <td className="text-right">
                      {r.sold ? (
                        <span className="text-[11px] text-ink-3">Not required</span>
                      ) : (
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => (editingId === r.id ? setEditingId(null) : startEdit(r))}
                        >
                          <Pencil size={12} />
                          {editingId === r.id ? "Close" : "Update"}
                        </button>
                      )}
                    </td>
                  </tr>

                  {editingId === r.id && (
                    <tr className="rv-edit-row">
                      <td colSpan={6}>
                        <div className="rv-edit">
                          <div className="rv-edit-head">
                            <span className="rv-edit-label">Update registration status</span>
                            <span className="rv-edit-suggest">
                              {SUGGESTIONS.map((sug) => (
                                <button
                                  key={sug}
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  onClick={() => addSuggestion(sug)}
                                >
                                  + {sug}
                                </button>
                              ))}
                            </span>
                          </div>

                          <CostLineEditor
                            lines={lines}
                            onChange={setLines}
                            label=""
                            placeholder="e.g. Fitness renewal, route permit…"
                          />

                          <div className="rv-edit-foot">
                            <div className="min-w-0">
                              <span className="rv-edit-label">Estimate valid for</span>
                              <div className="mt-1.5">
                                <ValidityDaysPicker value={days} onChange={setDays} disabled={busy} />
                              </div>
                            </div>
                            <div className="ml-auto flex items-center gap-1.5">
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => setEditingId(null)}
                                disabled={busy}
                              >
                                Cancel
                              </button>
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => save(r.id)}
                                disabled={busy}
                              >
                                {busy ? (
                                  <Loader2 size={13} className="animate-spin" />
                                ) : (
                                  `Save · ${taka(linesTotal(lines))}`
                                )}
                              </button>
                            </div>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
          {shown.length === 0 && <p className="dh-empty">Nothing matches your search.</p>}
        </div>
      </div>
    </section>
  );
}

function RvStat({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: Tone;
}) {
  return (
    <div className="rv-stat" data-tone={tone}>
      <span className="rv-stat-icon">{icon}</span>
      <span className="rv-stat-value">{value}</span>
      <span className="rv-stat-label">{label}</span>
    </div>
  );
}
