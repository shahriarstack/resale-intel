import type { VehicleStatus, LetterStage } from "@prisma/client";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad";

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Which role currently holds the file (for admin/overview readouts). */
  heldBy: string;
}

export const STATUS_META: Record<VehicleStatus, StatusMeta> = {
  CAPTURED: { label: "Captured", tone: "accent", heldBy: "Recovery Team" },
  RELEASED: { label: "Released", tone: "bad", heldBy: "—" },
  CN_REQUESTED: { label: "CN Requested", tone: "warn", heldBy: "Recovery Manager" },
  CN_APPROVED: { label: "CN Approved", tone: "ok", heldBy: "Service Engineer" },
  COST_SUBMITTED: { label: "Cost Submitted", tone: "accent", heldBy: "Service Head" },
  REPAIR_APPROVED: { label: "Repair Approved", tone: "ok", heldBy: "Registration Team" },
  REGISTRATION_DONE: { label: "Registration Done", tone: "accent", heldBy: "Sr. Executive" },
  SOP_ADDED: { label: "SOP Added", tone: "accent", heldBy: "AGM / DGM" },
  PRICE_APPROVED: { label: "Price Approved", tone: "ok", heldBy: "General Manager" },
  LIVE_FOR_RESALE: { label: "Live for Resale", tone: "accent", heldBy: "Sales Team" },
  SOLD: { label: "Sold", tone: "ok", heldBy: "—" },
};

export function statusLabel(s: VehicleStatus): string {
  return STATUS_META[s]?.label ?? s;
}

export const LETTER_META: Record<LetterStage, { label: string; tone: Tone }> = {
  NONE: { label: "No letter", tone: "neutral" },
  LETTER_1: { label: "Letter 1", tone: "neutral" },
  LETTER_2: { label: "Letter 2", tone: "warn" },
  LETTER_3: { label: "Letter 3", tone: "warn" },
  WRITTEN: { label: "Written", tone: "bad" },
};

export function letterLabel(s: LetterStage): string {
  return LETTER_META[s]?.label ?? s;
}
