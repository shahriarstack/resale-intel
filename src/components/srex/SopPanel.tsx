"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  CalendarClock,
  PauseCircle,
  RefreshCw,
  Handshake,
} from "lucide-react";
import type { VehicleGrade } from "@prisma/client";
import { sendJSON } from "@/lib/http";
import { taka, shortDate } from "@/lib/format";
import { readCycle, cycleLabel, MAX_EXTENSION_DAYS } from "@/lib/resale";
import { GradeSelector } from "./GradeSelector";
import { NumberField } from "@/components/ui/NumberField";
import { HandoffDialog } from "@/components/ui/HandoffDialog";

/**
 * The Sr. Executive's pricing panel.
 *
 * Three jobs in one place, because they are one decision made monthly: what
 * the vehicle costs to hold (SOP), what it costs to sell (dealer commission),
 * and how long the resulting price stands (the pricing month).
 *
 * A carry-forward vehicle — one that did not sell and has come off the market
 * — is re-priced here: both figures move, usually upward, and re-listing opens
 * a fresh month.
 */
export function SopPanel({
  vehicleId,
  subject,
  currentSop,
  currentCommission,
  costBase,
  isFirstSet,
  currentGrade,
  currentPrice,
  /** Null until the vehicle reaches the marketplace. */
  cycleEndsAt,
  /** True once the vehicle is live and the cycle controls become meaningful. */
  isLive,
}: {
  vehicleId: string;
  /** Names the vehicle on the hand-off receipt. */
  subject: string;
  currentSop: number;
  currentCommission: number;
  /** repair + transport + other + registration — everything but SOP and commission. */
  costBase: number;
  isFirstSet: boolean;
  currentGrade: VehicleGrade | null;
  currentPrice: number | null;
  cycleEndsAt: string | null;
  isLive: boolean;
}) {
  const router = useRouter();
  const [sop, setSop] = useState(currentSop ? String(currentSop) : "");
  const [commission, setCommission] = useState(
    currentCommission ? String(currentCommission) : "",
  );
  const [price, setPrice] = useState(currentPrice ? String(currentPrice) : "");
  const [extendTo, setExtendTo] = useState("");
  const [busy, setBusy] = useState<null | "save" | "relist" | "extend">(null);
  const [error, setError] = useState("");
  const [handedOff, setHandedOff] = useState(false);

  const cycle = readCycle(cycleEndsAt);
  const sopValue = parseFloat(sop) || 0;
  const commissionValue = parseFloat(commission) || 0;
  const total = costBase + sopValue + commissionValue;
  const priceValue = parseFloat(price) || 0;
  const margin = priceValue - total;
  const marginPct = priceValue > 0 ? (margin / priceValue) * 100 : null;

  const carried = sopValue - currentSop;
  const commissionMoved = commissionValue - currentCommission;

  const save = async (relist: boolean) => {
    if (!sop.trim()) {
      setError("Enter the SOP cost.");
      return;
    }
    if (isFirstSet && !price.trim()) {
      setError("Enter a proposed selling price.");
      return;
    }
    setBusy(relist ? "relist" : "save");
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/sop`, "POST", {
        sopCost: sopValue,
        dealerCommission: commissionValue,
        ...(isFirstSet ? { price: priceValue } : {}),
        ...(relist ? { relist: true } : {}),
      });
      if (isFirstSet) setHandedOff(true);
      else {
        router.refresh();
        setBusy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(null);
    }
  };

  const extend = async () => {
    if (!extendTo) {
      setError("Pick the new end date.");
      return;
    }
    setBusy("extend");
    setError("");
    try {
      // Sent as end-of-day so "extend to the 5th" includes the whole of the 5th.
      const [y, m, d] = extendTo.split("-").map(Number);
      const endsAt = new Date(y, m - 1, d, 23, 59, 59, 999);
      await sendJSON(`/api/vehicles/${vehicleId}/resale-cycle`, "POST", {
        endsAt: endsAt.toISOString(),
      });
      setExtendTo("");
      router.refresh();
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not extend");
      setBusy(null);
    }
  };

  const handoff = (
    <HandoffDialog
      open={handedOff}
      title="Sent for price approval"
      subject={subject}
      facts={[
        { label: "SOP cost", value: taka(sopValue) },
        { label: "Dealer commission", value: taka(commissionValue) },
        { label: "Total cost", value: taka(total) },
        { label: "Proposed price", value: taka(priceValue), strong: true },
        {
          label: "Margin",
          value: marginPct === null ? taka(margin) : `${taka(margin)} · ${marginPct.toFixed(1)}%`,
        },
      ]}
      nextDesk="AGM / DGM"
      nextAction="Reviews the cost basis and sets the approved selling price."
      thanks="Thank you — the SOP you set here is what every margin downstream is measured against."
      onContinue={() => router.push("/dashboard")}
    />
  );

  return (
    <>
      {handoff}
    <section className="action-panel p-5">
      <h2 className="mb-1 font-display text-[15px] font-bold text-ink">
        {isFirstSet ? "SOP & pricing" : cycle.onHold ? "Re-price for this month" : "Update pricing"}
      </h2>
      <p className="mb-4 text-xs leading-relaxed text-ink-2">
        {isFirstSet
          ? "Set the SOP cost and dealer commission, grade the condition, and propose a selling price."
          : cycle.onHold
            ? "This vehicle is held. Revise the carrying cost for the new month, then return it to the marketplace."
            : "Revise the figures. Previous values are kept in the activity log."}
      </p>

      {/* ---- Pricing month ----
          Shown before the inputs on a held vehicle: the hold is the reason the
          Sr. Executive opened this panel, so it should not be below the fold. */}
      {isLive && (
        <div className="cycle-card" data-state={cycle.onHold ? "held" : cycle.closing ? "closing" : "open"}>
          <div className="flex items-start gap-2">
            {cycle.onHold ? (
              <PauseCircle size={15} className="mt-0.5 shrink-0" />
            ) : (
              <CalendarClock size={15} className="mt-0.5 shrink-0" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold leading-tight">{cycleLabel(cycle)}</p>
              {cycle.endsAt && (
                <p className="mt-0.5 font-mono text-[10px] opacity-80">
                  {cycle.onHold ? "ended" : "ends"} {shortDate(cycle.endsAt)}
                </p>
              )}
              {cycle.onHold && (
                <p className="mt-1.5 text-[11px] leading-snug opacity-90">
                  No new bids are being accepted. Offers already placed still stand.
                </p>
              )}
            </div>
          </div>

          {/* Extending buys days without re-pricing — for a sale that is nearly
              closed and does not deserve a whole new month. */}
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <input
              type="date"
              className="field h-8 w-[142px] py-0 text-xs"
              aria-label="Extend the pricing month to"
              value={extendTo}
              onChange={(e) => setExtendTo(e.target.value)}
            />
            <button
              className="btn btn-ghost btn-sm"
              onClick={extend}
              disabled={busy !== null || !extendTo}
            >
              {busy === "extend" ? <Loader2 size={13} className="animate-spin" /> : "Extend"}
            </button>
            <span className="font-mono text-[9.5px] opacity-70">
              max {MAX_EXTENSION_DAYS}d out
            </span>
          </div>
        </div>
      )}

      <div className="mb-5 mt-4">
        <GradeSelector vehicleId={vehicleId} currentGrade={currentGrade} />
      </div>

      <label className="label mb-1.5 block" htmlFor="sop-cost">
        SOP cost (Tk)
      </label>
      <NumberField
        id="sop-cost"
        className="field tnum text-lg font-semibold"
        value={sop}
        onChange={setSop}
        placeholder="0"
      />
      {!isFirstSet && carried !== 0 && sop.trim() !== "" && (
        <p className="mt-1 font-mono text-[10px]" style={{ color: carried > 0 ? "var(--warn)" : "var(--ok)" }}>
          {carried > 0 ? "+" : ""}
          {taka(carried)} vs current
        </p>
      )}

      {/* Commission sits directly under SOP because they are revised together
          on a carry-forward vehicle, and reading one without the other gives a
          total that is wrong by exactly the commission. */}
      <label className="label mb-1.5 mt-4 block" htmlFor="dealer-commission">
        Dealer commission (Tk)
      </label>
      <NumberField
        id="dealer-commission"
        className="field tnum text-lg font-semibold"
        value={commission}
        onChange={setCommission}
        placeholder="0"
      />
      {!isFirstSet && commissionMoved !== 0 && commission.trim() !== "" && (
        <p
          className="mt-1 font-mono text-[10px]"
          style={{ color: commissionMoved > 0 ? "var(--warn)" : "var(--ok)" }}
        >
          {commissionMoved > 0 ? "+" : ""}
          {taka(commissionMoved)} vs current
        </p>
      )}

      <div className="mt-4 rounded-lg bg-surface-2 p-3.5 text-sm">
        <div className="flex justify-between text-ink-2">
          <span>Other costs</span>
          <span className="tnum">{taka(costBase)}</span>
        </div>
        <div className="mt-1.5 flex justify-between text-ink-2">
          <span>SOP</span>
          <span className="tnum">{taka(sopValue)}</span>
        </div>
        <div className="mt-1.5 flex justify-between text-ink-2">
          <span className="flex items-center gap-1.5">
            <Handshake size={12} />
            Dealer commission
          </span>
          <span className="tnum">{taka(commissionValue)}</span>
        </div>
        <div className="mt-1.5 flex justify-between border-t border-rule pt-1.5 font-semibold text-ink">
          <span>Total cost</span>
          <span className="tnum">{taka(total)}</span>
        </div>
      </div>

      {isFirstSet && (
        <>
          <label className="label mb-1.5 mt-4 block" htmlFor="proposed-price">
            Proposed selling price (Tk)
          </label>
          <NumberField
            id="proposed-price"
            className="field tnum text-xl font-bold"
            value={price}
            onChange={setPrice}
            placeholder="0"
          />

          {price.trim() !== "" && (
            <div
              className="mt-2.5 flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm font-semibold"
              style={
                margin >= 0
                  ? { background: "var(--ok-soft)", color: "var(--ok-ink)" }
                  : { background: "var(--bad-soft)", color: "var(--bad-ink)" }
              }
            >
              <span>Proposed margin</span>
              <span className="tnum">
                {taka(margin)}
                {marginPct !== null && (
                  <span className="ml-1.5 opacity-70">({marginPct.toFixed(1)}%)</span>
                )}
              </span>
            </div>
          )}
        </>
      )}

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink" role="alert">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      {isFirstSet ? (
        <button className="btn btn-gradient btn-block mt-4" onClick={() => save(false)} disabled={busy !== null}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : <>Submit for approval <ArrowRight size={16} /></>}
        </button>
      ) : isLive ? (
        // On a live vehicle the useful action is re-price AND relist in one
        // move; saving without relisting is kept for a mid-month correction
        // that should not restart the clock.
        <div className="mt-4 grid grid-cols-[1fr_1.5fr] gap-2">
          <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy !== null}>
            {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : "Save only"}
          </button>
          <button className="btn btn-gradient" onClick={() => save(true)} disabled={busy !== null}>
            {busy === "relist" ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <RefreshCw size={15} />
                {cycle.onHold ? "Re-price & relist" : "Renew for next month"}
              </>
            )}
          </button>
        </div>
      ) : (
        <button className="btn btn-gradient btn-block mt-4" onClick={() => save(false)} disabled={busy !== null}>
          {busy ? <Loader2 size={16} className="animate-spin" /> : "Update pricing"}
        </button>
      )}
    </section>
    </>
  );
}
