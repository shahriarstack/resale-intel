import { credentialHash, normaliseStaffId } from "@/lib/credential";
import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { resolveTerritoryNames } from "@/lib/masterData";
import { userImportSchema } from "@/lib/validation";

/**
 * Bulk user import.
 *
 * Onboarding a field force is a hundred near-identical records, and the
 * one-at-a-time form is the wrong instrument for that. This takes the rows a
 * spreadsheet produced and creates the ones it can.
 *
 * Three decisions worth knowing about:
 *
 *  - **Partial success, always reported.** Rows that cannot be created are
 *    skipped and named, rather than failing the batch. An admin fixing two
 *    bad lines out of two hundred should not have to re-run the other
 *    hundred and ninety-eight — and the alternative, an all-or-nothing
 *    import, in practice means someone deletes the two rows and never finds
 *    out what was wrong with them.
 *
 *  - **An existing Staff ID is skipped, never updated.** A CSV that silently
 *    changed somebody's role or territory would be the single most dangerous
 *    thing on this screen. Edits stay on the form, where one person changes
 *    one record and can see what they are changing.
 *
 *  - **Roles are limited to the three field roles** (enforced in the schema).
 *    Nothing here can mint a Super Admin or a pricing approver.
 */

interface Skip {
  /** 1-based line in the admin's file, header excluded — what they will look for. */
  line: number;
  staffId: string;
  reason: string;
}

