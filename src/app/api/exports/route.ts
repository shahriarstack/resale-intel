import { fail } from "@/lib/api";
import { CSV_BOM, toCsv, stamp } from "@/lib/csv";
import { getSessionUser } from "@/lib/session";
import { canExport, exportFilename, isDatasetKey } from "@/lib/exports";
import { loadDataset, readFilters, toGrid } from "@/lib/exportQuery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The file itself.
 *
 * A GET rather than a POST, because a download is a read and the browser's own
 * navigation is what saves it — `sendJSON` cannot hand a user a file. The role
 * gate is repeated here rather than left to the page: the nav decides what is
 * offered, this decides what is allowed, and a route that trusts its own menu
 * is not access control.
 *
 * The reader's desk reaches `toGrid`, which drops the resale money columns for
 * anyone who may not read them. That is the same call the manifest makes, so
 * the file cannot carry a column the screen said it would not.
 */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return fail("Sign in required", 401);
  if (!canExport(user.role)) return fail("Your desk cannot export data", 403);

  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get("dataset") ?? "";
  if (!isDatasetKey(dataset)) return fail("Unknown dataset", 400);

  const filters = readFilters(searchParams);
  if ("error" in filters) return fail(filters.error, 400);

  const { rows, scope } = await loadDataset(dataset, filters);
  const grid = toGrid(dataset, user.role, rows);
  const filename = exportFilename(dataset, rows.length, stamp(), scope);

  return new Response(CSV_BOM + toCsv(grid), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      // An export is a snapshot of a moving book. A cached one is a lie with a
      // date on it.
      "Cache-Control": "no-store",
    },
  });
}

