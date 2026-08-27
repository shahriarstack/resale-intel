import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { questionSchema } from "@/lib/validation";

export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  const rows = await prisma.documentQuestion.findMany({ orderBy: { sortOrder: "asc" } });
  return ok(rows);
});

export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const data = questionSchema.parse(await request.json());
  const row = await prisma.documentQuestion.create({
    data: {
      key: data.key,
      label: data.label,
      requiresNote: data.requiresNote ?? false,
      sortOrder: data.sortOrder ?? 0,
    },
  });
  return ok(row, 201);
});
