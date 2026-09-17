"use client";

import { useState } from "react";
import { X, Loader2, AlertTriangle } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { useToast } from "@/components/ui/Toast";
import type { QuickAction } from "./types";

interface BulkResult {
  ok: string[];
  failed: { id: string; label: string; error: string }[];
}

/**
 * Batch action bar.
 *
 * Runs the *existing* per-vehicle transition endpoint once per selected file
 * rather than introducing a bulk endpoint. That keeps every guard, every audit
 * event and the whole state machine exactly as they are — a batch here is
 * literally the same sequence of approvals the user would have clicked one at
 * a time, so nothing can slip past a rule that a single action would enforce.
 *
 * Calls run sequentially. In parallel they would race on the same rows and a
 * partial failure would be much harder to report honestly.
 */
export function BulkBar({
  selected,
  actions,
  labelFor,
  onClear,
  onDone,
}: {
  selected: string[];
  actions: QuickAction[];
  /** Human name for a vehicle id, used in the failure report. */
  labelFor: (id: string) => string;
  onClear: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [running, setRunning] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<QuickAction | null>(null);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<BulkResult | null>(null);

  const n = selected.length;

  async function run(action: QuickAction) {
    setRunning(action.action);
    setProgress(0);
    const res: BulkResult = { ok: [], failed: [] };

    for (const id of selected) {
      try {
        await sendJSON(`/api/vehicles/${id}/transition`, "POST", {
          action: action.action,
          note: note.trim() || undefined,
        });
        res.ok.push(id);
      } catch (err) {
        res.failed.push({
          id,
          label: labelFor(id),
          error: err instanceof Error ? err.message : "Failed",
        });
      }
      setProgress((p) => p + 1);
    }

    setRunning(null);
    setConfirm(null);
    setNote("");

    if (res.failed.length === 0) {
      toast(
        `${res.ok.length} ${res.ok.length === 1 ? "file" : "files"} ${action.label.toLowerCase()}`,
        "ok",
      );
      onClear();
      onDone();
    } else {
      // Partial failure is the interesting case: say exactly which ones and
      // leave the selection alone so the user can retry just those.
      setResult(res);
      onDone();
    }
  }

  if (result) {
    return (
      <div className="bulkbar" style={{ paddingRight: 16 }}>
        <AlertTriangle size={17} className="shrink-0 text-warn" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-ink">
            {result.ok.length} succeeded, {result.failed.length} failed
          </p>
          <p className="truncate font-mono text-[11px] text-ink-3">
            {result.failed.map((f) => f.label).join(", ")}: {result.failed[0].error}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setResult(null);
            onClear();
          }}
        >
          Dismiss
        </button>
      </div>
    );
  }

  if (confirm) {
    return (
      <div className="bulkbar" style={{ paddingRight: 16 }}>
        {running ? (
          <>
            <Loader2 size={16} className="shrink-0 animate-spin text-accent" />
            <span className="text-[13px] font-semibold text-ink">
              {confirm.label} — {progress} of {n}
            </span>
          </>
        ) : (
          <>
            <span className="text-[13px] font-semibold text-ink">
              {confirm.label} {n} {n === 1 ? "file" : "files"}?
            </span>
            {confirm.requiresNote && (
              <input
                autoFocus
                className="field"
                style={{ width: 240, padding: "6px 10px", fontSize: 13 }}
                placeholder="Reason (required)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            )}
            <button
              className={`btn btn-sm ${
                confirm.tone === "danger"
                  ? "btn-danger"
                  : confirm.tone === "ok"
                    ? "btn-ok"
                    : "btn-primary"
              }`}
              disabled={confirm.requiresNote && !note.trim()}
              onClick={() => run(confirm)}
            >
              Confirm
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setConfirm(null);
                setNote("");
              }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="bulkbar">
      <span className="text-[13px] font-semibold text-ink">
        {n} selected
      </span>
      <span className="h-4 w-px bg-rule-strong" />
      {actions.map((a) => (
        <button
          key={a.action}
          className={`btn btn-sm ${
            a.tone === "danger" ? "btn-danger" : a.tone === "ok" ? "btn-ok" : "btn-ghost"
          }`}
          onClick={() => setConfirm(a)}
        >
          {a.short}
        </button>
      ))}
      <button
        onClick={onClear}
        className="grid h-7 w-7 place-items-center rounded-full text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
        aria-label="Clear selection"
      >
        <X size={15} />
      </button>
    </div>
  );
}
