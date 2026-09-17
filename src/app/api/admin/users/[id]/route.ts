import { credentialHash, normaliseStaffId } from "@/lib/credential";
import type { Prisma } from "@prisma/client";
import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { portalPairingError } from "@/lib/portals";
import { postingError } from "@/lib/postings";
import { userUpdateSchema } from "@/lib/validation";

const publicSelect = {
  id: true,
  name: true,
  staffId: true,
  designation: true,
  role: true,
  isActive: true,
  // Every territory this person works, base first. Replaces the single
  // `territoryId`/`territory` pair — see the TerritoryPosting model.
  postings: {
    orderBy: { kind: "asc" },
    select: {
      kind: true,
      territoryId: true,
      territory: { select: { name: true, part: true } },
    },
  },
  salesTerritory: true,
  portalId: true,
  portal: { select: { id: true, name: true, accent: true, glyph: true, isActive: true } },
  createdAt: true,
} as const;

// Would this change leave zero active Super Admins?
async function wouldOrphanAdmin(id: string, next: { role?: string; isActive?: boolean }) {
  const target = await prisma.user.findUnique({ where: { id }, select: { role: true, isActive: true } });
  if (!target || target.role !== "SUPER_ADMIN" || !target.isActive) return false;
  const losesAdmin = (next.role !== undefined && next.role !== "SUPER_ADMIN") || next.isActive === false;
  if (!losesAdmin) return false;
  const activeAdmins = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
  return activeAdmins <= 1;
}

export const PATCH = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await context.params;
    const data = userUpdateSchema.parse(await request.json());

    if (await wouldOrphanAdmin(id, { role: data.role, isActive: data.isActive })) {
      return fail("Cannot remove the last active Super Admin", 400);
    }

    // The role and the portal can each arrive on their own, so the pairing is
    // checked against what the row will hold once this merges into it.
    const current = await prisma.user.findUnique({
      where: { id },
      select: { role: true, portalId: true, staffId: true },
    });
    if (!current) return fail("User not found", 404);

    const nextRole = data.role ?? current.role;
    const nextPortal = data.portalId !== undefined ? data.portalId : current.portalId;
    const mismatch = portalPairingError(nextRole, nextPortal);
    if (mismatch) return fail(mismatch, 422);

    const update: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) update.name = data.name;
    // Renaming a Staff ID re-credentials the account in the same write. They
    // are one fact, not two — letting them come apart would leave somebody
    // signing in with an ID that is no longer theirs, and no screen anywhere
    // would show that it had happened.
    if (data.staffId !== undefined) {
      const staffId = normaliseStaffId(data.staffId);
      update.staffId = staffId;
      if (staffId !== current.staffId) update.passwordHash = await credentialHash(staffId);
    }
    if (data.designation !== undefined) update.designation = data.designation.trim() || null;
    if (data.role !== undefined) update.role = data.role;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    // Postings are REPLACED, not merged. The form sends the whole set it wants
    // — which is the only shape that can express "stop covering Rajshahi", a
    // removal being exactly what this edit is usually for once a new officer
    // has been posted there. Deleting and recreating loses `assignedAt` on the
    // ones that survive, so those are left alone and only the difference is
    // written.
    if (data.territoryIds !== undefined) {
      const nextIds = data.territoryIds;
      const nextBase = data.baseTerritoryId ?? null;

      const posting = postingError(nextRole, nextIds, nextBase);
      if (posting) return fail(posting, 422);

      const held = await prisma.territoryPosting.findMany({
        where: { userId: id },
        select: { territoryId: true, kind: true },
      });
      const heldIds = new Set(held.map((p) => p.territoryId));

      await prisma.$transaction([
        prisma.territoryPosting.deleteMany({
          where: { userId: id, territoryId: { notIn: nextIds.length ? nextIds : ["—none—"] } },
        }),
        ...nextIds
          .filter((t) => !heldIds.has(t))
          .map((territoryId) =>
            prisma.territoryPosting.create({
              data: {
                userId: id,
                territoryId,
                kind: territoryId === nextBase ? "BASE" : "COVER",
              },
            }),
          ),
        // A patch that was cover and is now home — or the reverse, when an
        // officer is moved and starts covering what used to be theirs.
        ...held
          .filter((p) => nextIds.includes(p.territoryId))
          .filter((p) => (p.territoryId === nextBase) !== (p.kind === "BASE"))
          .map((p) =>
            prisma.territoryPosting.update({
              where: { userId_territoryId: { userId: id, territoryId: p.territoryId } },
              data: { kind: p.territoryId === nextBase ? "BASE" : "COVER" },
            }),
          ),
      ]);
    }
    if (data.salesTerritory !== undefined) {
      update.salesTerritory = data.salesTerritory.trim() || null;
    }
    // Written whenever it differs from what is stored, not only when the
    // client sent it: moving someone off PORTAL_VIEWER has to drop the portal
    // with them, and the control that does that sends the role alone.
    if (nextPortal !== current.portalId) {
      update.portal = nextPortal ? { connect: { id: nextPortal } } : { disconnect: true };
    }

    const user = await prisma.user.update({ where: { id }, data: update, select: publicSelect });
    return ok(user);
  },
);

export const DELETE = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const admin = await requireRole("SUPER_ADMIN");
    const { id } = await context.params;
    if (id === admin.id) return fail("You cannot delete your own account", 400);

    const target = await prisma.user.findUnique({ where: { id }, select: { role: true } });
    if (!target) return fail("User not found", 404);
    if (target.role === "SUPER_ADMIN") {
      const admins = await prisma.user.count({ where: { role: "SUPER_ADMIN", isActive: true } });
      if (admins <= 1) return fail("Cannot delete the last Super Admin", 400);
    }

    await prisma.user.delete({ where: { id } });
    return ok({ deleted: true });
  },
);
