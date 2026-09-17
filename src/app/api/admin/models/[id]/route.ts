import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { vehicleModelSchema } from "@/lib/validation";

export const PATCH = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await context.params;
    // brandId is intentionally not updatable: moving a model between brands
    // would silently change what past captures appear to have selected.
    const data = vehicleModelSchema.omit({ brandId: true }).partial().parse(await request.json());
    const row = await prisma.vehicleModel.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
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
    await prisma.vehicleModel.delete({ where: { id } });
    return ok({ deleted: true });
  },
);
