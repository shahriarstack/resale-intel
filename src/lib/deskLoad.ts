import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { inboxStatusesForRole } from "./rbac";

/**
 * How many files are sitting on this desk, waiting for it.
 *
 * Counted from `inboxStatusesForRole`, which derives the answer from the
 * transition table — the same table that decides what this role is allowed to
 * do. That is the whole point of taking it from there rather than writing a
 * status list per role in a second place: a badge in the chrome that disagreed
 * with the queue it links to would be worse than no badge at all, and this one
 * cannot, because both are reading the same definition of "yours".
 *
 * Zero statuses means zero query. Two roles land there and both are correct:
 *
 *   SUPER_ADMIN     no transition names them, because they hold no desk — they
 *                   may run any action but are never the one who owes it
 *   PORTAL_VIEWER   reads and cannot act at all
 *
 * Neither gets a badge, and neither should: putting a number in front of
 * somebody implies they owe something, and these two do not.
 */
export async function getDeskLoad(role: Role): Promise<number> {
  const statuses = inboxStatusesForRole(role);
  if (statuses.length === 0) return 0;
  return prisma.vehicle.count({ where: { status: { in: statuses } } });
}
