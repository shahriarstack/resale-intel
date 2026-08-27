import type { VehicleGrade } from "@prisma/client";
import type { Tone } from "@/lib/status";

export interface GradeMeta {
  grade: VehicleGrade;
  label: string;
  blurb: string;
  tone: Tone;
}

// Condition grades set by the Sr. Executive, worst-to-best ordering is A→D.
export const GRADE_META: Record<VehicleGrade, GradeMeta> = {
  A: { grade: "A", label: "Excellent", blurb: "Showroom-ready, minimal work", tone: "ok" },
  B: { grade: "B", label: "Good", blurb: "Sound, minor refurbishment", tone: "accent" },
  C: { grade: "C", label: "Average", blurb: "Functional, notable wear", tone: "warn" },
  D: { grade: "D", label: "Salvage", blurb: "Parts or scrap value only", tone: "bad" },
};

export const GRADE_ORDER: VehicleGrade[] = ["A", "B", "C", "D"];

export function gradeLabel(g: VehicleGrade | null | undefined): string {
  return g ? `${g} · ${GRADE_META[g].label}` : "—";
}
