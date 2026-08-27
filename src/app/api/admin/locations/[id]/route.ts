import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { locationSchema } from "@/lib/validation";

export const PATCH = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await context.params;
    const data = locationSchema.partial().parse(await request.json());
    const row = await prisma.location.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.type !== undefined ? { type: data.type } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
    return ok(row);
  },
);

export const DELETE = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await context.params;
    await prisma.location.delete({ where: { id } });
    return ok({ deleted: true });
  },
);
