// The letter escalation ladder: the level of pressure applied to the customer
// before a Credit Note is requested. Kept separate from `status.ts` because a
// letter change is a first-class UI event with its own confirmation rules —
// Letter 3 and Written lock the record permanently on the API side.

import type { LetterStage } from "@prisma/client";
import { LETTER_META } from "@/lib/status";

/** In-order rungs, from softest to hardest. */
export const LETTER_LADDER: LetterStage[] = [
  "NONE",
  "LETTER_1",
  "LETTER_2",
  "LETTER_3",
  "WRITTEN",
];

/** A stage's zero-indexed rung on the ladder. */
export function letterRung(stage: LetterStage): number {
  return LETTER_LADDER.indexOf(stage);
}

/** These stages trigger `isLocked = true` on the server. */
export function letterLocks(stage: LetterStage): boolean {
  return stage === "LETTER_3" || stage === "WRITTEN";
}

/**
 * Human-readable one-liner for what a letter step means in the field.
 * Used to fill the confirmation dialog's subtitle.
 */
export function letterDescription(stage: LetterStage): string {
  switch (stage) {
    case "NONE":
      return "No letter has been issued yet.";
    case "LETTER_1":
      return "First reminder — the customer is notified of the overdue account.";
    case "LETTER_2":
      return "Second reminder — a firmer notice, still recoverable.";
    case "LETTER_3":
      return "Final notice — this locks the record and warns of write-off.";
    case "WRITTEN":
      return "Written off — the customer has been formally notified. Record locks.";
  }
}

export type LetterChange =
  | { kind: "up"; steps: number }
  | { kind: "down"; steps: number }
  | { kind: "same" };

/** How a proposed change moves along the ladder. */
export function letterChange(from: LetterStage, to: LetterStage): LetterChange {
  const a = letterRung(from);
  const b = letterRung(to);
  if (a === b) return { kind: "same" };
  return a < b ? { kind: "up", steps: b - a } : { kind: "down", steps: a - b };
}

/** A short verb for the confirmation title — "Escalate", "Withdraw", "Update". */
export function letterVerb(change: LetterChange): string {
  if (change.kind === "up") return "Escalate";
  if (change.kind === "down") return "Withdraw";
  return "Update";
}

/**
 * Warnings surfaced in the confirmation dialog. The API is authoritative, but
 * the copy here tells the officer what the API will do before they commit.
 */
export function letterWarnings(from: LetterStage, to: LetterStage): string[] {
  const notes: string[] = [];
  const c = letterChange(from, to);
  if (c.kind === "down") {
    notes.push("You are pulling the letter back to a softer stage.");
  }
  if (!letterLocks(from) && letterLocks(to)) {
    notes.push("This will LOCK the record — no further field edits will be possible.");
  }
  if (to === "WRITTEN") {
    notes.push("Marking as written-off is a formal escalation; make sure the paperwork exists.");
  }
  return notes;
}

/** The tone used to colour the confirmation icon/accent for a given target. */
export function letterConfirmTone(to: LetterStage): "accent" | "warn" | "bad" | "neutral" {
  return LETTER_META[to].tone === "neutral" ? "accent" : (LETTER_META[to].tone as "accent" | "warn" | "bad");
}
