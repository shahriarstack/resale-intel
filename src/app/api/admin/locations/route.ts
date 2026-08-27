import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { locationSchema } from "@/lib/validation";

export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  const rows = await prisma.location.findMany({ orderBy: { name: "asc" } });
  return ok(rows);
});

export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const data = locationSchema.parse(await request.json());
  const row = await prisma.location.create({ data: { name: data.name, type: data.type } });
  return ok(row, 201);
});
