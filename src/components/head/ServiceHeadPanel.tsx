"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Clock, AlertCircle, Pencil, X, ArrowRight } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { taka } from "@/lib/format";
import { CostLineEditor, cleanLines, linesTotal, newLine, type EditableLine } from "@/components/vehicle/CostLineEditor";

interface Line {
  id: string;
  description: string;
  amount: number;
}

export function ServiceHeadPanel({
  vehicleId,
  repairLines,
  transportCost,
  otherCost,
}: {
  vehicleId: string;
  repairLines: Line[];
  transportCost: number;
  otherCost: number;
}) {
  const router = useRouter();

  // The engineer's original figures — kept for comparison, never mutated.
  const origRepair = repairLines.reduce((s, l) => s + l.amount, 0);
  const origTotal = origRepair + transportCost + otherCost;

  const [editing, setEditing] = useState(false);
  const [lines, setLines] = useState<EditableLine[]>(
    repairLines.length
      ? repairLines.map((l, i) => ({ key: `i${i}`, description: l.description, amount: String(l.amount) }))
      : [newLine()],
  );
  const [transport, setTransport] = useState(String(transportCost || ""));
  const [other, setOther] = useState(String(otherCost || ""));
  const [days, setDays] = useState("7");
  const [busy, setBusy] = useState<null | "save" | "approve">(null);
  const [error, setError] = useState("");

  const curRepair = editing ? linesTotal(lines) : origRepair;
  const curTransport = editing ? parseFloat(transport) || 0 : transportCost;
  const curOther = editing ? parseFloat(other) || 0 : otherCost;
  const curTotal = curRepair + curTransport + curOther;
  const delta = curTotal - origTotal;
  const changed = editing && delta !== 0;
  const deltaPct = origTotal > 0 ? (delta / origTotal) * 100 : 0;

  const buildEdit = () => ({
    editCosts: true,
    repairLines: cleanLines(lines),
    transportCost: parseFloat(transport) || 0,
    otherCost: parseFloat(other) || 0,
  });

  const cancelEdit = () => {
    setLines(repairLines.length ? repairLines.map((l, i) => ({ key: `i${i}`, description: l.description, amount: String(l.amount) })) : [newLine()]);
    setTransport(String(transportCost || ""));
    setOther(String(otherCost || ""));
    setEditing(false);
    setError("");
  };

  const saveAdjustment = async () => {
    setError("");
    if (cleanLines(lines).some((l) => !l.description)) {
      setError("Every repair line needs a description.");
      return;
    }
    setBusy("save");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/repair-approval`, "POST", { approve: false, ...buildEdit() });
      setEditing(false);
      router.refresh();
      setBusy(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(null);
    }
  };

  const approve = async () => {
    const n = parseInt(days, 10);
    if (!n || n < 1) {
      setError("Enter a repair timeframe of at least one day.");
      return;
    }
    if (editing && cleanLines(lines).some((l) => !l.description)) {
      setError("Every repair line needs a description.");
      return;
    }
    setBusy("approve");
    setError("");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/repair-approval`, "POST", {
        approve: true,
        repairDays: n,
        ...(changed ? buildEdit() : {}),
      });
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Approval failed");
      setBusy(null);
    }
  };

  return (
    <section className="action-panel p-5">
      <div className="mb-4 flex items-start justify-between gap-2">
        <div>
          <h2 className="font-display text-[15px] font-bold text-ink">Repair approval</h2>
          <p className="text-xs text-ink-2">Review the estimate, adjust if needed, then set a deadline.</p>
        </div>
        {!editing ? (
          <button className="btn btn-ghost btn-sm shrink-0" onClick={() => setEditing(true)}>
            <Pencil size={13} /> Adjust
          </button>
        ) : (
          <button className="btn btn-ghost btn-sm shrink-0" onClick={cancelEdit} disabled={busy !== null}>
            <X size={13} /> Cancel
          </button>
        )}
      </div>

      {/* Estimate — read-only or editable */}
      <div className="rounded-lg bg-surface-2 p-3.5">
        <div className="mb-2 flex items-center justify-between">
          <span className="label mb-0">{editing ? "Adjusting estimate" : "Engineer estimate"}</span>
          {editing && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-accent">editable</span>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <CostLineEditor lines={lines} onChange={setLines} label="Repair items" placeholder="Repair description" />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label mb-1.5">Transport (Tk)</label>
                <input className="field text-sm tnum" type="number" inputMode="numeric" value={transport} onChange={(e) => setTransport(e.target.value)} placeholder="0" />
              </div>
              <div>
                <label className="label mb-1.5">Other (Tk)</label>
                <input className="field text-sm tnum" type="number" inputMode="numeric" value={other} onChange={(e) => setOther(e.target.value)} placeholder="0" />
              </div>
            </div>
          </div>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {repairLines.length === 0 ? (
              <li className="text-ink-3">No repair lines recorded.</li>
            ) : (
              repairLines.map((l) => (
                <li key={l.id} className="flex justify-between gap-3">
                  <span className="text-ink-2">{l.description}</span>
                  <span className="tnum text-ink">{taka(l.amount)}</span>
                </li>
              ))
            )}
            <li className="flex justify-between border-t border-rule pt-1.5 text-ink-2">
              <span>Transport</span><span className="tnum">{taka(transportCost)}</span>
            </li>
            <li className="flex justify-between text-ink-2">
              <span>Other</span><span className="tnum">{taka(otherCost)}</span>
            </li>
          </ul>
        )}

        {/* Total + delta */}
        <div className="mt-3 border-t border-rule pt-2.5">
          {changed ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold text-ink">Adjusted total</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs tnum text-ink-3 line-through">{taka(origTotal)}</span>
                <ArrowRight size={12} className="text-ink-3" />
                <span className="tnum text-sm font-bold text-ink">{taka(curTotal)}</span>
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold"
                  style={
                    delta > 0
                      ? { background: "var(--bad-soft)", color: "var(--bad)" }
                      : { background: "var(--ok-soft)", color: "var(--ok)" }
                  }
                >
                  {delta > 0 ? "+" : "−"}{taka(Math.abs(delta)).replace("Tk ", "")} ({delta > 0 ? "+" : ""}{deltaPct.toFixed(0)}%)
                </span>
              </div>
            </div>
          ) : (
            <div className="flex justify-between text-sm font-semibold text-ink">
              <span>Total estimate</span>
              <span className="tnum">{taka(curTotal)}</span>
            </div>
          )}
        </div>
      </div>

      {/* Save adjustment (only while editing with changes) */}
      {editing && (
        <button className="btn btn-ghost btn-block mt-3" onClick={saveAdjustment} disabled={busy !== null || !changed}>
          {busy === "save" ? <Loader2 size={16} className="animate-spin" /> : "Save adjustment"}
        </button>
      )}

      {/* Timeframe + approve */}
      <div className="mt-4">
        <label className="label mb-1.5">Repair timeframe (days)</label>
        <input className="field tnum text-lg font-semibold" type="number" inputMode="numeric" min={1} max={365} value={days} onChange={(e) => setDays(e.target.value)} />
        <p className="mt-1.5 text-xs text-ink-3">Starts a countdown; overdue vehicles are flagged.</p>
      </div>

      {error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <button className="btn btn-ok btn-block mt-4" onClick={approve} disabled={busy !== null}>
        {busy === "approve" ? <Loader2 size={16} className="animate-spin" /> : (<><Clock size={16} /> {changed ? "Approve adjusted estimate" : "Approve & set deadline"}</>)}
      </button>
    </section>
  );
}
