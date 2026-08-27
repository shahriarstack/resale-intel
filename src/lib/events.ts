import type { EventType } from "@prisma/client";
import type { Tone } from "@/lib/status";

// Human labels + tone for the audit timeline.
export const EVENT_META: Record<EventType, { label: string; tone: Tone }> = {
  CAPTURED: { label: "Captured", tone: "accent" },
  FIELD_EDITED: { label: "Details edited", tone: "neutral" },
  LETTER_UPDATED: { label: "Letter updated", tone: "neutral" },
  ENGINEER_ASSIGNED: { label: "Engineer assigned", tone: "neutral" },
  RELEASED: { label: "Released to customer", tone: "bad" },
  CN_REQUESTED: { label: "Credit Note requested", tone: "warn" },
  CN_APPROVED: { label: "Credit Note approved", tone: "ok" },
  CN_DECLINED: { label: "Credit Note declined", tone: "bad" },
  ASSESSMENT_SUBMITTED: { label: "Assessment submitted", tone: "accent" },
  REPAIR_APPROVED: { label: "Repair approved", tone: "ok" },
  REPAIR_SENT_BACK: { label: "Sent back to engineer", tone: "bad" },
  REGISTRATION_COMPLETED: { label: "Registration completed", tone: "accent" },
  SOP_SET: { label: "SOP cost set", tone: "accent" },
  SOP_UPDATED: { label: "SOP cost updated", tone: "neutral" },
  GRADED: { label: "Condition graded", tone: "accent" },
  PRICE_SET: { label: "Price proposed", tone: "accent" },
  PRICE_APPROVED: { label: "Price approved", tone: "ok" },
  PRICE_REVISED: { label: "Price revised", tone: "neutral" },
  PUSHED_LIVE: { label: "Pushed live for resale", tone: "ok" },
  SENT_BACK: { label: "Sent back", tone: "bad" },
  LOCKED: { label: "Record locked", tone: "warn" },
  UNLOCKED: { label: "Record unlocked", tone: "neutral" },
  BID_PLACED: { label: "Bid placed", tone: "accent" },
  SALE_AWARDED: { label: "Sale awarded", tone: "ok" },
};
