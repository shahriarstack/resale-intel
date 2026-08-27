// The forward journey a file takes through the eight desks.
//
// The chain is DERIVED from TRANSITIONS rather than written out again, so it
// can never drift from the rules the API actually enforces. Back-edges
// (decline / send-back) and the RELEASED exit are skipped when walking it.

import type { Role, VehicleStatus } from "@prisma/client";
import { TRANSITIONS } from "@/lib/rbac";
import { STATUS_META } from "@/lib/status";

function buildChain(): VehicleStatus[] {
  const start: VehicleStatus = "CAPTURED";
  const chain: VehicleStatus[] = [start];
  const seen = new Set<VehicleStatus>(chain);

  let cursor: VehicleStatus = start;
  for (;;) {
    // The forward move: not the terminal exit, and not a hop back to a desk
    // the file has already passed through.
    const next = TRANSITIONS.find(
      (t) => t.from === cursor && t.to !== "RELEASED" && !seen.has(t.to),
    );
    if (!next) break;
    chain.push(next.to);
    seen.add(next.to);
    cursor = next.to;
  }
  return chain;
}

/** CAPTURED → CN_REQUESTED → … → LIVE_FOR_RESALE. */
export const JOURNEY: VehicleStatus[] = buildChain();

export type StepState = "done" | "current" | "upcoming";

export interface JourneyStep {
  status: VehicleStatus;
  label: string;
  /** Role holding the file while it sits at this stage. */
  heldBy: string;
  state: StepState;
  /** The action that moves a file out of this stage, if there is one. */
  advanceLabel: string | null;
  advanceRole: Role | null;
}

export interface Journey {
  steps: JourneyStep[];
  /** Position in JOURNEY, or -1 when the file has left the pipeline. */
  currentIndex: number;
  total: number;
  progressPct: number;
  current: JourneyStep | null;
  /** Stages still ahead, in order. */
  upcoming: JourneyStep[];
  isComplete: boolean;
  isReleased: boolean;
}

function forwardFrom(status: VehicleStatus) {
  const i = JOURNEY.indexOf(status);
  if (i === -1 || i === JOURNEY.length - 1) return null;
  const to = JOURNEY[i + 1];
  return TRANSITIONS.find((t) => t.from === status && t.to === to) ?? null;
}

export function buildJourney(status: VehicleStatus): Journey {
  const isReleased = status === "RELEASED";
  const currentIndex = isReleased ? -1 : JOURNEY.indexOf(status);

  const steps: JourneyStep[] = JOURNEY.map((s, i) => {
    const forward = forwardFrom(s);
    let state: StepState;
    if (isReleased) {
      // The file only ever reached capture before leaving the pipeline.
      state = i === 0 ? "done" : "upcoming";
    } else if (i < currentIndex) {
      state = "done";
    } else if (i === currentIndex) {
      state = "current";
    } else {
      state = "upcoming";
    }

    return {
      status: s,
      label: STATUS_META[s].label,
      heldBy: STATUS_META[s].heldBy,
      state,
      advanceLabel: forward?.label ?? null,
      advanceRole: forward?.role ?? null,
    };
  });

  const total = steps.length;
  // Complete means "at the end of the chain", derived — so extending the
  // pipeline (as SOLD did) never leaves a stale hardcoded terminal here.
  const isComplete = currentIndex === total - 1;

  return {
    steps,
    currentIndex,
    total,
    progressPct:
      currentIndex < 0 ? 0 : Math.round((currentIndex / (total - 1)) * 100),
    current: currentIndex >= 0 ? steps[currentIndex] : null,
    upcoming: currentIndex >= 0 ? steps.slice(currentIndex + 1) : [],
    isComplete,
    isReleased,
  };
}
