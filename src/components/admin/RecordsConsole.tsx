"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Search,
  Trash2,
  Pencil,
  Loader2,
  AlertTriangle,
  X,
  ExternalLink,
  SlidersHorizontal,
  ShieldAlert,
} from "lucide-react";
import { getJSON, sendJSON } from "@/lib/http";
import { Chip } from "@/components/ui/Chip";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { shortDate } from "@/lib/format";

/**
 * The records console.
 *
 * One screen where an administrator can find any record in any of the three
 * books and correct or remove it. It is the strongest screen in the product,
 * so it is built around making the consequence visible before the act rather
 * than around making the act quick:
 *
 *   the cascade is counted and shown   deleting five vehicles is also deleting
 *                                      a hundred audit events, and that total
 *                                      is on the confirm button, not in a
 *                                      changelog afterwards
 *   records that cannot go say so      a spent approval is the authority for a
 *                                      seizure that happened; it is marked
 *                                      undeletable in the list, not failed
 *                                      halfway through a batch
 *   the reason is the deliverable      it outlives the record — see
 *                                      AdminDeletion — so the field asks for a
 *                                      sentence and means it
 *
 * Deletions run one call per record, sequentially, exactly as BulkBar runs
 * transitions: a batch is the same sequence of single acts, so no guard is
 * skipped and a partial failure can be reported per record instead of as one
 * shrug.
 */

type Kind = "VEHICLE" | "CAPTURE_REQUEST" | "OFFROAD_CASE";

interface Row {
  kind: Kind;
  id: string;
  label: string;
  customer: string | null;
  customerCode: string | null;
  stage: string;
  stageKey: string;
  territory: string | null;
  owner: string | null;
  createdAt: string;
  facts: string[];
  cascade: { photos: number; events: number; bids: number };
  href: string | null;
}

interface Page {
  rows: Row[];
  totals: Record<Kind, number>;
  truncated: boolean;
  limit: number;
}

interface Territory {
  id: string;
  name: string;
}

const KIND_META: Record<Kind, { label: string; short: string; tone: "accent" | "warn" | "neutral" }> = {
  VEHICLE: { label: "Vehicle", short: "Vehicle", tone: "accent" },
  CAPTURE_REQUEST: { label: "Capture request", short: "Request", tone: "neutral" },
  OFFROAD_CASE: { label: "Off-road case", short: "Off-road", tone: "warn" },
};

const STAGES: { group: string; kind: Kind; keys: [string, string][] }[] = [
  {
    group: "Vehicle",
    kind: "VEHICLE",
    keys: [
      ["CAPTURED", "Captured"],
      ["CN_REQUESTED", "CN requested"],
      ["CN_APPROVED", "CN approved"],
      ["COST_SUBMITTED", "Cost submitted"],
      ["REPAIR_APPROVED", "Repair approved"],
      ["REGISTRATION_DONE", "Registration done"],
      ["SOP_ADDED", "SOP added"],
      ["PRICE_APPROVED", "Price approved"],
      ["LIVE_FOR_RESALE", "Live for resale"],
      ["SOLD", "Sold"],
      ["RELEASED", "Released"],
    ],
  },
  {
    group: "Capture request",
    kind: "CAPTURE_REQUEST",
    keys: [
      ["PENDING", "Awaiting decision"],
      ["APPROVED", "Approved"],
      ["DECLINED", "Declined"],
      ["CAPTURED", "Captured against"],
    ],
  },
  {
    group: "Off-road case",
    kind: "OFFROAD_CASE",
    keys: [
      ["OPEN", "Open"],
      ["RESOLVED_ONROAD", "Back on-road"],
      ["RELEASED_TO_CUSTOMER", "Released to customer"],
      ["CONVERTED_TO_CAPTURE", "Converted to capture"],
    ],
  },
];

/**
 * A record whose deletion would destroy the authority for something that
 * actually happened. The API refuses these too — this is the courtesy copy, so
 * an administrator learns it while selecting rather than halfway through a
 * batch.
 */
function undeletableReason(r: Row): string | null {
  if (r.kind === "CAPTURE_REQUEST" && r.stageKey === "CAPTURED") {
    return "Spent on a capture — this is the authority for that seizure";
  }
  if (r.kind === "OFFROAD_CASE" && r.stageKey === "CONVERTED_TO_CAPTURE") {
    return "Converted to a capture — this is that vehicle's origin";
  }
  return null;
}

