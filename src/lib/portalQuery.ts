import { prisma } from "./prisma";
import { parseModules, type PortalGrant } from "./portals";

/**
 * Reading a portal out of the database.
 *
 * Kept apart from lib/portals.ts on purpose: that module describes what a
 * portal IS and is imported by the studio, which runs in the browser. This one
 * imports Prisma. Merging them would drag the database client into a client
 * bundle — the same trap `lib/storage.ts` documents for `isPdfName`.
 */

export const portalSelect = {
  id: true,
  name: true,
  purpose: true,
  modules: true,
  band: true,
  showCosts: true,
  showCustomer: true,
  showOffers: true,
  showPhotos: true,
  accent: true,
  glyph: true,
  isActive: true,
  territories: { select: { id: true, name: true }, orderBy: { name: "asc" } },
} as const;

type PortalRow = {
  id: string;
  name: string;
  purpose: string | null;
  modules: unknown;
  band: PortalGrant["band"];
  showCosts: boolean;
  showCustomer: boolean;
  showOffers: boolean;
  showPhotos: boolean;
  accent: PortalGrant["accent"];
  glyph: PortalGrant["glyph"];
  isActive: boolean;
  territories: { id: string; name: string }[];
};

/** The one place the stored row becomes the grant the rest of the app uses. */
export function toGrant(row: PortalRow): PortalGrant {
  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    modules: parseModules(row.modules),
    band: row.band,
    territories: row.territories,
    showCosts: row.showCosts,
    showCustomer: row.showCustomer,
    showOffers: row.showOffers,
    showPhotos: row.showPhotos,
    accent: row.accent,
    glyph: row.glyph,
    isActive: row.isActive,
  };
}

/**
 * Why a member cannot read right now, or the grant if they can.
 *
 * Three failures and they are deliberately distinguished, because an admin
 * debugging "my auditor sees an error" needs to know which one it is:
 *
 *   unassigned  the account is a portal viewer with no portal. Should be
 *               impossible — the user API refuses to write it — but a portal
 *               deleted out from under its members produces exactly this, and
 *               the console reports those as stranded.
 *   suspended   the portal exists and has been switched off.
 *   empty       every panel it grants is inert under its own scope.
 */
export type PortalDenial = "unassigned" | "suspended";

export async function getGrantForUser(
  userId: string,
): Promise<{ grant: PortalGrant } | { denied: PortalDenial }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { portal: { select: portalSelect } },
  });

  if (!user?.portal) return { denied: "unassigned" };
  const grant = toGrant(user.portal);
  if (!grant.isActive) return { denied: "suspended" };
  return { grant };
}

/** A single portal by id, for the admin console and for "preview as". */
export async function getGrant(id: string): Promise<PortalGrant | null> {
  const row = await prisma.portal.findUnique({ where: { id }, select: portalSelect });
  return row ? toGrant(row) : null;
}
