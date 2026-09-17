"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Unlock,
  Lock,
  Loader2,
  ShieldCheck,
  Truck,
  MapPin,
  Infinity as InfinityIcon,
} from "lucide-react";
import { getJSON, sendJSON } from "@/lib/http";
import { Chip } from "@/components/ui/Chip";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { shortDate, dateTime } from "@/lib/format";
import { WINDOW_STATE_META, timeLeftLabel, type WindowState } from "@/lib/captureWindow";

/**
 * The direct-capture window console.
 *
 * This is the one screen in the product that can suspend a rule, so it is
 * written to make that feel like what it is. Two halves: what is open right
 * now, stated first and in plain language, and the ledger of everything ever
 * opened underneath it. The form to open a new one sits between them rather
 * than at the top, because reading what is already open should come before
 * adding to it.
 */

interface Territory {
  id: string;
  name: string;
}

interface WindowRow {
  id: string;
  reason: string;
  opensAt: string;
  closesAt: string;
  maxCaptures: number | null;
  openedAt: string;
  closedAt: string | null;
  closeNote: string | null;
  territory: { id: string; name: string } | null;
  openedBy: { name: string; staffId: string };
  closedBy: { name: string } | null;
  used: number;
  state: WindowState;
}

export default function CaptureWindowsPage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<WindowRow[] | null>(null);
  const [territories, setTerritories] = useState<Territory[]>([]);
  const [closing, setClosing] = useState<WindowRow | null>(null);

  const load = useCallback(() => {
    getJSON<WindowRow[]>("/api/admin/capture-windows")
      .then(setRows)
      .catch((e) => toast(e.message, "bad"));
  }, [toast]);

  useEffect(() => {
    load();
    getJSON<Territory[]>("/api/admin/territories")
      .then((t) => setTerritories(t.filter((x) => x)))
      .catch(() => setTerritories([]));
  }, [load]);

  const live = useMemo(
    () => (rows ?? []).filter((w) => w.state === "open" || w.state === "scheduled"),
    [rows],
  );
  const past = useMemo(
    () => (rows ?? []).filter((w) => w.state !== "open" && w.state !== "scheduled"),
    [rows],
  );

  const totalBackfilled = useMemo(
    () => (rows ?? []).reduce((n, w) => n + w.used, 0),
    [rows],
  );

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-7 lg:px-8">
      <header className="mb-6" style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}>
        <div className="eyebrow text-accent">Administration</div>
        <h1 className="page-title mt-1 text-[28px]">Direct-capture windows</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] text-ink-2">
          A capture normally needs an approved request before the vehicle is touched. Opening a
          window suspends that for a named reason, for a set number of days, so officers can
          enter vehicles that were already in hand. Every vehicle recorded this way is marked
          on its file, permanently, with the window that let it in.
        </p>
      </header>

      {/* ---- What is open right now ---- */}
      <section className="mb-5">
        {rows === null ? (
          <div className="card grid h-28 place-items-center">
            <Loader2 size={20} className="animate-spin text-ink-3" />
          </div>
        ) : live.length === 0 ? (
          <div className="cw-shut">
            <span className="cw-shut-plate">
              <ShieldCheck size={20} strokeWidth={1.8} />
            </span>
            <div>
              <div className="cw-shut-title">The gate is shut</div>
              <p className="cw-shut-note">
                Every capture right now needs an approved request or a converted off-road case.
                That is the normal state and the one to leave it in.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {live.map((w) => (
              <LiveWindow key={w.id} w={w} onClose={() => setClosing(w)} />
            ))}
          </div>
        )}
      </section>

      <OpenForm territories={territories} onOpened={load} />

      {/* ---- The ledger ---- */}
      {past.length > 0 && (
        <section className="mt-7">
          <div className="mb-2.5 flex items-baseline justify-between gap-3">
            <h2 className="font-display text-base font-bold text-ink">Closed windows</h2>
            <span className="font-mono text-[11px] text-ink-3">
              {totalBackfilled} vehicle{totalBackfilled === 1 ? "" : "s"} entered this way in all
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {past.map((w) => (
              <PastWindow key={w.id} w={w} />
            ))}
          </div>
        </section>
      )}

      {/* Keyed and conditionally mounted, so every open starts with an empty
          note rather than an effect clearing the previous one. Same pattern
          DetailPane uses for the same reason. */}
      {closing && (
        <CloseDialog
          key={closing.id}
          w={closing}
          onCancel={() => setClosing(null)}
          onClosed={() => {
            setClosing(null);
            load();
          }}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

function LiveWindow({ w, onClose }: { w: WindowRow; onClose: () => void }) {
  const meta = WINDOW_STATE_META[w.state];
  const left = w.maxCaptures === null ? null : Math.max(0, w.maxCaptures - w.used);
  // The bar is the cap, not the clock. An admin watching a window is watching
  // how much of the allowance has gone — the time remaining is a number they
  // can read, but "23 of 31" is the thing that tells them whether the backlog
  // is nearly in.
  const pct = w.maxCaptures ? Math.min(100, (w.used / w.maxCaptures) * 100) : null;

  return (
    <article className="cw-live">
      <div className="cw-live-top">
        <span className="cw-live-plate">
          <Unlock size={17} strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={meta.tone}>{meta.label}</Chip>
            {w.state === "open" && (
              <span className="cw-clock">{timeLeftLabel(new Date(w.closesAt))}</span>
            )}
            {w.territory ? (
              <span className="cw-scope">
                <MapPin size={11} /> {w.territory.name} only
              </span>
            ) : (
              <span className="cw-scope">
                <MapPin size={11} /> Every territory
              </span>
            )}
          </div>
          <p className="cw-reason">{w.reason}</p>
          <p className="cw-meta">
            Opened by {w.openedBy.name} · {dateTime(w.openedAt)} · closes{" "}
            {shortDate(w.closesAt)}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm shrink-0" onClick={onClose}>
          <Lock size={14} /> Close now
        </button>
      </div>

      <div className="cw-usage">
        <div className="cw-usage-figures">
          <span className="cw-usage-n">{w.used}</span>
          <span className="cw-usage-l">
            {w.used === 1 ? "vehicle" : "vehicles"} entered
            {w.maxCaptures !== null ? ` of ${w.maxCaptures} allowed` : ""}
          </span>
          {left !== null ? (
            <span className="cw-usage-left">{left} left</span>
          ) : (
            <span className="cw-usage-left cw-usage-uncapped">
              <InfinityIcon size={12} /> uncapped
            </span>
          )}
        </div>
        {pct !== null && (
          <div className="cw-bar" role="presentation">
            <span className="cw-bar-fill" style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>
    </article>
  );
}

function PastWindow({ w }: { w: WindowRow }) {
  const meta = WINDOW_STATE_META[w.state];
  return (
    <article className="cw-past">
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={meta.tone}>{meta.label}</Chip>
          <span className="font-mono text-[11px] text-ink-3">
            {shortDate(w.opensAt)} → {shortDate(w.closedAt ?? w.closesAt)}
          </span>
          {w.territory && (
            <span className="font-mono text-[11px] text-ink-3">· {w.territory.name}</span>
          )}
        </div>
        <p className="cw-past-reason">{w.reason}</p>
        {w.closeNote && (
          <p className="cw-past-note">
            Closed early by {w.closedBy?.name ?? "an admin"} — {w.closeNote}
          </p>
        )}
      </div>
      <div className="cw-past-count">
        <Truck size={13} />
        <span>{w.used}</span>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

function OpenForm({
  territories,
  onOpened,
}: {
  territories: Territory[];
  onOpened: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reason, setReason] = useState("");
  const [days, setDays] = useState("7");
  const [maxCaptures, setMaxCaptures] = useState("");
  const [territoryId, setTerritoryId] = useState("");

  // Days rather than a closing date. An admin opening this is thinking "give
  // them the rest of the week", not "close it on the 14th" — and a duration
  // cannot be accidentally set in the past, which a date can.
  const closesAt = useMemo(() => {
    const n = Number(days);
    if (!Number.isFinite(n) || n < 1) return null;
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [days]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!closesAt) {
      setError("Give the window a length in days.");
      return;
    }
    setBusy(true);
    try {
      await sendJSON("/api/admin/capture-windows", "POST", {
        reason: reason.trim(),
        closesAt,
        maxCaptures: maxCaptures.trim() === "" ? null : Number(maxCaptures),
        territoryId,
      });
      toast("Window opened — officers in scope can now enter captures directly");
      setReason("");
      setMaxCaptures("");
      setTerritoryId("");
      setDays("7");
      setOpen(false);
      onOpened();
    } catch (err) {
      const m = err instanceof Error ? err.message : "Could not open the window";
      setError(m);
      toast(m, "bad");
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button className="cw-open-trigger" onClick={() => setOpen(true)}>
        <span className="cw-open-plate">
          <Unlock size={17} strokeWidth={2} />
        </span>
        <span className="min-w-0">
          <span className="cw-open-title">Open a window</span>
          <span className="cw-open-note">
            Let officers enter vehicles already in hand, without a capture request
          </span>
        </span>
      </button>
    );
  }

  return (
    <form className="cw-form" onSubmit={submit}>
      <div className="cw-form-head">
        <span className="cw-open-plate">
          <Unlock size={17} strokeWidth={2} />
        </span>
        <div>
          <h2 className="cw-form-title">Open a window</h2>
          <p className="cw-form-sub">
            Officers in scope will see a direct-capture card on their intake screen until it
            closes.
          </p>
        </div>
      </div>

      <label className="label mb-1.5 block" htmlFor="cw-reason">
        Why
      </label>
      <textarea
        id="cw-reason"
        className="field resize-none"
        rows={2}
        required
        minLength={20}
        maxLength={600}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. August 2026 yard reconciliation — 31 units seized before the request gate existed"
      />
      <p className="mt-1.5 text-[11.5px] text-ink-3">
        Shown to every officer who uses the window, and kept on each vehicle it lets in.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label mb-1.5 block" htmlFor="cw-days">
            Open for
          </label>
          <div className="cw-days">
            <input
              id="cw-days"
              type="number"
              min={1}
              max={60}
              required
              className="field font-mono tnum"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
            <span className="cw-days-unit">days</span>
          </div>
          {closesAt && (
            <p className="mt-1.5 font-mono text-[11px] text-ink-3">
              until {shortDate(closesAt)}
            </p>
          )}
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="cw-cap">
            Vehicle cap
          </label>
          <input
            id="cw-cap"
            type="number"
            min={1}
            max={2000}
            className="field font-mono tnum"
            value={maxCaptures}
            onChange={(e) => setMaxCaptures(e.target.value)}
            placeholder="No limit"
          />
          <p className="mt-1.5 text-[11px] text-ink-3">
            {maxCaptures.trim() === ""
              ? "Uncapped — set it if you know the count"
              : `Stops after ${maxCaptures}`}
          </p>
        </div>

        <div>
          <label className="label mb-1.5 block" htmlFor="cw-terr">
            Scope
          </label>
          <select
            id="cw-terr"
            className="field"
            value={territoryId}
            onChange={(e) => setTerritoryId(e.target.value)}
          >
            <option value="">Every territory</option>
            {territories.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} only
              </option>
            ))}
          </select>
          <p className="mt-1.5 text-[11px] text-ink-3">
            {territoryId ? "Officers posted there" : "Every recovery officer"}
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-3 text-[12.5px]" role="alert" style={{ color: "var(--bad-ink)" }}>
          {error}
        </p>
      )}

      <div className="cw-form-foot">
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          Cancel
        </button>
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Unlock size={14} />}
          Open the window
        </button>
      </div>
    </form>
  );
}