export function RecordsConsole({ territories }: { territories: Territory[] }) {
  const { toast } = useToast();

  const [q, setQ] = useState("");
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [stages, setStages] = useState<string[]>([]);
  const [territory, setTerritory] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [reason, setReason] = useState("");
  const [progress, setProgress] = useState(0);
  const [failures, setFailures] = useState<{ label: string; error: string }[]>([]);

  const [editing, setEditing] = useState<Row | null>(null);

  const key = (r: Row) => `${r.kind}:${r.id}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams();
      if (q.trim()) p.set("q", q.trim());
      if (kinds.length) p.set("kinds", kinds.join(","));
      if (stages.length) p.set("stages", stages.join(","));
      if (territory) p.set("territory", territory);
      if (from) p.set("from", from);
      if (to) p.set("to", to);
      setPage(await getJSON<Page>(`/api/admin/records?${p.toString()}`));
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not load records", "bad");
    } finally {
      setLoading(false);
    }
  }, [q, kinds, stages, territory, from, to, toast]);

  // Debounced so typing a registration number is one request, not eight.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      void load();
      return;
    }
    const t = setTimeout(() => void load(), 300);
    return () => clearTimeout(t);
  }, [load]);

  const rows = useMemo(() => page?.rows ?? [], [page]);

  /**
   * Selection is keyed by kind+id, and what counts as selected is the
   * INTERSECTION with what is on screen — derived, never pruned in an effect.
   *
   * That distinction is the safety property, not a tidiness one. Selecting a
   * record, filtering it away, and then pressing delete must not delete it;
   * deriving means the filter decides, every render, and there is no window
   * where a stale key could still be acted on.
   */
  const selectedRows = useMemo(
    () => rows.filter((r) => selected.has(key(r))),
    [rows, selected],
  );

  const deletable = useMemo(
    () => selectedRows.filter((r) => !undeletableReason(r)),
    [selectedRows],
  );

  const cascadeTotal = useMemo(
    () =>
      deletable.reduce(
        (acc, r) => ({
          photos: acc.photos + r.cascade.photos,
          events: acc.events + r.cascade.events,
          bids: acc.bids + r.cascade.bids,
        }),
        { photos: 0, events: 0, bids: 0 },
      ),
    [deletable],
  );

  const total = page ? Object.values(page.totals).reduce((a, b) => a + b, 0) : 0;
  const filtersOn =
    kinds.length > 0 || stages.length > 0 || !!territory || !!from || !!to;

  function toggle(r: Row) {
    setSelected((prev) => {
      const next = new Set(prev);
      const k = key(r);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  function toggleAll() {
    setSelected((prev) => {
      const visible = rows.map(key);
      const allOn = visible.length > 0 && visible.every((k) => prev.has(k));
      return allOn ? new Set() : new Set(visible);
    });
  }

  function clearFilters() {
    setKinds([]);
    setStages([]);
    setTerritory("");
    setFrom("");
    setTo("");
  }

  async function runDelete() {
    setDeleting(true);
    setProgress(0);
    const failed: { label: string; error: string }[] = [];

    for (const r of deletable) {
      try {
        await sendJSON(`/api/admin/records/${r.kind}/${r.id}`, "DELETE", { reason });
      } catch (err) {
        failed.push({
          label: r.label,
          error: err instanceof Error ? err.message : "Failed",
        });
      }
      setProgress((p) => p + 1);
    }

    setDeleting(false);
    setFailures(failed);
    const done = deletable.length - failed.length;
    if (done > 0) {
      toast(`Deleted ${done} record${done === 1 ? "" : "s"}`, "ok");
    }
    if (failed.length === 0) {
      setConfirmDelete(false);
      setReason("");
      setSelected(new Set());
    }
    void load();
  }

  return (
    <div className="rc">
      {/* ---- Search and filters ------------------------------------- */}
      <div className="rc-bar">
        <div className="rc-search">
          <Search size={16} className="text-ink-3 shrink-0" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Registration, customer name or account code…"
            aria-label="Search records"
          />
          {q && (
            <button className="rc-clear" onClick={() => setQ("")} aria-label="Clear search">
              <X size={14} />
            </button>
          )}
        </div>
        <button
          className={`btn btn-sm ${showFilters || filtersOn ? "btn-primary" : "btn-ghost"}`}
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={14} />
          Filters{filtersOn ? ` · ${kinds.length + stages.length + (territory ? 1 : 0) + (from || to ? 1 : 0)}` : ""}
        </button>
      </div>

      {showFilters && (
        <div className="rc-filters">
          <div className="rc-filter-row">
            <span className="rc-filter-label">Book</span>
            <div className="rc-chips">
              {(Object.keys(KIND_META) as Kind[]).map((k) => (
                <button
                  key={k}
                  className={`rc-chip ${kinds.includes(k) ? "is-on" : ""}`}
                  onClick={() =>
                    setKinds((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]))
                  }
                >
                  {KIND_META[k].label}
                  {page ? <span className="rc-chip-n">{page.totals[k]}</span> : null}
                </button>
              ))}
            </div>
          </div>

          <div className="rc-filter-row">
            <span className="rc-filter-label">Stage</span>
            <div className="rc-stage-groups">
              {STAGES.map((g) => (
                <div key={g.group} className="rc-stage-group">
                  <span className="rc-stage-head">{g.group}</span>
                  <div className="rc-chips">
                    {g.keys.map(([k, label]) => (
                      <button
                        key={`${g.kind}-${k}`}
                        className={`rc-chip rc-chip-sm ${stages.includes(k) ? "is-on" : ""}`}
                        onClick={() =>
                          setStages((p) =>
                            p.includes(k) ? p.filter((x) => x !== k) : [...p, k],
                          )
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rc-filter-row">
            <span className="rc-filter-label">Territory</span>
            <select value={territory} onChange={(e) => setTerritory(e.target.value)}>
              <option value="">Anywhere</option>
              {territories.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <span className="rc-filter-label rc-filter-label-2">Raised</span>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <span className="rc-dash">to</span>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
            {filtersOn && (
              <button className="btn btn-ghost btn-sm" onClick={clearFilters}>
                Clear
              </button>
            )}
          </div>
        </div>
      )}

      {/* ---- Result summary ------------------------------------------ */}
      <div className="rc-summary">
        {loading ? (
          <span className="rc-muted">
            <Loader2 size={13} className="animate-spin" /> Searching…
          </span>
        ) : (
          <span className="rc-muted">
            {total === 0
              ? "Nothing matches"
              : `${total} record${total === 1 ? "" : "s"} match${total === 1 ? "es" : ""}`}
            {page?.truncated ? ` · showing the newest ${page.limit} of each book` : ""}
          </span>
        )}
      </div>

      {/* ---- Table --------------------------------------------------- */}
      <div className="rc-table-wrap">
        <table className="rc-table">
          <thead>
            <tr>
              <th className="rc-check">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selectedRows.length === rows.length}
                  onChange={toggleAll}
                  aria-label="Select all"
                  disabled={rows.length === 0}
                />
              </th>
              <th>Record</th>
              <th>Book</th>
              <th>Stage</th>
              <th>Territory</th>
              <th>Raised by</th>
              <th>Raised</th>
              <th className="rc-num">Takes with it</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const blocked = undeletableReason(r);
              const attached = r.cascade.photos + r.cascade.events + r.cascade.bids;
              return (
                <tr key={key(r)} className={selected.has(key(r)) ? "is-selected" : ""}>
                  <td className="rc-check">
                    <input
                      type="checkbox"
                      checked={selected.has(key(r))}
                      onChange={() => toggle(r)}
                      aria-label={`Select ${r.label}`}
                    />
                  </td>
                  <td>
                    <div className="rc-label">{r.label}</div>
                    <div className="rc-sub">
                      {[r.customer, r.customerCode].filter(Boolean).join(" · ") || "—"}
                      {r.facts.length ? ` · ${r.facts.join(" · ")}` : ""}
                    </div>
                    {blocked && (
                      <div className="rc-blocked">
                        <ShieldAlert size={12} /> {blocked}
                      </div>
                    )}
                  </td>
                  <td>
                    <Chip tone={KIND_META[r.kind].tone}>{KIND_META[r.kind].short}</Chip>
                  </td>
                  <td>{r.stage}</td>
                  <td>{r.territory ?? "—"}</td>
                  <td>{r.owner ?? "—"}</td>
                  <td>{shortDate(new Date(r.createdAt))}</td>
                  <td className="rc-num">{attached > 0 ? attached : "—"}</td>
                  <td className="rc-actions">
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditing(r)}
                      aria-label={`Correct ${r.label}`}
                    >
                      <Pencil size={13} />
                    </button>
                    {r.href && (
                      <Link className="btn btn-ghost btn-sm" href={r.href} aria-label={`Open ${r.label}`}>
                        <ExternalLink size={13} />
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={9} className="rc-empty">
                  Nothing matches. Widen the filters, or search a registration number.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ---- Selection bar ------------------------------------------- */}
      {selectedRows.length > 0 && (
        <div className="rc-selbar">
          <span className="rc-selcount">{selectedRows.length} selected</span>
          {deletable.length !== selectedRows.length && (
            <span className="rc-selnote">
              {selectedRows.length - deletable.length} cannot be deleted
            </span>
          )}
          <div className="rc-selactions">
            <button className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
              Clear
            </button>
            <button
              className="btn btn-danger btn-sm"
              disabled={deletable.length === 0}
              onClick={() => {
                setFailures([]);
                setConfirmDelete(true);
              }}
            >
              <Trash2 size={14} />
              Delete {deletable.length}
            </button>
          </div>
        </div>
      )}

      {/* ---- Delete confirmation ------------------------------------- */}
      <Modal open={confirmDelete} onClose={() => !deleting && setConfirmDelete(false)} size="md">
        <ModalHeader
          title={`Delete ${deletable.length} record${deletable.length === 1 ? "" : "s"}`}
          subtitle="This cannot be undone. What it takes with it is listed below."
          icon={<AlertTriangle size={18} />}
          tone="bad"
          onClose={() => !deleting && setConfirmDelete(false)}
        />
        <ModalBody>
          <ul className="rc-confirm-list">
            {deletable.slice(0, 8).map((r) => (
              <li key={key(r)}>
                <strong>{r.label}</strong>
                <span>
                  {KIND_META[r.kind].short} · {r.stage}
                </span>
              </li>
            ))}
            {deletable.length > 8 && <li className="rc-muted">…and {deletable.length - 8} more</li>}
          </ul>

          {(cascadeTotal.photos > 0 || cascadeTotal.events > 0 || cascadeTotal.bids > 0) && (
            <div className="rc-cascade">
              <AlertTriangle size={14} />
              <span>
                Also deleted:{" "}
                {[
                  cascadeTotal.photos ? `${cascadeTotal.photos} photograph${cascadeTotal.photos === 1 ? "" : "s"}` : null,
                  cascadeTotal.events ? `${cascadeTotal.events} audit event${cascadeTotal.events === 1 ? "" : "s"}` : null,
                  cascadeTotal.bids ? `${cascadeTotal.bids} offer${cascadeTotal.bids === 1 ? "" : "s"}` : null,
                ]
                  .filter(Boolean)
                  .join(", ")}
                .
              </span>
            </div>
          )}

          <label className="rc-reason">
            <span>
              Why — this is recorded and outlives the record, so it is the only thing
              anybody will have to go on later.
            </span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder="e.g. Duplicate of DHK-12-9981, captured twice on 3 March"
              disabled={deleting}
            />
          </label>

          {deleting && (
            <div className="rc-progress">
              <Loader2 size={14} className="animate-spin" /> {progress} of {deletable.length}
            </div>
          )}

          {failures.length > 0 && (
            <div className="rc-failures">
              <strong>{failures.length} could not be deleted</strong>
              <ul>
                {failures.map((f, i) => (
                  <li key={i}>
                    <span>{f.label}</span> — {f.error}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </ModalBody>
        <ModalFooter>
          <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
            Cancel
          </button>
          <button
            className="btn btn-danger"
            onClick={runDelete}
            disabled={deleting || reason.trim().length < 12}
          >
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            Delete {deletable.length} permanently
          </button>
        </ModalFooter>
      </Modal>

      {editing && (
        <CorrectModal
          row={editing}
          territories={territories}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void load();
          }}
        />
      )}
    </div>
  );
}

/**
 * Correcting the identity fields.
 *
 * Not a general editor. Costs, grades, prices and the stage itself all have
 * audited paths of their own, and a Super Admin can already walk any of them —
 * `canRunAction` lets them run any transition. What has nowhere else to be
 * fixed is a registration number typed wrong on a phone, so that is what this
 * does, and every field written produces an audit row naming both values.
 */
function CorrectModal({
  row,
  territories,
  onClose,
  onSaved,
}: {
  row: Row;
  territories: Territory[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useToast();
  const [registrationNo, setRegistrationNo] = useState(row.label);
  const [customerName, setCustomerName] = useState(row.customer ?? "");
  const [customerCode, setCustomerCode] = useState(row.customerCode ?? "");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await sendJSON<{ changed: number }>(
        `/api/admin/records/${row.kind}/${row.id}`,
        "PATCH",
        { registrationNo, customerName, customerCode, reason: reason.trim() || undefined },
      );
      toast(
        res.changed === 0 ? "Nothing changed" : `${res.changed} field(s) corrected`,
        "ok",
      );
      onSaved();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Could not save", "bad");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open onClose={onClose} size="sm">
      <ModalHeader
        title={`Correct ${row.label}`}
        subtitle="Transcription fields only. Every change is written to the record's own trail."
        icon={<Pencil size={18} />}
        onClose={onClose}
      />
      <ModalBody>
        <label className="rc-field">
          <span>Registration number</span>
          <input value={registrationNo} onChange={(e) => setRegistrationNo(e.target.value)} />
        </label>
        <label className="rc-field">
          <span>Customer name</span>
          <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </label>
        <label className="rc-field">
          <span>Account code</span>
          <input value={customerCode} onChange={(e) => setCustomerCode(e.target.value)} />
        </label>
        <label className="rc-field">
          <span>Why (optional, goes on the trail)</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. plate misread at capture"
          />
        </label>
        {territories.length === 0 && <span className="rc-muted">No territories configured yet.</span>}
      </ModalBody>
      <ModalFooter>
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={save} disabled={saving}>
          {saving && <Loader2 size={14} className="animate-spin" />} Save correction
        </button>
      </ModalFooter>
    </Modal>
  );
}
