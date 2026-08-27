import bcrypt from "bcryptjs";
import type { Prisma } from "@prisma/client";
import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userUpdateSchema } from "@/lib/validation";

const publicSelect = {
  id: true,
  name: true,
  staffId: true,
  designation: true,
  role: true,
  isActive: true,
  territoryId: true,
  territory: { select: { name: true } },
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

    const update: Prisma.UserUpdateInput = {};
    if (data.name !== undefined) update.name = data.name;
    if (data.staffId !== undefined) update.staffId = data.staffId;
    if (data.designation !== undefined) update.designation = data.designation.trim() || null;
    if (data.role !== undefined) update.role = data.role;
    if (data.isActive !== undefined) update.isActive = data.isActive;
    if (data.territoryId !== undefined) {
      update.territory = data.territoryId
        ? { connect: { id: data.territoryId } }
        : { disconnect: true };
    }
    if (data.password) update.passwordHash = await bcrypt.hash(data.password, 10);

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
