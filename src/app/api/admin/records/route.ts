import type { AdminRecordKind } from "@prisma/client";
import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { searchAdminRecords, KIND_LABEL } from "@/lib/adminRecords";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The administrator's search across all three books.
 *
 * Super Admin only, and read-only. The console that calls this can delete, so
 * the search and the deletion are separate endpoints on purpose: a mistyped
 * filter should never be one character away from a mutation.
 */
export const GET = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const p = new URL(request.url).searchParams;

  const kinds = (p.get("kinds") ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean) as AdminRecordKind[];
  for (const k of kinds) {
    if (!(k in KIND_LABEL)) return fail(`Unknown record kind: ${k}`, 400);
  }

  const stages = (p.get("stages") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const parseDate = (v: string | null): Date | null => {
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  // An inclusive end date: somebody filtering "to the 30th" means the whole of
  // the 30th, not midnight at the start of it.
  const to = parseDate(p.get("to"));
  if (to) to.setHours(23, 59, 59, 999);

  const page = await searchAdminRecords({
    // No kinds named means every kind. A console that opens showing nothing
    // until you tick three boxes is a console nobody uses.
    kinds: kinds.length ? kinds : (Object.keys(KIND_LABEL) as AdminRecordKind[]),
    stages,
    territoryId: p.get("territory")?.trim() || null,
    from: parseDate(p.get("from")),
    to,
    q: p.get("q")?.trim() || null,
  });

  return ok(page);
});