/* -------------------------------------------------------------------------- */

function CloseDialog({
  w,
  onCancel,
  onClosed,
}: {
  w: WindowRow;
  onCancel: () => void;
  onClosed: () => void;
}) {
  const { toast } = useToast();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");


  const run = async () => {
    if (note.trim().length < 5) {
      setError("Say why it is being closed early.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/admin/capture-windows/${w.id}`, "PATCH", { closeNote: note.trim() });
      toast("Window closed — direct capture is off again");
      onClosed();
    } catch (err) {
      const m = err instanceof Error ? err.message : "Could not close the window";
      setError(m);
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => {} : onCancel}
      size="md"
      labelledBy="cw-close-title"
      closeOnBackdrop={false}
      closeOnEscape={!busy}
    >
      <ModalHeader
        titleId="cw-close-title"
        title="Close this window now"
        subtitle="Officers lose direct capture the moment you confirm."
        icon={<Lock size={17} />}
        tone="warn"
        onClose={busy ? undefined : onCancel}
      />
      <ModalBody>
        <p className="text-[13px] leading-relaxed text-ink-2">
          {w.used === 0
            ? "Nothing has come through it yet."
            : `${w.used} vehicle${w.used === 1 ? " has" : "s have"} already been entered under it. Those records keep their mark and their link to this window — closing it only stops new ones.`}
        </p>
        <label className="label mb-1.5 mt-4 block" htmlFor="cw-close-note">
          Why
        </label>
        <textarea
          id="cw-close-note"
          className="field resize-none text-sm"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Backlog is in — 31 of 31 entered"
        />
        {error && (
          <p className="mt-2 text-[12.5px]" role="alert" style={{ color: "var(--bad-ink)" }}>
            {error}
          </p>
        )}
      </ModalBody>
      <ModalFooter>
        <button className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Keep it open
        </button>
        <button className="btn btn-danger btn-sm" onClick={run} disabled={busy}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
          Close the window
        </button>
      </ModalFooter>
    </Modal>
  );
}
