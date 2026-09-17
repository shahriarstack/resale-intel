import { getServerSession } from "next-auth";
import type { Role } from "@prisma/client";
import { authOptions } from "./auth";
import { prisma } from "./prisma";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  staffId: string;
  /**
   * Every territory this person works — their base posting and any they cover.
   *
   * A list rather than the single `territoryId` it replaced, because an
   * officer holding a vacant neighbouring patch works both, and anything that
   * scopes by "their territory" has to mean all of them. Empty for the desks,
   * which are not posted anywhere.
   */
  territoryIds: string[];
  /**
   * The one they are BASED in, of those.
   *
   * Carried separately rather than taken as the first of the list, because
   * "which of these is home" is a fact and array order is not. It is what a
   * form falls back to when it needs one territory and the officer holds
   * several — a cover is where they are helping out, not where they belong.
   */
  baseTerritoryId: string | null;
}

/**
 * The current user, or null. Use in pages/layouts that handle redirects.
 *
 * THE COOKIE SAYS WHO. THE DATABASE SAYS WHAT THEY HOLD.
 *
 * The token carries postings, written once when the account signs in. The
 * `jwt` callback only fills them when `user` is present, which is at sign-in
 * and never again — a re-issue on `updateAge` copies the token it was handed.
 * So everything an administrator changes was invisible to the person it was
 * changed for, for up to the sixty days the session lasts:
 *
 *   a territory assigned    the officer's own panel said none was, and
 *                           `territoryDenied` refused captures against the
 *                           patch they had just been given
 *   a territory REMOVED     worse, and the reason this is not merely a
 *                           refresh bug: they kept the right to file against
 *                           a patch that was no longer theirs
 *   a role changed          they kept the old desk
 *   an account deactivated  the session outlived the decision to end it
 *
 * So the identity is taken from the cookie — that is what a signed token is
 * for — and everything that can change underneath it is read fresh. One
 * indexed lookup on a primary key, on pages that are `force-dynamic` and
 * querying anyway.
 */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const row = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      staffId: true,
      role: true,
      isActive: true,
      postings: { select: { territoryId: true, kind: true } },
    },
  });

  // Deleted or deactivated between signing in and this request. Treated as
  // signed out rather than as an error: the guards above this turn a null into
  // a redirect to /login, which is what ending an account should feel like.
  if (!row || !row.isActive) return null;

  return {
    id: session.user.id,
    name: row.name,
    role: row.role,
    staffId: row.staffId,
    territoryIds: row.postings.map((p) => p.territoryId),
    baseTerritoryId:
      row.postings.find((p) => p.kind === "BASE")?.territoryId ?? null,
  };
}

/** Thrown by the API guards; caught by withGuard into a 401/403 JSON body. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Require an authenticated user in an API route, or throw 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Sign in required");
  return user;
}

/**
 * Require a member of STAFF — any desk, but not a portal member.
 *
 * The product deliberately lets every desk read every vehicle: what gets
 * withheld from a role is the cost basis, not the record (see
 * api/vehicles/[id], which says so). `requireUser` encodes that, and for the
 * ten staff roles it is right.
 *
 * It is wrong for the eleventh. A PORTAL_VIEWER is an outsider on a named
 * lens — a board observer, an auditor — and the Portal model promises they
 * "sign in to exactly that and nothing else". The transition table already
 * makes that true for actions: PORTAL_VIEWER appears in no row, so they can
 * move nothing, by construction rather than by a check. It was never true for
 * reads. A route that only called `requireUser` handed them the whole book.
 *
 * So the read side needs the check the write side gets for free. Use this
 * anywhere a route returns a record rather than a portal's own composed view;
 * `requireUser` remains correct for anything a portal member is meant to
 * reach.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "PORTAL_VIEWER") {
    throw new HttpError(403, "This account can only read its portal");
  }
  return user;
}

/** Require one of the given roles in an API route, or throw 401/403. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") return user;
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "You do not have access to this action");
  }
  return user;
}