export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const data = userImportSchema.parse(await request.json());

  // Territories are matched by name, case- and space-insensitively: the admin
  // has the map, not our ids, and "Dhaka North" should not fail against
  // "dhaka  north".
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

  // ---- The file is read as a whole before anything is written -------------
  //
  // A patch's part belongs to the TERRITORY, not to the officer, so two rows
  // naming the same patch have to agree about it. Letting the last row win
  // would mean the classification of a territory depended on the order of a
  // spreadsheet — and the person who wrote it would never know which of their
  // two answers had been taken.
  //
  // So contradictions are found first, and the rows that disagree are skipped
  // with both answers quoted back. Everything else in the file still imports:
  // one inconsistent patch should not cost an admin the other ninety rows.
  const partsSeen = new Map<string, Set<"A" | "B">>();
  for (const r of data.rows) {
    if (r.role === "SALES_TEAM" || !r.territory || !r.part) continue;
    const key = norm(r.territory);
    const set = partsSeen.get(key) ?? new Set<"A" | "B">();
    set.add(r.part);
    partsSeen.set(key, set);
  }
  const contradictory = new Map<string, string>();
  for (const [key, set] of partsSeen) {
    if (set.size > 1) contradictory.set(key, [...set].sort().join(" and "));
  }

  // Patches named in the file that do not exist yet are CREATED, with the part
  // the file gives them. A territory comes into being when somebody is posted
  // to it — the import obeys the same rule as the users form, so a bulk load
  // no longer depends on a list somebody built by hand first.
  const wantedNames = [
    ...new Set(
      data.rows
        .filter(
          (r) =>
            r.role !== "SALES_TEAM" && r.territory && !contradictory.has(norm(r.territory)),
        )
        .map((r) => r.territory!.trim()),
    ),
  ];
  const partByName = new Map<string, "A" | "B" | null>();
  for (const r of data.rows) {
    if (r.role === "SALES_TEAM" || !r.territory || !r.part) continue;
    if (contradictory.has(norm(r.territory))) continue;
    partByName.set(r.territory.trim().toLowerCase(), r.part);
  }

  const resolved = await resolveTerritoryNames(wantedNames, partByName);
  if ("error" in resolved) return fail(resolved.error, 422);

  // Keyed by the looser `norm` the file is matched with, not by the exact
  // spelling resolveTerritoryNames returns.
  const byName = new Map<string, string>();
  for (const name of wantedNames) {
    const id = resolved.idByName.get(name.toLowerCase());
    if (id) byName.set(norm(name), id);
  }

  // One read for every Staff ID in the file, rather than one per row.
  const taken = new Set(
    (
      await prisma.user.findMany({
        where: { staffId: { in: data.rows.map((r) => r.staffId) } },
        select: { staffId: true },
      })
    ).map((u) => u.staffId.toLowerCase()),
  );

  const skipped: Skip[] = [];
  const toCreate: {
    line: number;
    staffId: string;
    name: string;
    designation: string | null;
    role: (typeof data.rows)[number]["role"];
    territoryId: string | null;
    salesTerritory: string | null;
  }[] = [];

  data.rows.forEach((r, i) => {
    const line = i + 1;

    if (taken.has(r.staffId.toLowerCase())) {
      skipped.push({ line, staffId: r.staffId, reason: "Staff ID already exists — left untouched" });
      return;
    }

    // Sales officers work a sales patch; everyone else works a recovery
    // territory. They are different maps, so a value in the wrong column is
    // reported rather than quietly written to the other one.
    let territoryId: string | null = null;
    if (r.role !== "SALES_TEAM" && r.territory) {
      const key = norm(r.territory);
      const clash = contradictory.get(key);
      if (clash) {
        skipped.push({
          line,
          staffId: r.staffId,
          reason: `The file puts "${r.territory}" in part ${clash}. A patch is in one part — fix the file and re-import.`,
        });
        return;
      }
      const found = byName.get(key);
      if (!found) {
        skipped.push({
          line,
          staffId: r.staffId,
          reason: `Could not create territory "${r.territory}"`,
        });
        return;
      }
      territoryId = found;
    }

    toCreate.push({
      line,
      staffId: normaliseStaffId(r.staffId),
      name: r.name,
      designation: r.designation?.trim() || null,
      role: r.role,
      territoryId,
      salesTerritory: r.role === "SALES_TEAM" ? r.salesTerritory?.trim() || null : null,
    });
  });

  // Hashing is the expensive part of this route — bcrypt is deliberately slow
  // — so the hashes are computed once, in parallel, before the transaction is
  // opened rather than inside it holding a lock per row. Each is derived from
  // the row's own Staff ID: the file never carried a password and no longer
  // has a column for one.
  const hashes = await Promise.all(toCreate.map((u) => credentialHash(u.staffId)));

  let created = 0;
  if (toCreate.length) {
    const result = await prisma.user.createMany({
      data: toCreate.map((u, i) => ({
        name: u.name,
        staffId: u.staffId,
        designation: u.designation,
        role: u.role,
        salesTerritory: u.salesTerritory,
        passwordHash: hashes[i],
      })),
      // Belt and braces against a Staff ID created between the check above and
      // this write. The report already told the admin what it expected to do.
      skipDuplicates: true,
    });
    created = result.count;

    // The posting is a separate row, and `createMany` cannot write a relation
    // — so it is written here, after, against the ids the insert produced.
    // Reading them back by Staff ID rather than assuming the insert order is
    // what makes this correct alongside `skipDuplicates`: a row that was
    // skipped has an account already, and must not be given a second posting.
    const withTerritory = toCreate.filter((u) => u.territoryId);
    if (withTerritory.length) {
      const minted = await prisma.user.findMany({
        where: { staffId: { in: withTerritory.map((u) => u.staffId) } },
        select: { id: true, staffId: true, _count: { select: { postings: true } } },
      });
      const idFor = new Map(minted.filter((m) => m._count.postings === 0).map((m) => [m.staffId, m.id]));

      await prisma.territoryPosting.createMany({
        data: withTerritory
          .filter((u) => idFor.has(u.staffId))
          .map((u) => ({
            userId: idFor.get(u.staffId)!,
            territoryId: u.territoryId!,
            // An imported officer is posted to their patch, not covering it.
            // The spreadsheet carries one territory per row; cover is an
            // arrangement somebody makes deliberately, on the user form.
            kind: "BASE" as const,
          })),
        skipDuplicates: true,
      });
    }
  }

  return ok({
    created,
    skipped,
    total: data.rows.length,
  });
});
