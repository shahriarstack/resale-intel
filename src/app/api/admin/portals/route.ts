import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { portalCreateSchema } from "@/lib/validation";
import { portalSelect, toGrant } from "@/lib/portalQuery";
import { describePortal } from "@/lib/portals";

/**
 * Every portal, with the two numbers an admin actually scans the list for:
 * how many people read through it, and how many of those are still able to
 * sign in. A portal with members and none of them active is a lens nobody is
 * looking through, which is worth seeing without opening it.
 */
export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");

  const rows = await prisma.portal.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: {
      ...portalSelect,
      createdAt: true,
      createdBy: { select: { name: true } },
      members: { select: { id: true, name: true, staffId: true, isActive: true } },
    },
  });

  return ok(
    rows.map((r) => {
      const grant = toGrant(r);
      return {
        ...grant,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        members: r.members,
        activeMembers: r.members.filter((m) => m.isActive).length,
        // Composed on the server so the list, the card and the member's own
        // header all read the identical sentence.
        description: describePortal(grant),
      };
    }),
  );
});

export const POST = withGuard(async (request: Request) => {
  const user = await requireRole("SUPER_ADMIN");
  const data = portalCreateSchema.parse(await request.json());

  const row = await prisma.portal.create({
    data: {
      name: data.name,
      purpose: data.purpose?.trim() || null,
      modules: data.modules,
      band: data.band,
      showCosts: data.showCosts,
      showCustomer: data.showCustomer,
      showOffers: data.showOffers,
      showPhotos: data.showPhotos,
      accent: data.accent,
      glyph: data.glyph,
      isActive: data.isActive,
      createdById: user.id,
      territories: data.territoryIds.length
        ? { connect: data.territoryIds.map((id) => ({ id })) }
        : undefined,
    },
    select: { id: true },
  });

  return ok(row, 201);
});
