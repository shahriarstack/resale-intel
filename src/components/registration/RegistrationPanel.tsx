"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { CostLineEditor, cleanLines, newLine, type EditableLine } from "@/components/vehicle/CostLineEditor";

export function RegistrationPanel({
  vehicleId,
  initialLines,
}: {
  vehicleId: string;
  initialLines: { description: string; amount: number }[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.length
      ? initialLines.map((l, i) => ({ key: `i${i}`, description: l.description, amount: String(l.amount) }))
      : [newLine()],
  );
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState("");

  const save = async (submit: boolean) => {
    setError("");
    const clean = cleanLines(lines);
    if (submit && (clean.length === 0 || clean.some((l) => !l.description))) {
      setError("Add at least one complete registration line.");
      return;
    }
    setBusy(submit ? "submit" : "draft");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/registration`, "POST", { lines: clean, submit });
      if (submit) router.push("/dashboard");
      else {
        router.refresh();
        setBusy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(null);
    }
  };

  return (
    <section className="action-panel p-5">
      <h2 className="mb-1 font-display text-[15px] font-bold text-ink">Registration costs</h2>
      <p className="mb-4 text-xs text-ink-2">Itemise the registration-related costs, then submit.</p>

      <CostLineEditor lines={lines} onChange={setLines} label="Registration items" placeholder="e.g. Fitness renewal" />

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy !== null}>
          {busy === "draft" ? <Loader2 size={16} className="animate-spin" /> : "Save draft"}
        </button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={busy !== null}>
          {busy === "submit" ? <Loader2 size={16} className="animate-spin" /> : "Complete"}
        </button>
      </div>
    </section>
  );
}
