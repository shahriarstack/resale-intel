import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Everything the capture form needs to render its dropdowns and checklist.
export const GET = withGuard(async () => {
  await requireRole("RECOVERY_TEAM");

  const [territories, locations, questions, engineers] = await Promise.all([
    prisma.territory.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.location.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true },
    }),
    prisma.documentQuestion.findMany({
      where: { isActive: true },
      orderBy: { sortOrder: "asc" },
      select: { id: true, key: true, label: true, requiresNote: true },
    }),
    prisma.user.findMany({
      where: { role: "SERVICE_ENGINEER", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, staffId: true },
    }),
  ]);

  return ok({ territories, locations, questions, engineers });
});
