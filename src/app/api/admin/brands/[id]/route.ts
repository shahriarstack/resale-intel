import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { brandSchema } from "@/lib/validation";

export const PATCH = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await context.params;
    const data = brandSchema.partial().parse(await request.json());
    const row = await prisma.brand.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
      include: { models: true },
    });
    return ok(row);
  },
);

// Deleting a brand cascades to its models (see schema). Vehicles are untouched:
// they store the brand they were captured with as text, not as a reference.
export const DELETE = withGuard(
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await context.params;
    await prisma.brand.delete({ where: { id } });
    return ok({ deleted: true });
  },
);
