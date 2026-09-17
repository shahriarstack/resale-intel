"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { taka } from "@/lib/format";
import { NumberField } from "@/components/ui/NumberField";
import { HandoffDialog } from "@/components/ui/HandoffDialog";

export function PricePanel({
  vehicleId,
  subject,
  parts,
  currentPrice,
  isFirstApproval,
}: {
  vehicleId: string;
  /** Names the vehicle on the hand-off receipt. */
  subject: string;
  parts: { repair: number; transport: number; other: number; registration: number; sop: number; total: number };
  currentPrice: number | null;
  isFirstApproval: boolean;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(currentPrice ? String(currentPrice) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [handedOff, setHandedOff] = useState(false);

  const value = parseFloat(price) || 0;
  const margin = value - parts.total;
  const marginPct = value > 0 ? (margin / value) * 100 : null;

  const submit = async () => {
    if (!price.trim()) {
      setError("Enter the approved price.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/price`, "POST", { approvedPrice: value });
      if (isFirstApproval) setHandedOff(true);
      else {
        router.refresh();
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  };

  const handoff = (
    <HandoffDialog
      open={handedOff}
      title="Price approved"
      subject={subject}
      facts={[
        { label: "Total cost", value: taka(parts.total) },
        { label: "Approved price", value: taka(value), strong: true },
        {
          label: "Margin",
          value: marginPct === null ? taka(margin) : `${taka(margin)} · ${marginPct.toFixed(1)}%`,
        },
      ]}
      nextDesk="BM"
      nextAction="Gives the final sign-off that puts it on the marketplace."
      thanks="Thank you — this is the number the whole recovery is judged on."
      onContinue={() => router.push("/dashboard")}
    />
  );

  return (
    <>
      {handoff}
    <section className="action-panel p-5">
      <h2 className="mb-1 font-display text-[15px] font-bold text-ink">
        {isFirstApproval ? "Approve price" : "Revise price"}
      </h2>
      <p className="mb-4 text-xs text-ink-2">
        {isFirstApproval
          ? "Review the price proposed by the Sr. Executive, adjust if needed, then approve."
          : "Revise the approved selling price against the full cost."}
      </p>

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

      <div className="mt-4">
        <label className="label mb-1.5">Approved price (Tk)</label>
        <NumberField
          className="field tnum text-xl font-bold"
          value={price}
          onChange={setPrice}
          placeholder="0"
        />
      </div>

      {price.trim() !== "" && (
        <div
          className="mt-3 flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-semibold"
          style={
            margin >= 0
              ? { background: "var(--ok-soft)", color: "var(--ok-ink)" }
              : { background: "var(--bad-soft)", color: "var(--bad-ink)" }
          }
        >
          <span>Margin</span>
          <span className="tnum">
            {taka(margin)}
            {marginPct !== null && <span className="ml-1.5 opacity-70">({marginPct.toFixed(1)}%)</span>}
          </span>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <button className="btn btn-ok btn-block mt-4" onClick={submit} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : isFirstApproval ? "Approve price" : "Revise price"}
      </button>
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
