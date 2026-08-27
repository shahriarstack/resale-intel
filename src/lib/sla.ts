import type { VehicleStatus } from "@prisma/client";
import { daysSince, daysUntil } from "@/lib/format";

/**
 * Desk ageing and SLA.
 *
 * The pipeline already records everything needed to say whether a file is
 * moving or stuck — `createdAt` for how long it has existed and
 * `repairDeadline` for the one hard commitment in the whole chain. Nothing
 * here writes: it reads what the desks already produced and grades it, so no
 * migration and no new state is involved.
 */

export type SlaLevel = "fresh" | "watch" | "risk" | "breach";

export interface SlaVerdict {
  level: SlaLevel;
  /** Days the file has been waiting. */
  days: number;
  /** Short label for a chip or tooltip. */
  label: string;
  /** CSS colour token for the row rail. `null` means draw no rail. */
  color: string | null;
  /** True when a committed repair deadline has actually passed. */
  overdue: boolean;
}

/**
 * How long a file may sit on one desk before it is worth chasing.
 *
 * These are deliberately uniform rather than per-desk: the business has never
 * agreed a per-stage SLA, so inventing eight different numbers would dress a
 * guess up as policy. One honest threshold that everyone understands beats
 * eight fabricated ones. Change here when real targets are agreed.
 */
export const DESK_TARGET_DAYS = 3;
export const DESK_RISK_DAYS = 7;
export const DESK_BREACH_DAYS = 14;

const LEVEL_COLOR: Record<SlaLevel, string | null> = {
  fresh: null,
  watch: "var(--ink-3)",
  risk: "var(--warn)",
  breach: "var(--bad)",
};

/**
 * Grade a file by how long it has been waiting, and by whether a repair
 * deadline it was given has already passed.
 *
 * A passed repair deadline always wins: it is a commitment that was made and
 * missed, which outranks "this has been sitting a while".
 */
export function gradeSla(
  waitingSince: Date | string | null | undefined,
  repairDeadline?: Date | string | null,
): SlaVerdict {
  const days = daysSince(waitingSince) ?? 0;

  if (repairDeadline) {
    const left = daysUntil(repairDeadline);
    if (left != null && left < 0) {
      const over = Math.abs(left);
      return {
        level: "breach",
        days,
        label: `${over}d past repair deadline`,
        color: LEVEL_COLOR.breach,
        overdue: true,
      };
    }
    if (left != null && left <= 1) {
      return {
        level: "risk",
        days,
        label: left === 0 ? "Repair due today" : "Repair due tomorrow",
        color: LEVEL_COLOR.risk,
        overdue: false,
      };
    }
  }

  let level: SlaLevel = "fresh";
  if (days >= DESK_BREACH_DAYS) level = "breach";
  else if (days >= DESK_RISK_DAYS) level = "risk";
  else if (days >= DESK_TARGET_DAYS) level = "watch";

  const label =
    level === "fresh"
      ? `${days}d at desk`
      : level === "watch"
        ? `${days}d waiting`
        : level === "risk"
          ? `${days}d waiting, past target`
          : `${days}d waiting, escalate`;

  return { level, days, label, color: LEVEL_COLOR[level], overdue: false };
}

/** Rank used when sorting a list so the most at-risk files surface first. */
export function slaRank(level: SlaLevel): number {
  switch (level) {
    case "breach":
      return 3;
    case "risk":
      return 2;
    case "watch":
      return 1;
    default:
      return 0;
  }
}

export interface SlaSummary {
  total: number;
  breach: number;
  risk: number;
  watch: number;
  fresh: number;
  /** Longest wait in the set, in days. */
  oldest: number;
  /** Files whose committed repair deadline has passed. */
  overdue: number;
}

export function summarise(verdicts: SlaVerdict[]): SlaSummary {
  const s: SlaSummary = {
    total: verdicts.length,
    breach: 0,
    risk: 0,
    watch: 0,
    fresh: 0,
    oldest: 0,
    overdue: 0,
  };
  for (const v of verdicts) {
    s[v.level] += 1;
    if (v.days > s.oldest) s.oldest = v.days;
    if (v.overdue) s.overdue += 1;
  }
  return s;
}

/**
 * The one status where a repair deadline is live. It is set when the Service
 * Head approves the repair and stops mattering once Registration completes, so
 * outside this window the date is history rather than a commitment.
 */
export const REPAIR_WINDOW: VehicleStatus[] = ["REPAIR_APPROVED"];
