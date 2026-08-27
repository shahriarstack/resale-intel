"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import type { VehicleGrade } from "@prisma/client";
import { sendJSON } from "@/lib/http";
import { GRADE_META, GRADE_ORDER } from "@/lib/grades";

const toneVar: Record<string, { fg: string; soft: string }> = {
  ok: { fg: "var(--ok)", soft: "var(--ok-soft)" },
  accent: { fg: "var(--accent)", soft: "var(--accent-soft)" },
  warn: { fg: "var(--warn)", soft: "var(--warn-soft)" },
  bad: { fg: "var(--bad)", soft: "var(--bad-soft)" },
};

// Tap-to-set condition grade. Saves immediately and logs the change.
export function GradeSelector({
  vehicleId,
  currentGrade,
}: {
  vehicleId: string;
  currentGrade: VehicleGrade | null;
}) {
  const router = useRouter();
  const [grade, setGrade] = useState<VehicleGrade | null>(currentGrade);
  const [saving, setSaving] = useState<VehicleGrade | null>(null);
  const [error, setError] = useState("");

  const pick = async (g: VehicleGrade) => {
    if (g === grade || saving) return;
    setSaving(g);
    setError("");
    const prev = grade;
    setGrade(g); // optimistic
    try {
      await sendJSON(`/api/vehicles/${vehicleId}/grade`, "POST", { grade: g });
      router.refresh();
    } catch (e) {
      setGrade(prev);
      setError(e instanceof Error ? e.message : "Couldn't save grade");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <div className="label mb-2">Condition grade</div>
      <div className="grid grid-cols-2 gap-2.5">
        {GRADE_ORDER.map((g) => {
          const meta = GRADE_META[g];
          const c = toneVar[meta.tone];
          const active = grade === g;
          const busy = saving === g;
          return (
            <button
              key={g}
              type="button"
              onClick={() => pick(g)}
              className="relative flex items-center gap-3 rounded-xl border-2 p-3 text-left transition-[border-color,background-color,transform] duration-150 active:scale-[0.98]"
              style={{
                borderColor: active ? c.fg : "var(--rule)",
                background: active ? c.soft : "var(--surface)",
              }}
            >
              <span
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg font-display text-xl font-bold"
                style={{ background: c.soft, color: c.fg }}
              >
                {g}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{meta.label}</span>
                <span className="block text-[11px] leading-tight text-ink-3">{meta.blurb}</span>
              </span>
              {active && !busy && (
                <span
                  className="absolute right-2 top-2 grid h-4 w-4 place-items-center rounded-full text-white"
                  style={{ background: c.fg }}
                >
                  <Check size={11} strokeWidth={3} />
                </span>
              )}
              {busy && (
                <span className="absolute right-2 top-2">
                  <Loader2 size={14} className="animate-spin" style={{ color: c.fg }} />
                </span>
              )}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs font-medium text-bad">{error}</p>}
    </div>
  );
}
