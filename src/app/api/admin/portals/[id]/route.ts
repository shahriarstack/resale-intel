import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { portalUpdateSchema } from "@/lib/validation";

/**
 * Recompose a portal.
 *
 * Every change lands on people who are already signed in, at their next
 * request — there is no session to invalidate, because nothing about the grant
 * is carried in the token. The portal is read fresh on every page load, which
 * is what makes suspending one an immediate act rather than one that waits for
 * a member to sign out.
 */
export const PATCH = withGuard(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await params;
    const data = portalUpdateSchema.parse(await request.json());

    const existing = await prisma.portal.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return fail("That portal no longer exists", 404);

    await prisma.portal.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.purpose !== undefined ? { purpose: data.purpose.trim() || null } : {}),
        ...(data.modules !== undefined ? { modules: data.modules } : {}),
        ...(data.band !== undefined ? { band: data.band } : {}),
        ...(data.showCosts !== undefined ? { showCosts: data.showCosts } : {}),
        ...(data.showCustomer !== undefined ? { showCustomer: data.showCustomer } : {}),
        ...(data.showOffers !== undefined ? { showOffers: data.showOffers } : {}),
        ...(data.showPhotos !== undefined ? { showPhotos: data.showPhotos } : {}),
        ...(data.accent !== undefined ? { accent: data.accent } : {}),
        ...(data.glyph !== undefined ? { glyph: data.glyph } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        // `set` rather than connect/disconnect: the client sends the whole
        // list it wants, so replacing is both correct and one round trip.
        ...(data.territoryIds !== undefined
          ? { territories: { set: data.territoryIds.map((t) => ({ id: t })) } }
          : {}),
      },
    });

    return ok({ id });
  },
);

/**
 * Delete a portal.
 *
 * Refused while anyone is still assigned to it. The relation is SetNull, so
 * the delete would succeed and leave those accounts as portal viewers pointing
 * at nothing — able to sign in, able to see nothing, and with no record of
 * what they were once able to see. Suspending is the reversible act and is
 * what an admin nearly always means; this is for a lens that was never used.
 */
export const DELETE = withGuard(
  async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await params;

    const portal = await prisma.portal.findUnique({
      where: { id },
      select: { _count: { select: { members: true } } },
    });
    if (!portal) return fail("That portal no longer exists", 404);

    if (portal._count.members > 0) {
      const n = portal._count.members;
      return fail(
        `${n} account${n === 1 ? " reads" : "s read"} through this portal. Move them to another portal first, or suspend this one instead.`,
        409,
      );
    }

    await prisma.portal.delete({ where: { id } });
    return ok({ id });
  },
);
