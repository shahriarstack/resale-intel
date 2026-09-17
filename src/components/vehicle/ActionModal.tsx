"use client";

import { useEffect, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import { sendJSON } from "@/lib/http";
import type { Action } from "@/lib/rbac";

export interface PendingAction {
  action: Action;
  label: string;
  requiresNote?: boolean;
  tone?: "primary" | "ok" | "danger";
  detail?: string;
}

export function ActionModal({
  vehicleId,
  pending,
  onClose,
  onDone,
}: {
  vehicleId: string;
  pending: PendingAction;
  onClose: () => void;
  onDone: () => void;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const confirmClass =
    pending.tone === "danger" ? "btn-danger" : pending.tone === "ok" ? "btn-ok" : "btn-primary";

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handler);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  const run = async () => {
    if (pending.requiresNote && !note.trim()) {
      setError("A reason is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/transition`, "POST", {
        action: pending.action,
        note: note.trim() || undefined,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  };

  return (
    <div className="backdrop backdrop-mobile" onClick={onClose}>
      <div className="modal-panel p-6" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-display text-xl font-bold text-ink">{pending.label}</h3>
        {pending.detail && <p className="mt-1.5 text-sm leading-relaxed text-ink-2">{pending.detail}</p>}

        <div className="mt-5">
          <label className="label mb-1.5">
            Reason {pending.requiresNote ? "" : <span className="normal-case tracking-normal text-ink-3">(optional)</span>}
          </label>
          <textarea
            className="field resize-none text-sm"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={pending.requiresNote ? "Explain the reason..." : "Add a note (optional)..."}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) run();
            }}
          />
          <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[10px] text-ink-3">
            <span className="kbd">Ctrl</span>+<span className="kbd">Enter</span> to confirm
          </p>
        </div>

        {error && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="text-xs font-medium">{error}</span>
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className={`btn ${confirmClass}`} onClick={run} disabled={busy}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : pending.label.split(" ")[0]}
          </button>
        </div>
      </div>
    </div>
  );
}
