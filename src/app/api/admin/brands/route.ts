import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { brandSchema } from "@/lib/validation";

// Brands, each with the models under it. Returned as one nested payload so the
// admin screen and the capture form both get the whole pick list in one round
// trip — the lists are small and always used together.
export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  const rows = await prisma.brand.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      models: { orderBy: [{ sortOrder: "asc" }, { name: "asc" }] },
    },
  });
  return ok(rows);
});

export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const data = brandSchema.parse(await request.json());
  const row = await prisma.brand.create({
    data: { name: data.name, sortOrder: data.sortOrder ?? 0 },
    include: { models: true },
  });
  return ok(row, 201);
});
