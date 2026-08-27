"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Gavel, Loader2, X, TrendingUp, TrendingDown, AlertCircle, History } from "lucide-react";
import { getJSON, sendJSON } from "@/lib/http";
import { taka, timeAgo } from "@/lib/format";
import { useToast } from "@/components/ui/Toast";
import type { BidRow } from "@/lib/bids";

interface BidsResponse {
  sealed: boolean;
  bids: BidRow[];
}

export function BidModal({
  vehicleId,
  title,
  make,
  registrationNo,
  approvedPrice,
  currentBid,
  onClose,
}: {
  vehicleId: string;
  title: string;
  make: string | null;
  registrationNo: string;
  approvedPrice: number | null;
  currentBid: number | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [amount, setAmount] = useState(currentBid ? String(currentBid) : "");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [history, setHistory] = useState<BidRow[] | null>(null);

  // Esc to close, and lock the page behind the dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose, busy]);

  // My own past offers on this vehicle (sealed — the API returns only mine).
  useEffect(() => {
    let active = true;
    getJSON<BidsResponse>(`/api/vehicles/${vehicleId}/bids`)
      .then((r) => {
        if (active) setHistory(r.bids.filter((b) => b.isMine));
      })
      .catch(() => {
        if (active) setHistory([]);
      });
    return () => {
      active = false;
    };
  }, [vehicleId]);

  const value = Number(amount);
  const valid = amount.trim() !== "" && Number.isFinite(value) && value > 0;
  const delta = valid && approvedPrice !== null ? value - approvedPrice : null;

  const submit = async () => {
    if (!valid) {
      setError("Enter an amount above zero.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/bids`, "POST", { amount: value, note });
      toast(`Bid of ${taka(value)} placed on ${title}`);
      onClose();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not place the bid");
      setBusy(false);
    }
  };

  return (
    <div className="backdrop backdrop-center" onClick={() => !busy && onClose()}>
      <div className="modal-panel max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <Gavel size={15} />
              </span>
              <h3 className="truncate font-display text-xl font-bold text-ink">{title}</h3>
            </div>
            <p className="mt-1 font-mono text-[11px] text-ink-3">
              {registrationNo}
              {make && ` · ${make}`}
            </p>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Asking price — a guide, not a floor */}
        <div className="mb-4 flex items-center justify-between rounded-lg bg-surface-2 px-3.5 py-2.5">
          <span className="text-sm text-ink-2">Asking price</span>
          <span className="font-mono text-sm font-semibold tnum text-ink">
            {taka(approvedPrice)}
          </span>
        </div>

        <label className="label mb-1.5 block">Your bid (Tk)</label>
        <input
          className="field font-mono text-lg"
          type="number"
          inputMode="numeric"
          min={1}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && valid && !busy) submit();
          }}
        />

        {valid && (
          <div className="mt-2 flex items-center gap-1.5" style={{ animation: "fadeIn 0.15s ease" }}>
            <span className="font-mono text-xs font-semibold tnum text-ink">{taka(value)}</span>
            {delta !== null && delta !== 0 && (
              <span
                className="flex items-center gap-1 font-mono text-[11px]"
                style={{ color: delta > 0 ? "var(--ok)" : "var(--warn)" }}
              >
                {delta > 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                {taka(Math.abs(delta))} {delta > 0 ? "above" : "below"} asking
              </span>
            )}
          </div>
        )}

        {/* Soft guide: a low bid is allowed, but the officer is told. */}
        {delta !== null && delta < 0 && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg border px-3 py-2.5 text-xs"
            style={{
              borderColor: "var(--warn)",
              background: "var(--warn-soft)",
              color: "var(--warn)",
            }}
          >
            <AlertCircle size={14} className="mt-px shrink-0" />
            <span>
              This is below the asking price. The bid will still be recorded — management
              decides whether to accept it.
            </span>
          </div>
        )}

        <label className="label mb-1.5 mt-4 block">Note (optional)</label>
        <textarea
          className="field resize-none text-sm"
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Buyer interest, payment terms…"
        />

        {/* Own history — sealed, so only ever the viewer's own offers */}
        {history && history.length > 0 && (
          <div className="mt-4 rounded-lg border border-rule bg-surface-2 p-3">
            <div className="mb-2 flex items-center gap-1.5">
              <History size={12} className="text-ink-3" />
              <span className="label">Your previous offers</span>
            </div>
            <ul className="flex flex-col gap-1">
              {history.slice(0, 4).map((b, i) => (
                <li key={b.id} className="flex items-center justify-between gap-2">
                  <span
                    className="font-mono text-xs tnum"
                    style={{ color: i === 0 ? "var(--ink)" : "var(--ink-3)" }}
                  >
                    {taka(b.amount)}
                    {i === 0 && (
                      <span className="ml-1.5 text-[10px] font-semibold text-accent">standing</span>
                    )}
                  </span>
                  <span className="font-mono text-[10px] text-ink-3" suppressHydrationWarning>
                    {timeAgo(b.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <p className="mt-3 font-mono text-[10px] leading-relaxed text-ink-3">
          Bids are sealed — other officers cannot see your offer. Bidding again replaces your
          standing offer and keeps the earlier one on record.
        </p>

        {error && (
          <div
            className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-xs font-medium text-bad"
            style={{ animation: "scaleIn 0.15s ease" }}
          >
            <AlertCircle size={14} className="mt-px shrink-0" />
            {error}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          <button className="btn btn-ghost" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !valid}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : currentBid ? "Update bid" : "Place bid"}
          </button>
        </div>
      </div>
    </div>
  );
}
