"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, Pencil, X, Upload, Undo2 } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { taka } from "@/lib/format";
import { NumberField } from "@/components/ui/NumberField";
import { HandoffDialog } from "@/components/ui/HandoffDialog";
import { ActionModal, type PendingAction } from "@/components/vehicle/ActionModal";

export function GmApprovalPanel({
  vehicleId,
  subject,
  parts,
  currentPrice,
}: {
  vehicleId: string;
  /** Names the vehicle on the hand-off receipt. */
  subject: string;
  parts: { repair: number; transport: number; other: number; registration: number; sop: number; total: number };
  currentPrice: number | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [price, setPrice] = useState(currentPrice != null ? String(currentPrice) : "");
  const [busy, setBusy] = useState<null | "save" | "approve">(null);
  const [error, setError] = useState("");
  const [handedOff, setHandedOff] = useState(false);
  const [sendBack, setSendBack] = useState<PendingAction | null>(null);

  const original = currentPrice ?? 0;
  const value = editing ? parseFloat(price) || 0 : original;
  const changed = editing && value !== original && price.trim() !== "";
  const margin = value - parts.total;
  const marginPct = value > 0 ? (margin / value) * 100 : null;

  const savePrice = async () => {
    await sendJSON(`/api/vehicles/${vehicleId}/price`, "POST", { approvedPrice: value });
  };

  const saveOnly = async () => {
    if (!price.trim()) { setError("Enter a price."); return; }
    setBusy("save"); setError("");
    try {
      await savePrice();
      setEditing(false);
      router.refresh();
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(null);
    }
  };

  const approve = async () => {
    if (editing && !price.trim()) { setError("Enter a price before approving."); return; }
    setBusy("approve"); setError("");
    try {
      if (changed) await savePrice();
      await sendJSON(`/api/vehicles/${vehicleId}/transition`, "POST", { action: "PUSH_LIVE" });
      setHandedOff(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setBusy(null);
    }
  };

  const cancelEdit = () => {
    setPrice(currentPrice != null ? String(currentPrice) : "");
    setEditing(false);
    setError("");
  };

  const handoff = (
    <HandoffDialog
      open={handedOff}
      title="Approved for resale"
      subject={subject}
      facts={[
        { label: "Total cost", value: taka(parts.total) },
        { label: "Selling price", value: taka(value), strong: true },
        {
          label: "Margin",
          value: marginPct === null ? taka(margin) : `${taka(margin)} · ${marginPct.toFixed(1)}%`,
        },
      ]}
      nextDesk="Sales Team"
      nextAction="It is live on the marketplace now and open for customer offers."
      thanks="Thank you — that is the last gate. Eight desks got this vehicle here, and you just put it on the market."
      onContinue={() => router.push("/dashboard")}
    />
  );

  return (
    <>
      {handoff}
    <section className="action-panel p-5">
      <h2 className="mb-1 font-display text-[15px] font-bold text-ink">Final approval</h2>
      <p className="mb-4 text-xs text-ink-2">Confirm the selling price, override it if needed, then push live for resale.</p>

      {/* Cost breakdown */}
      <div className="rounded-lg bg-surface-2 p-3.5 text-sm">
        <Row label="Repair" value={parts.repair} />
        <Row label="Transport" value={parts.transport} />
        <Row label="Other" value={parts.other} />
        <Row label="Registration" value={parts.registration} />
        <Row label="SOP" value={parts.sop} />
        <div className="mt-1.5 flex justify-between border-t border-rule pt-1.5 font-semibold text-ink">
          <span>Total cost</span>
          <span className="tnum">{taka(parts.total)}</span>
        </div>
      </div>

      {/* Hero price */}
      <div className="mt-4 rounded-xl border-2 border-accent-soft bg-accent-soft/40 p-4" style={{ background: "var(--accent-soft)" }}>
        <div className="flex items-center justify-between">
          <span className="label mb-0">Selling price</span>
          {!editing ? (
            <button className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-accent" onClick={() => setEditing(true)}>
              <Pencil size={11} /> Adjust
            </button>
          ) : (
            <button className="inline-flex items-center gap-1 font-mono text-[11px] font-medium text-ink-3" onClick={cancelEdit} disabled={busy !== null}>
              <X size={11} /> Cancel
            </button>
          )}
        </div>

        {!editing ? (
          <div className="mt-1 font-display text-3xl font-bold tnum text-ink">{taka(original)}</div>
        ) : (
          <div className="mt-2 flex items-center gap-2">
            <span className="font-display text-xl font-bold text-ink-3">Tk</span>
            <NumberField
              className="field tnum text-2xl font-bold"
              value={price}
              onChange={setPrice}
              autoFocus
            />
          </div>
        )}

        {/* Margin + revised note */}
        <div className="mt-2.5 flex items-center justify-between">
          <span
            className="rounded-md px-2 py-1 font-mono text-[11px] font-semibold"
            style={margin >= 0 ? { background: "var(--ok-soft)", color: "var(--ok-ink)" } : { background: "var(--bad-soft)", color: "var(--bad-ink)" }}
          >
            Margin {taka(margin)}{marginPct !== null ? ` (${marginPct.toFixed(1)}%)` : ""}
          </span>
          {changed && (
            <span className="inline-flex items-center gap-1 font-mono text-[10px] text-ink-3">
              <Undo2 size={10} /> was {taka(original)}
            </span>
          )}
        </div>
      </div>

      {editing && changed && (
        <button className="btn btn-ghost btn-block mt-3" onClick={saveOnly} disabled={busy !== null}>
          {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : "Save price (keep pending)"}
        </button>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <button className="btn btn-ok btn-block mt-4" onClick={approve} disabled={busy !== null}>
        {busy === "approve" ? <Loader2 size={16} className="animate-spin" /> : (<><Upload size={16} /> {changed ? "Save & approve for resale" : "Approve for resale"}</>)}
      </button>

      <button
        className="btn btn-ghost btn-block mt-2.5 text-bad"
        onClick={() =>
          setSendBack({
            action: "SEND_BACK_TO_AGM",
            label: "Send back to AGM / DGM",
            tone: "danger",
            requiresNote: true,
            detail: "Returns the file to AGM / DGM to revise the price.",
          })
        }
        disabled={busy !== null}
      >
        Send back to AGM / DGM
      </button>

      {sendBack && (
        <ActionModal
          vehicleId={vehicleId}
          pending={sendBack}
          onClose={() => setSendBack(null)}
          onDone={() => {
            setSendBack(null);
            router.refresh();
          }}
        />
      )}
    </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between text-ink-2">
      <span>{label}</span>
      <span className="tnum">{taka(value)}</span>
    </div>
  );
}
