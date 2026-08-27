import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { territorySchema } from "@/lib/validation";

export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  const rows = await prisma.territory.findMany({ orderBy: { name: "asc" } });
  return ok(rows);
});

export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const data = territorySchema.parse(await request.json());
  const row = await prisma.territory.create({
    data: { name: data.name, code: data.code?.trim() || null },
  });
  return ok(row, 201);
});
