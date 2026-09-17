import type { PrismaClient, Role } from "@prisma/client";
import type { Tone } from "@/lib/status";

/**
 * The direct-capture window — the one sanctioned way past the approval gate.
 *
 * See the `CaptureWindow` model in schema.prisma for why this exists. This file
 * owns the two questions the rest of the app asks about one:
 *
 *   what STATE is this window in, right now      → `windowState`
 *   may THIS officer capture directly, right now → `findAuthorisingWindow`
 *
 * Both live here rather than at their call sites because the answer is needed
 * in four places — the capture API, the intake chooser, the capture form and
 * the admin console — and four independent readings of "is it open" is exactly
 * how a gate ends up open in one of them and shut in the others.
 */

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/**
 * Four states, and they are not the same thing.
 *
 * `expired` and `revoked` both mean "shut", but only one of them needs
 * explaining afterwards: a window that ran its course did what it was set up to
 * do, and a window somebody shut early did not. Collapsing them into one
 * "closed" would throw away the only distinction an auditor cares about.
 *
 * `exhausted` is separate again — the window is still inside its dates but has
 * issued every capture it was capped at. That is a window working correctly,
 * and the admin's remedy (raise the cap, or open another) is different from
 * the remedy for one that expired (extend the dates).
 */
export type WindowState = "scheduled" | "open" | "exhausted" | "expired" | "revoked";

export interface WindowStateMeta {
  label: string;
  tone: Tone;
  /** Whether a capture may be made against a window in this state. */
  authorises: boolean;
}

export const WINDOW_STATE_META: Record<WindowState, WindowStateMeta> = {
  scheduled: { label: "Scheduled", tone: "accent", authorises: false },
  open: { label: "Open", tone: "ok", authorises: true },
  exhausted: { label: "Cap reached", tone: "warn", authorises: false },
  expired: { label: "Expired", tone: "neutral", authorises: false },
  revoked: { label: "Revoked", tone: "bad", authorises: false },
};

/** The fields `windowState` needs. Structural, so any select shape can pass. */
export interface WindowTiming {
  opensAt: Date;
  closesAt: Date;
  closedAt: Date | null;
  maxCaptures: number | null;
  /** How many captures have already been made against this window. */
  used: number;
}

export function windowState(w: WindowTiming, now: Date = new Date()): WindowState {
  // Revocation outranks everything. An admin who shut a window early meant it,
  // and a clock that has not yet run out must not talk them out of it.
  if (w.closedAt) return "revoked";
  if (now < w.opensAt) return "scheduled";
  if (now > w.closesAt) return "expired";
  if (w.maxCaptures !== null && w.used >= w.maxCaptures) return "exhausted";
  return "open";
}

/** Captures still available on this window, or null when it is uncapped. */
export function remaining(w: WindowTiming): number | null {
  if (w.maxCaptures === null) return null;
  return Math.max(0, w.maxCaptures - w.used);
}

/**
 * How long an open window has left, in plain words.
 *
 * Hours below a day and days above it. An officer looking at this is deciding
 * whether to start entering a backlog now or after lunch, and "2 days" answers
 * that where "51 hours" makes them do arithmetic. Rounds DOWN throughout, so
 * the figure never promises time the window does not have.
 */
export function timeLeftLabel(closesAt: Date, now: Date = new Date()): string {
  const ms = closesAt.getTime() - now.getTime();
  if (ms <= 0) return "closed";
  const hours = Math.floor(ms / 3_600_000);
  if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))} min left`;
  if (hours < 24) return `${hours} ${hours === 1 ? "hour" : "hours"} left`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? "day" : "days"} left`;
}

// ---------------------------------------------------------------------------
// Authorisation
// ---------------------------------------------------------------------------

/** What the capture API needs to know about the window it is allowing. */
export interface AuthorisingWindow {
  id: string;
  reason: string;
  closesAt: Date;
  maxCaptures: number | null;
  used: number;
  territoryId: string | null;
  openedByName: string;
}

/**
 * The window authorising a direct capture by this user right now, or null.
 *
 * Scope is deliberately asymmetric. A window with no territory covers every
 * recovery officer; a window WITH one covers only officers posted to that
 * territory — and an officer posted nowhere is covered by neither, because
 * "unassigned" is not a place and a backlog cannot belong to it.
 *
 * "Posted to" now means ANY of their territories, base or cover. An officer
 * holding a vacant neighbouring patch is the person the backlog on that patch
 * belongs to; a window opened for it that did not reach them would be a window
 * opened for nobody.
 *
 * Super Admin is not special-cased into a bypass here. An admin who wants to
 * enter captures directly opens a window and is covered by it like anyone else,
 * which keeps the record of why those vehicles skipped the gate identical
 * whoever typed them in.
 *
 * `used` is counted live rather than kept as a column on the window: a counter
 * incremented in application code drifts the first time a transaction rolls
 * back, and the cap is the one number here that must not be wrong.
 */
export async function findAuthorisingWindow(
  db: PrismaClient,
  user: { id: string; role: Role; territoryIds: string[] },
  now: Date = new Date(),
): Promise<AuthorisingWindow | null> {
  if (user.role !== "RECOVERY_TEAM" && user.role !== "SUPER_ADMIN") return null;

  const candidates = await db.captureWindow.findMany({
    where: {
      closedAt: null,
      opensAt: { lte: now },
      closesAt: { gte: now },
      // Global windows, or one scoped to any territory this officer holds. An
      // officer posted nowhere matches only the global arm.
      OR: [
        { territoryId: null },
        ...(user.territoryIds.length ? [{ territoryId: { in: user.territoryIds } }] : []),
      ],
    },
    orderBy: { closesAt: "asc" },
    select: {
      id: true,
      reason: true,
      closesAt: true,
      maxCaptures: true,
      territoryId: true,
      openedBy: { select: { name: true } },
      _count: { select: { vehicles: true } },
    },
  });

  // The first one with headroom. Ordered by soonest expiry so a window about to
  // close is spent before an open-ended one — otherwise the tight window lapses
  // unused while its captures go against the loose one, and the cap that was
  // actually reasoned about never binds.
  for (const c of candidates) {
    const used = c._count.vehicles;
    if (c.maxCaptures !== null && used >= c.maxCaptures) continue;
    return {
      id: c.id,
      reason: c.reason,
      closesAt: c.closesAt,
      maxCaptures: c.maxCaptures,
      used,
      territoryId: c.territoryId,
      openedByName: c.openedBy.name,
    };
  }
  return null;
}
