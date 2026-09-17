import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import { stamp } from "@/lib/csv";
import {
  DATASETS,
  canExport,
  columnsFor,
  exportFilename,
  isDatasetKey,
  withheldFor,
} from "@/lib/exports";
import { loadDataset, readFilters } from "@/lib/exportQuery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * What the download will contain, before it is taken.
 *
 * Nobody should have to open a CSV to find out whether it was the right one.
 * This answers the three questions a reader actually has at the moment they are
 * about to click — how many rows, which columns, and what the file will be
 * called — for the exact filters on screen.
 *
 * It runs the same `loadDataset` the file route runs, which is deliberate and
 * is the whole reason the count can be trusted: a cheaper `count()` over a
 * different query is how a manifest ends up promising a number the file does
 * not contain. The off-road union in particular is three queries merged in
 * application code and has no single count to take.
 *
 * The withheld columns are named rather than silently dropped. A finance reader
 * who is told the margin column is not theirs asks for it; one handed a file
 * that quietly lacks it reads the absence as a zero.
 */
export const GET = withGuard(async (request: Request) => {
  const user = await requireUser();
  if (!canExport(user.role)) return fail("Your desk cannot export data", 403);

  const { searchParams } = new URL(request.url);
  const dataset = searchParams.get("dataset") ?? "";
  if (!isDatasetKey(dataset)) return fail("Unknown dataset", 400);

  const filters = readFilters(searchParams);
  if ("error" in filters) return fail(filters.error, 400);

  const { rows, scope } = await loadDataset(dataset, filters);
  const included = columnsFor(dataset, user.role);
  const withheld = withheldFor(dataset, user.role);

  return ok({
    dataset,
    rows: rows.length,
    columns: included.map((c) => c.label),
    withheld: withheld.map((c) => c.label),
    // A sample rather than the whole thing: enough to recognise the file, not
    // enough to make this a second way of reading the data.
    sample: rows.slice(0, 3).map((r) => included.map((c) => String(r[c.key] ?? ""))),
    filename: exportFilename(dataset, rows.length, stamp(), scope),
    dateLabel: DATASETS[dataset].dateLabel,
  });
});
