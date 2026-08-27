import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { questionSchema } from "@/lib/validation";

export const PATCH = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    await requireRole("SUPER_ADMIN");
    const { id } = await context.params;
    const data = questionSchema.partial().parse(await request.json());
    const row = await prisma.documentQuestion.update({
      where: { id },
      data: {
        ...(data.label !== undefined ? { label: data.label } : {}),
        ...(data.requiresNote !== undefined ? { requiresNote: data.requiresNote } : {}),
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
    await prisma.documentQuestion.delete({ where: { id } });
    return ok({ deleted: true });
  },
);
