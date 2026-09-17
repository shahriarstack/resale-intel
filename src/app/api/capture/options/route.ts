import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";

// Everything the capture form needs to render its dropdowns and checklist.
export const GET = withGuard(async () => {
  const user = await requireRole("RECOVERY_TEAM");

  const [territories, locations, questions, engineers, brands] = await Promise.all([
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
      // sortOrder is sent because the capture form splits the run around
      // the case slip, which sits at a fixed position in that order.
      select: { id: true, key: true, label: true, requiresNote: true, sortOrder: true },
    }),
    prisma.user.findMany({
      where: { role: "SERVICE_ENGINEER", isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, staffId: true },
    }),
    // Only active brands, and only their active models. A brand hidden in
    // Master data disappears from the form but stays on existing records.
    prisma.brand.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        models: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          select: { id: true, name: true },
        },
      },
    }),
  ]);

  /**
   * An officer is offered THEIR OWN territories and nothing else.
   *
   * Base first, then anything they are temporarily covering. Three forms read
   * this one route — the capture, the capture request and the off-road case —
   * so the rule is applied once here rather than re-decided by each of them,
   * and none of them can drift into offering a patch that is not this
   * officer's to file against.
   *
   * A national list was the wrong shape for the person filling it in: an ARO
   * types one of two names, and scrolling past four they will never pick is
   * four chances to pick the wrong one. Narrowing it is also what makes the
   * dropdown carry information — if there are two entries, the second one is
   * a patch they were handed, and the form says so.
   *
   * SUPER_ADMIN is the exception, and it is not a loophole: an admin is posted
   * nowhere, so "their territories" is empty and a filtered list would leave
   * them unable to enter anything. They administer every territory, so they
   * are offered every territory.
   */
  const held = new Set(user.territoryIds);
  const offered =
    user.role === "SUPER_ADMIN" ? territories : territories.filter((t) => held.has(t.id));

  return ok({
    // Base first — it is the answer nearly every time, and it is preselected.
    territories: [...offered].sort((a, b) => {
      if (a.id === user.baseTerritoryId) return -1;
      if (b.id === user.baseTerritoryId) return 1;
      return a.name.localeCompare(b.name);
    }),
    baseTerritoryId: user.baseTerritoryId,
    locations,
    questions,
    engineers,
    brands,
  });
});
