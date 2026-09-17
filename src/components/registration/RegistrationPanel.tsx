"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertCircle } from "lucide-react";
import { sendJSON } from "@/lib/http";
import { CostLineEditor, cleanLines, linesTotal, newLine, type EditableLine } from "@/components/vehicle/CostLineEditor";
import { ValidityDaysPicker } from "@/components/registration/ValidityDaysPicker";
import { HandoffDialog } from "@/components/ui/HandoffDialog";
import { taka, shortDate } from "@/lib/format";
import { DEFAULT_VALID_DAYS } from "@/lib/registrationValidity";

export function RegistrationPanel({
  vehicleId,
  subject,
  initialLines,
}: {
  vehicleId: string;
  /** Names the vehicle on the hand-off receipt. */
  subject: string;
  initialLines: { description: string; amount: number }[];
}) {
  const router = useRouter();
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.length
      ? initialLines.map((l, i) => ({ key: `i${i}`, description: l.description, amount: String(l.amount) }))
      : [newLine()],
  );
  // Opens the paperwork validity window the moment this file is submitted —
  // two months by default, the actual figure this desk works to.
  const [validDays, setValidDays] = useState(String(DEFAULT_VALID_DAYS));
  const [busy, setBusy] = useState<null | "draft" | "submit">(null);
  const [error, setError] = useState("");
  const [handedOff, setHandedOff] = useState(false);

  const save = async (submit: boolean) => {
    setError("");
    const clean = cleanLines(lines);
    if (submit && (clean.length === 0 || clean.some((l) => !l.description))) {
      setError("Add at least one complete registration line.");
      return;
    }
    const days = parseInt(validDays, 10);
    if (submit && (!days || days < 1)) {
      setError("Enter how many days this registration is valid for.");
      return;
    }
    setBusy(submit ? "submit" : "draft");
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/registration`, "POST", {
        lines: clean,
        submit,
        ...(submit ? { validDays: days } : {}),
      });
      if (submit) setHandedOff(true);
      else {
        router.refresh();
        setBusy(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setBusy(null);
    }
  };

  const validUntilPreview = (() => {
    const n = parseInt(validDays, 10);
    if (!n || n < 1) return "—";
    const d = new Date();
    d.setDate(d.getDate() + n);
    return shortDate(d);
  })();

  const handoff = (
    <HandoffDialog
      open={handedOff}
      title="Registration complete"
      subject={subject}
      facts={[
        { label: "Registration cost", value: taka(linesTotal(lines)), strong: true },
        { label: "Estimate valid for", value: `${validDays} days` },
        { label: "Valid until", value: validUntilPreview },
      ]}
      nextDesk="Sr. Executive"
      nextAction="Sets the SOP cost and proposes a selling price."
      thanks="Thank you — you stay on this one: the costing above is yours to revise for as long as it goes unsold."
      onContinue={() => router.push("/dashboard")}
    />
  );

  return (
    <>
      {handoff}
    <section className="action-panel p-5">
      <h2 className="mb-1 font-display text-[15px] font-bold text-ink">Registration costing</h2>
      <p className="mb-4 text-xs text-ink-2">
        Itemise what it will cost to bring the papers current, then complete the file.
        You can revise this at any time afterwards.
      </p>

      <CostLineEditor
        lines={lines}
        onChange={setLines}
        label="Registration items"
        placeholder="e.g. Fitness renewal, route permit…"
      />

      {/* How long this estimate stands. Both it and the costing above stay
          editable afterwards from the standing panel this vehicle carries
          from today on — this is only where the FIRST window opens. */}
      <div className="mt-4">
        <label className="label mb-1.5 block">Valid for</label>
        <ValidityDaysPicker value={validDays} onChange={setValidDays} disabled={busy !== null} />
        <p className="mt-1.5 text-xs text-ink-3">
          Defaults to two months. You can revise both the estimate and this window any
          time afterwards, wherever the vehicle has moved on to since.
        </p>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
          <AlertCircle size={15} className="mt-0.5 shrink-0" />
          <span className="text-xs font-medium">{error}</span>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2.5">
        <button className="btn btn-ghost" onClick={() => save(false)} disabled={busy !== null}>
          {busy === "draft" ? <Loader2 size={16} className="animate-spin" /> : "Save draft"}
        </button>
        <button className="btn btn-primary" onClick={() => save(true)} disabled={busy !== null}>
          {busy === "submit" ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            "Complete registration"
          )}
        </button>
      </div>
    </section>
    </>
  );
}
