"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Check, ShieldCheck } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { taka, shortDate } from "@/lib/format";
import { Chip } from "@/components/ui/Chip";
import {
  CostLineEditor,
  cleanLines,
  linesTotal,
  newLine,
  type EditableLine,
} from "@/components/vehicle/CostLineEditor";
import { ValidityDaysPicker } from "@/components/registration/ValidityDaysPicker";
import { DEFAULT_VALID_DAYS, readValidity, STATE_META } from "@/lib/registrationValidity";

/** One tap to start a line with the right words already in it. The two named
 *  categories only — anything else is typed, but these two recur on almost
 *  every vehicle and should not be spelled three different ways across the
 *  fleet. */
const SUGGESTIONS = ["Registration renewal", "Fitness renewal"];

/**
 * Registration's standing watch, on the vehicle it belongs to.
 *
 * Every other cost editor in this app — the engineer's estimate, SOP, price —
 * lives here, on the vehicle's own page, for as long as that desk's window is
 * open. This is the one exception that stays open indefinitely: the estimate
 * for what it would cost to bring this vehicle's papers current TODAY keeps
 * drifting for as long as it sits unsold, long after Registration's own turn
 * in the queue has passed, so the panel does not close behind them the way
 * every other desk's does.
 *
 * Saving is one action, always: the cost AND the window move together. There
 * is no "just the cost, leave the date", because looking at this vehicle again
 * IS the event the window exists to date — an estimate whose validity did not
 * move is an estimate nobody re-checked.
 */
export function RegistrationStatusPanel({
  vehicleId,
  initialLines,
  validUntil,
  validDays,
  sold,
}: {
  vehicleId: string;
  initialLines: { description: string; amount: number }[];
  validUntil: string;
  validDays: number | null;
  sold: boolean;
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.length
      ? initialLines.map((l, i) => ({ key: `i${i}`, description: l.description, amount: String(l.amount) }))
      : [newLine()],
  );
  const [days, setDays] = useState(String(validDays ?? DEFAULT_VALID_DAYS));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState<string | null>(null);

  const read = useMemo(() => readValidity(savedAt ?? validUntil, sold), [savedAt, validUntil, sold]);
  const meta = STATE_META[read.state];
  const currentTotal = initialLines.reduce((s, l) => s + l.amount, 0);
  const draftTotal = linesTotal(lines);
  const dirty = draftTotal !== currentTotal;

  const addSuggestion = (label: string) =>
    setLines((ls) => {
      // A blank first row is the empty state, not a real line — filling it in
      // beats leaving it and adding a second empty one beside it.
      if (ls.length === 1 && !ls[0].description.trim() && !ls[0].amount) {
        return [{ ...ls[0], description: label }];
      }
      return [...ls, { ...newLine(), description: label }];
    });

  const save = async () => {
    setError("");
    const n = parseInt(days, 10);
    if (!n || n < 1) {
      setError("Choose how many days this estimate is valid for.");
      return;
    }
    const clean = cleanLines(lines);
    if (clean.some((l) => !l.description)) {
      setError("Every cost line needs a description.");
      return;
    }
    setBusy(true);
    try {
      const res = await sendJSON<{ validUntil: string; days: number; costTotal: number }>(
        `/api/vehicles/${vehicleId}/registration-validity`,
        "POST",
        { days: n, lines: clean },
      );
      setSavedAt(res.validUntil);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="action-panel p-5">
      <div className="mb-1 flex items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 font-display text-[15px] font-bold text-ink">
            <ShieldCheck size={15} className="text-accent" />
            Registration status &amp; costing
          </h2>
          <p className="text-xs text-ink-2">
            What it would cost to bring this vehicle&rsquo;s papers current today. Update it
            any time — especially if it has sat unsold for a while.
          </p>
        </div>
        <Chip tone={meta.tone}>{meta.label}</Chip>
      </div>

      <div className="mt-3 rounded-lg bg-surface-2 p-3.5">
        <div className="flex items-baseline justify-between">
          <span className="label mb-0">Valid until</span>
          <span className="text-sm font-semibold text-ink">
            {read.validUntil ? shortDate(read.validUntil) : "—"}
          </span>
        </div>
        <p className="mt-0.5 text-xs text-ink-3">
          {sold
            ? "Sold — the paperwork is the new owner's concern now."
            : read.state === "expired"
              ? `Expired ${Math.abs(read.daysLeft ?? 0)} day${Math.abs(read.daysLeft ?? 0) === 1 ? "" : "s"} ago.`
              : `${read.daysLeft} day${read.daysLeft === 1 ? "" : "s"} left.`}
        </p>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">Estimated cost</span>
          <span className="flex gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => addSuggestion(s)}
              >
                + {s}
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
      </div>

      <div className="mt-4">
        <label className="label mb-1.5 block">Estimate valid for</label>
        <ValidityDaysPicker value={days} onChange={setDays} disabled={busy} />
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <button className="btn btn-primary btn-block mt-4" onClick={save} disabled={busy}>
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : (
          <>
            <Check size={15} />
            {dirty ? `Update status · ${taka(draftTotal)}` : "Update status"}
          </>
        )}
      </button>
    </section>
  );
}
