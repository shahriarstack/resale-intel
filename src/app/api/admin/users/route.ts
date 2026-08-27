import bcrypt from "bcryptjs";
import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { userCreateSchema } from "@/lib/validation";

// Never returns passwordHash.
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

export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: publicSelect,
  });
  return ok(users);
});

export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const data = userCreateSchema.parse(await request.json());
  const passwordHash = await bcrypt.hash(data.password, 10);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      staffId: data.staffId,
      designation: data.designation?.trim() || null,
      role: data.role,
      territoryId: data.territoryId,
      passwordHash,
    },
    select: publicSelect,
  });
  return ok(user, 201);
});
