"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle, ArrowRight } from "lucide-react";
import type { VehicleGrade } from "@prisma/client";
import { sendJSON } from "@/lib/http";
import { taka } from "@/lib/format";
import { GradeSelector } from "./GradeSelector";

// costBase = repair + transport + other + registration (everything but SOP).
export function SopPanel({
  vehicleId,
  currentSop,
  costBase,
  isFirstSet,
  currentGrade,
  currentPrice,
}: {
  vehicleId: string;
  currentSop: number;
  costBase: number;
  isFirstSet: boolean;
  currentGrade: VehicleGrade | null;
  currentPrice: number | null;
}) {
  const router = useRouter();
  const [sop, setSop] = useState(currentSop ? String(currentSop) : "");
  const [price, setPrice] = useState(currentPrice ? String(currentPrice) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const sopValue = parseFloat(sop) || 0;
  const total = costBase + sopValue;
  const priceValue = parseFloat(price) || 0;
  const margin = priceValue - total;
  const marginPct = priceValue > 0 ? (margin / priceValue) * 100 : null;

  const submit = async () => {
    if (!sop.trim()) {
      setError("Enter the SOP cost.");
      return;
    }
    if (isFirstSet && !price.trim()) {
      setError("Enter a proposed selling price.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/sop`, "POST", {
        sopCost: sopValue,
        ...(isFirstSet ? { price: priceValue } : {}),
      });
      if (isFirstSet) router.push("/dashboard");
      else {
        router.refresh();
        setBusy(false);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(false);
    }
  };

  return (
    <section className="action-panel p-5">
      <h2 className="mb-1 font-display text-[15px] font-bold text-ink">
        {isFirstSet ? "SOP & pricing" : "Update SOP"}
      </h2>
      <p className="mb-4 text-xs text-ink-2">
        {isFirstSet
          ? "Set the SOP cost, grade the condition and propose a selling price for approval."
          : "Revise the SOP figure. The previous value is kept in the activity log."}
      </p>

      <div className="mb-5">
        <GradeSelector vehicleId={vehicleId} currentGrade={currentGrade} />
      </div>

      <label className="label mb-1.5">SOP cost (Tk)</label>
      <input
        className="field tnum text-lg font-semibold"
        type="number"
        inputMode="numeric"
        min={0}
        value={sop}
        onChange={(e) => setSop(e.target.value)}
        placeholder="0"
      />

      {isFirstSet && (
        <>
          <div className="mt-4 rounded-lg bg-surface-2 p-3.5 text-sm">
            <div className="flex justify-between text-ink-2">
              <span>Other costs</span>
              <span className="tnum">{taka(costBase)}</span>
            </div>
            <div className="mt-1.5 flex justify-between border-t border-rule pt-1.5 font-semibold text-ink">
              <span>Total cost</span>
              <span className="tnum">{taka(total)}</span>
            </div>
          </div>

          <label className="label mb-1.5 mt-4">Proposed selling price (Tk)</label>
          <input
            className="field tnum text-xl font-bold"
            type="number"
            inputMode="numeric"
            min={0}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="0"
          />

          {price.trim() !== "" && (
            <div
              className="mt-2.5 flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-semibold"
              style={
                margin >= 0
                  ? { background: "var(--ok-soft)", color: "var(--ok)" }
                  : { background: "var(--bad-soft)", color: "var(--bad)" }
              }
            >
              <span>Proposed margin</span>
              <span className="tnum">
                {taka(margin)}
                {marginPct !== null && <span className="ml-1.5 opacity-70">({marginPct.toFixed(1)}%)</span>}
              </span>
            </div>
          )}
        </>
      )}

      {!isFirstSet && (
        <div className="mt-4 rounded-lg bg-surface-2 p-3.5 text-sm">
          <div className="flex justify-between text-ink-2">
            <span>Other costs</span>
            <span className="tnum">{taka(costBase)}</span>
          </div>
          <div className="mt-1.5 flex justify-between border-t border-rule pt-1.5 font-semibold text-ink">
            <span>Total with SOP</span>
            <span className="tnum">{taka(total)}</span>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <button className="btn btn-primary btn-block mt-4" onClick={submit} disabled={busy}>
        {busy ? (
          <Loader2 size={16} className="animate-spin" />
        ) : isFirstSet ? (
          <>Submit for approval <ArrowRight size={16} /></>
        ) : (
          "Update SOP"
        )}
      </button>
    </section>
  );
}
