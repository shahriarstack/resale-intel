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
  BID_PLACED: { label: "Customer offer submitted", tone: "accent" },
  BID_REVISED: { label: "Customer offer revised", tone: "neutral" },
  BID_WITHDRAWN: { label: "Customer offer withdrawn", tone: "warn" },
  SALE_AWARDED: { label: "Sale awarded", tone: "ok" },
  REPAIR_PROGRESS: { label: "Repair progress", tone: "accent" },
  SOLD_AS_IS: { label: "Marked for as-is sale", tone: "warn" },
  HANDOVER_SUBMITTED: { label: "Refurbishment photos filed", tone: "ok" },
  // The enum values still say VALIDITY_SET / _RENEWED because they are stored
  // database values and renaming them would orphan every row already written.
  // What these events actually record is a costing status update, so that is
  // what they are labelled.
  REGISTRATION_VALIDITY_SET: { label: "Registration costing set", tone: "accent" },
  REGISTRATION_VALIDITY_RENEWED: { label: "Registration status updated", tone: "neutral" },
  // Neutral, not warn. Nothing went wrong — the rule did what it says, on
  // schedule, and colouring housekeeping as a warning teaches people to
  // discount the colour that means something actually needs attention.
  PHOTOS_PURGED: { label: "Photographs removed after sale", tone: "neutral" },
};
