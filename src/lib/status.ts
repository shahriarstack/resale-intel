import type { VehicleStatus, LetterStage } from "@prisma/client";
import { roleLabel } from "@/lib/rbac";

export type Tone = "neutral" | "accent" | "ok" | "warn" | "bad";

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Which role currently holds the file (for admin/overview readouts). */
  heldBy: string;
}

/**
 * Who holds the file at each status.
 *
 * Read from ROLE_META rather than spelled out again. Every one of these was
 * previously a literal that happened to match a role label, so renaming a role
 * meant finding and changing the same words in several files and quietly
 * getting a different answer in the ones that were missed. The desk that holds
 * a status IS a role, so it is named by pointing at that role.
 *
 * RELEASED and SOLD are the two statuses nobody holds — the file has left the
 * chain — so they are the only literals left here.
 */
export const STATUS_META: Record<VehicleStatus, StatusMeta> = {
  CAPTURED: { label: "Captured", tone: "accent", heldBy: roleLabel("RECOVERY_TEAM") },
  RELEASED: { label: "Released", tone: "bad", heldBy: "—" },
  CN_REQUESTED: { label: "CN Requested", tone: "warn", heldBy: roleLabel("RECOVERY_MANAGER") },
  CN_APPROVED: { label: "CN Approved", tone: "ok", heldBy: roleLabel("SERVICE_ENGINEER") },
  COST_SUBMITTED: { label: "Cost Submitted", tone: "accent", heldBy: roleLabel("SERVICE_HEAD") },
  REPAIR_APPROVED: { label: "Repair Approved", tone: "ok", heldBy: roleLabel("REGISTRATION_TEAM") },
  // The Registration Team's stage covers two things, and naming only the
  // first of them ("Registration Done") kept reading as "the papers are
  // filed" — when what actually has to be true before the file moves on is
  // that the registration has been CHECKED and the cost of keeping it
  // current has been ESTIMATED. The label now says both.
  REGISTRATION_DONE: {
    label: "Registration Check & Estimate",
    tone: "accent",
    heldBy: roleLabel("SR_EXECUTIVE"),
  },
  SOP_ADDED: { label: "SOP Added", tone: "accent", heldBy: roleLabel("AGM_DGM") },
  PRICE_APPROVED: { label: "Price Approved", tone: "ok", heldBy: roleLabel("GM_SR_GM") },
  LIVE_FOR_RESALE: { label: "Live for Resale", tone: "accent", heldBy: roleLabel("SALES_TEAM") },
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

// ---------------------------------------------------------------------------
// What a vehicle IS, as against where its file sits
//
// `VehicleStatus` answers "which desk is holding this", which is the right
// question for routing work and the wrong one for counting stock. Eleven
// statuses collapse into three things the business actually recognises, and
// the boundary between two of them is one specific event:
//
//   CAPTURED           the vehicle is ours by seizure and the letter ladder is
//   CN_REQUESTED       running or the Credit Note is out for approval. Still a
//                      CAPTURE. Still off the road. Still, in principle,
//                      returnable — right up until Letter 3.
//
//   ── Credit Note APPROVED ──────────────────────────────────────────────────
//
//   CN_APPROVED        the write-off is authorised. The vehicle has stopped
//   … LIVE_FOR_RESALE  being a recovery case and become RESALABLE INVENTORY:
//                      it is being assessed, repaired, registered, priced and
//                      sold. It is not a capture any more and it is not off
//                      the road — it is stock moving through a refurbishment
//                      line towards a sale.
//
//   RELEASED / SOLD    gone. Neither.
//
// Getting this wrong made the officer's off-road figure count fifteen vehicles
// that were sitting in a workshop being prepared for sale, which is not what
// anyone means by "off the road".
// ---------------------------------------------------------------------------

/** Seized, letters running or Credit Note pending. A capture. */
export function isCaptureStage(status: VehicleStatus): boolean {
  return status === "CAPTURED" || status === "CN_REQUESTED";
}

/**
 * Past the Credit Note. Assessed, repaired, priced, listed — stock, not a
 * recovery case.
 */
export function isResaleInventory(status: VehicleStatus): boolean {
  switch (status) {
    case "CN_APPROVED":
    case "COST_SUBMITTED":
    case "REPAIR_APPROVED":
    case "REGISTRATION_DONE":
    case "SOP_ADDED":
    case "PRICE_APPROVED":
    case "LIVE_FOR_RESALE":
      return true;
    default:
      return false;
  }
}

/**
 * Off the road, from the recovery organisation's point of view.
 *
 * Captures plus the two off-road case kinds — NOT resale inventory. A truck
 * being repainted for sale is not a vehicle anyone is trying to recover.
 */
export function isOffroadVehicle(status: VehicleStatus): boolean {
  return isCaptureStage(status);
}
