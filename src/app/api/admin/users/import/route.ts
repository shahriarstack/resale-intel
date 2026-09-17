import { credentialHash, normaliseStaffId } from "@/lib/credential";
import { ok, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
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
  const territories = await prisma.territory.findMany({
    select: { id: true, name: true },
  });
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const byName = new Map(territories.map((t) => [norm(t.name), t.id]));

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
      const found = byName.get(norm(r.territory));
      if (!found) {
        skipped.push({
          line,
          staffId: r.staffId,
          reason: `No territory called "${r.territory}" — add it under Master data first`,
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
