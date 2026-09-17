"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Layers,
  Mail,
  MapPin,
  SearchX,
  UserX,
  Users,
  CalendarRange,
  Download,
  Loader2,
  X,
} from "lucide-react";
import type { RecoveryPart } from "@prisma/client";
import {
  LETTER_COLUMNS,
  STAGE_COLUMNS,
  UNASSIGNED_ID,
  type CoverageRow,
} from "@/lib/coverage";
import { takaCompact } from "@/lib/format";
import { CSV_BOM, stamp, toCsv } from "@/lib/csv";
import { SearchBar } from "@/components/ui/SearchBar";
import { PanelHero } from "@/components/ui/PanelHero";
import { StatTile } from "@/components/ui/StatTile";
import { Chip } from "@/components/ui/Chip";
import { usePersistedEnum } from "@/lib/usePersisted";

/**
 * Territory coverage table.
 *
 * The honest problem here is width: eleven pipeline stages plus five letter
 * stages plus identity and money is twenty-odd columns, and a table that wide
 * is read by nobody. So the columns are BANDED and one band shows at a time —
 * Pipeline or Letters — with "Both" available for anyone who genuinely wants
 * to scroll. The identity columns are sticky, so scrolling the wide view never
 * costs you the territory name.
 *
 * Counts are heat-tinted against the busiest cell in their own column, not
 * across the whole table: comparing "captured" against "sold" would tell you
 * nothing, whereas comparing Sylhet's captures against Khulna's is the entire
 * point of the page.
 */

type Band = "pipeline" | "letters" | "both";
const BANDS = ["pipeline", "letters", "both"] as const;

type PartFilter = "all" | RecoveryPart;

type SortKey = "name" | "part" | "active" | "total" | "value" | string;

export function CoverageTable({
  rows,
  unmanned,
  canSeeValue,
  from,
  to,
  /** Where the date control pushes to. This table is mounted on more than one
   *  route, and the window must return to the page that owns it. */
  basePath = "/coverage",
  /** Recovery Manager lands on the part filter; everyone else sees all. */
  defaultPart = "all",
}: {
  rows: CoverageRow[];
  unmanned: number;
  canSeeValue: boolean;
  /** Active window, as YYYY-MM-DD. Empty means unbounded on that end. */
  from: string;
  to: string;
  basePath?: string;
  defaultPart?: PartFilter;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [band, setBand] = usePersistedEnum<Band>("ri:coverage:band", BANDS, "pipeline");
  const [part, setPart] = useState<PartFilter>(defaultPart);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("active");
  const [asc, setAsc] = useState(false);
  const [gapsOnly, setGapsOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = rows;
    if (part !== "all") list = list.filter((r) => r.part === part);
    // "Gaps" means nobody BASED here — a covered patch is still a gap, which is
    // the whole reason cover is recorded as its own kind.
    if (gapsOnly)
      list = list.filter((r) => !r.aros.some((a) => a.kind === "BASE") && r.total > 0);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          (r.code ?? "").toLowerCase().includes(q) ||
          r.aros.some(
            (a) =>
              a.name.toLowerCase().includes(q) || a.staffId.toLowerCase().includes(q),
          ),
      );
    }

    const dir = asc ? 1 : -1;
    return [...list].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name);
          break;
        case "part":
          // Unassigned sorts last in either direction — it is not a part.
          cmp = (a.part ?? "Z").localeCompare(b.part ?? "Z") || a.name.localeCompare(b.name);
          break;
        case "active":
          cmp = a.active - b.active;
          break;
        case "total":
          cmp = a.total - b.total;
          break;
        case "value":
          cmp = a.approvedValue - b.approvedValue;
          break;
        default:
          // A stage or letter column: the key is the enum value itself.
          cmp = (a.stages[sortKey] ?? a.letters[sortKey] ?? 0) -
            (b.stages[sortKey] ?? b.letters[sortKey] ?? 0);
      }
      return cmp * dir;
    });
  }, [rows, part, gapsOnly, search, sortKey, asc]);

  // Column peaks for the heat tint, computed over what is actually on screen
  // so filtering to one part re-scales the shading to that part.
  const peaks = useMemo(() => {
    const m: Record<string, number> = {};
    for (const c of STAGE_COLUMNS) m[c.status] = Math.max(1, ...filtered.map((r) => r.stages[c.status] ?? 0));
    for (const c of LETTER_COLUMNS) m[c.stage] = Math.max(1, ...filtered.map((r) => r.letters[c.stage] ?? 0));
    return m;
  }, [filtered]);

  const totals = useMemo(() => {
    const t = {
      active: 0,
      total: 0,
      locked: 0,
      value: 0,
      stages: {} as Record<string, number>,
      letters: {} as Record<string, number>,
    };
    for (const r of filtered) {
      t.active += r.active;
      t.total += r.total;
      t.locked += r.locked;
      t.value += r.approvedValue;
      for (const c of STAGE_COLUMNS) t.stages[c.status] = (t.stages[c.status] ?? 0) + (r.stages[c.status] ?? 0);
      for (const c of LETTER_COLUMNS) t.letters[c.stage] = (t.letters[c.stage] ?? 0) + (r.letters[c.stage] ?? 0);
    }
    return t;
  }, [filtered]);

  const partCounts = useMemo(() => {
    const c = { A: 0, B: 0, none: 0 };
    for (const r of rows) {
      if (r.part === "A") c.A += r.active;
      else if (r.part === "B") c.B += r.active;
      else c.none += r.active;
    }
    return c;
  }, [rows]);

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setAsc((v) => !v);
    else {
      setSortKey(k);
      setAsc(false);
    }
  };

  /**
   * Push the window into the URL. The counts are database aggregates, so a
   * date change has to go back to the server — `startTransition` keeps the
   * current table on screen and interactive while it does, instead of
   * blanking to a skeleton for what is usually 100ms of work.
   */
  const applyRange = (nextFrom: string, nextTo: string) => {
    const q = new URLSearchParams();
    if (nextFrom) q.set("from", nextFrom);
    if (nextTo) q.set("to", nextTo);
    const qs = q.toString();
    startTransition(() => router.push(qs ? `${basePath}?${qs}` : basePath));
  };

  const ranged = Boolean(from || to);

  // Which column band is on screen. Declared here because the CSV export below
  // reads them too — the download must match the view, not the default.
  const showStages = band === "pipeline" || band === "both";
  const showLetters = band === "letters" || band === "both";

  // How wide the empty-state row has to be. Derived from the same three
  // toggles that build the header, so it cannot fall out of step with it —
  // the hardcoded number this replaced said 40 against a table that is at
  // most 22 columns wide.
  const columnCount =
    4 + // Territory, Part, ARO, Active
    (showStages ? STAGE_COLUMNS.length : 0) +
    (showLetters ? LETTER_COLUMNS.length : 0) +
    1 + // Total
    (canSeeValue ? 1 : 0);

  // ---- CSV -----------------------------------------------------------------
  /**
   * Export exactly what is on screen: the same rows, the same column band, the
   * same order, and the same value column the viewer is allowed to see. A
   * download that quietly returns something other than the view it was
   * triggered from is a download nobody trusts twice.
   */
  const download = () => {
    const head = [
      "Territory",
      "Code",
      "Part",
      "ARO",
      "ARO Staff ID",
      "Active",
      ...(showStages ? STAGE_COLUMNS.map((c) => c.label) : []),
      ...(showLetters ? LETTER_COLUMNS.map((c) => c.label) : []),
      "Total",
      "Locked",
      ...(canSeeValue ? ["Approved value"] : []),
    ];

    const body = filtered.map((r) => [
      r.name,
      r.code ?? "",
      r.part ?? "",
      r.aros.map((a) => a.name).join(" | "),
      r.aros.map((a) => a.staffId).join(" | "),
      r.active,
      ...(showStages ? STAGE_COLUMNS.map((c) => r.stages[c.status] ?? 0) : []),
      ...(showLetters ? LETTER_COLUMNS.map((c) => r.letters[c.stage] ?? 0) : []),
      r.total,
      r.locked,
      // Raw number, not the compact "Tk 1.2 L" the table shows — a
      // spreadsheet needs something it can sum.
      ...(canSeeValue ? [Math.round(r.approvedValue)] : []),
    ]);

    const footer = [
      "All shown",
      "",
      "",
      "",
      "",
      totals.active,
      ...(showStages ? STAGE_COLUMNS.map((c) => totals.stages[c.status] ?? 0) : []),
      ...(showLetters ? LETTER_COLUMNS.map((c) => totals.letters[c.stage] ?? 0) : []),
      totals.total,
      totals.locked,
      ...(canSeeValue ? [Math.round(totals.value)] : []),
    ];

    // A provenance line, so a file forwarded on still says what it covers.
    const meta = [
      [`Territory coverage — exported ${new Date().toLocaleString("en-GB")}`],
      [
        `Window: ${from || "start"} to ${to || "today"}`,
        `Part: ${part === "all" ? "All" : part}`,
        ...(search.trim() ? [`Search: ${search.trim()}`] : []),
        ...(gapsOnly ? ["Filtered to territories with no ARO"] : []),
      ],
      [],
    ];

    const csv = CSV_BOM + toCsv([...meta, head, ...body, footer]);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `territory-coverage-${part === "all" ? "all" : `part-${part}`}-${stamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on the next tick — released immediately, Safari cancels the
    // download it was in the middle of starting.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="mx-auto w-full max-w-[1580px] px-5 py-6 lg:px-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1" style={{ minWidth: 280 }}>
          <PanelHero
            eyebrow="Coverage"
            title="Territory summary"
            subtitle="Every territory, who covers it, and where its work has reached."
            art="desk"
          />
        </div>
      </div>

      {/* ---- Roll-up rail ---- */}
      <div className="stagger mt-3.5 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <StatTile
          icon={<MapPin size={17} />}
          tint="accent"
          label="Territories"
          value={filtered.length}
          caption={part === "all" ? "all parts" : `part ${part}`}
        />
        <StatTile
          icon={<Layers size={17} />}
          tint="info"
          label="Active files"
          value={totals.active}
          caption={`${totals.total} on the book`}
        />
        <StatTile
          icon={<Mail size={17} />}
          tint="warn"
          label="Locked"
          value={totals.locked}
          caption="Letter 3 / Written"
        />
        <StatTile
          icon={<UserX size={17} />}
          tint={unmanned > 0 ? "bad" : "neutral"}
          label="No ARO"
          value={unmanned}
          caption={unmanned === 0 ? "every territory covered" : "territories with files"}
          onClick={() => setGapsOnly((v) => !v)}
          active={gapsOnly}
        />
      </div>

      {/* ---- Controls ---- */}
      <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
        {/* Part filter. The recovery organisation is split in two, so this is
            the first cut a Recovery Manager makes. */}
        <div className="seg" role="group" aria-label="Recovery part">
          {(["all", "A", "B"] as const).map((p) => (
            <button
              key={p}
              className="seg-btn"
              data-on={part === p}
              onClick={() => setPart(p)}
              aria-pressed={part === p}
            >
              {p === "all" ? "All parts" : `Part ${p}`}
              <span className="ml-1.5 font-mono text-[10px] opacity-60">
                {p === "all" ? partCounts.A + partCounts.B + partCounts.none : partCounts[p]}
              </span>
            </button>
          ))}
        </div>

        <div className="seg" role="group" aria-label="Column band">
          {BANDS.map((b) => (
            <button
              key={b}
              className="seg-btn"
              data-on={band === b}
              onClick={() => setBand(b)}
              aria-pressed={band === b}
            >
              {b === "pipeline" ? "Pipeline" : b === "letters" ? "Letters" : "Both"}
            </button>
          ))}
        </div>

        <div className="min-w-[200px] flex-1">
          <SearchBar
            value={search}
            onChange={setSearch}
            placeholder="Search territory, code or ARO…"
          />
        </div>

        <button
          className="btn btn-gradient btn-sm shrink-0"
          onClick={download}
          disabled={filtered.length === 0}
          title="Download the table as shown"
        >
          <Download size={13} />
          CSV
        </button>
      </div>

      {/* ---- Date window ----
          Separate from the filters above because it behaves differently: those
          narrow rows already on the page, this re-counts on the server. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2.5">
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.13em] text-ink-3">
          <CalendarRange size={12} />
          Captured
        </span>

        <div className="seg" role="group" aria-label="Date range preset">
          {RANGE_PRESETS.map((r) => {
            const [f, t] = r.value();
            const on = from === f && to === t;
            return (
              <button
                key={r.label}
                className="seg-btn"
                data-on={on}
                aria-pressed={on}
                onClick={() => applyRange(f, t)}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-1.5">
          <input
            type="date"
            className="field h-8 w-[142px] py-0 text-xs"
            aria-label="Captured from"
            value={from}
            max={to || undefined}
            onChange={(e) => applyRange(e.target.value, to)}
          />
          <span className="text-[11px] text-ink-3">to</span>
          <input
            type="date"
            className="field h-8 w-[142px] py-0 text-xs"
            aria-label="Captured to"
            value={to}
            min={from || undefined}
            onChange={(e) => applyRange(from, e.target.value)}
          />
        </div>

        {ranged && (
          <button
            className="btn btn-ghost btn-sm shrink-0"
            onClick={() => applyRange("", "")}
            title="Clear the date window"
          >
            <X size={12} />
            Clear
          </button>
        )}

        {pending && (
          <span className="flex items-center gap-1.5 font-mono text-[10px] text-ink-3">
            <Loader2 size={11} className="animate-spin" />
            recounting…
          </span>
        )}
      </div>

      {unmanned > 0 && !gapsOnly && (
        <button
          className="mt-3 flex w-full items-center gap-2 rounded-[var(--radius)] border border-bad/25 bg-bad-soft px-3.5 py-2.5 text-left transition-colors hover:border-bad/40"
          onClick={() => setGapsOnly(true)}
        >
          <AlertTriangle size={15} className="shrink-0 text-bad" />
          <span className="text-[12.5px] font-medium text-bad">
            {unmanned} {unmanned === 1 ? "territory holds" : "territories hold"} files with no ARO
            assigned.
          </span>
          <span className="ml-auto shrink-0 font-mono text-[10.5px] uppercase tracking-wider text-bad opacity-70">
            Show
          </span>
        </button>
      )}

      {/* ---- Table ---- */}
      <div className="card mt-3.5 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="dtable coverage-table w-full">
            <thead>
              <tr>
                <th className="coverage-sticky sortable group" onClick={() => toggleSort("name")}>
                  Territory
                  <SortIcon k="name" sortKey={sortKey} asc={asc} />
                </th>
                <th className="sortable group" onClick={() => toggleSort("part")}>
                  Part
                  <SortIcon k="part" sortKey={sortKey} asc={asc} />
                </th>
                <th>ARO</th>
                <th className="num sortable group" onClick={() => toggleSort("active")}>
                  Active
                  <SortIcon k="active" sortKey={sortKey} asc={asc} />
                </th>

                {showStages &&
                  STAGE_COLUMNS.map((c) => (
                    <th
                      key={c.status}
                      className="num sortable group band-stage"
                      title={c.full}
                      onClick={() => toggleSort(c.status)}
                    >
                      {c.label}
                      <SortIcon k={c.status} sortKey={sortKey} asc={asc} />
                    </th>
                  ))}

                {showLetters &&
                  LETTER_COLUMNS.map((c) => (
                    <th
                      key={c.stage}
                      className="num sortable group band-letter"
                      onClick={() => toggleSort(c.stage)}
                    >
                      {c.label}
                      <SortIcon k={c.stage} sortKey={sortKey} asc={asc} />
                    </th>
                  ))}

                <th className="num sortable group" onClick={() => toggleSort("total")}>
                  Total
                  <SortIcon k="total" sortKey={sortKey} asc={asc} />
                </th>
                {canSeeValue && (
                  <th className="num sortable group" onClick={() => toggleSort("value")}>
                    Approved value
                    <SortIcon k="value" sortKey={sortKey} asc={asc} />
                  </th>
                )}
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={columnCount} className="py-12 text-center">
                    <SearchX size={22} className="mx-auto mb-2 text-ink-3" />
                    <p className="text-[13px] text-ink-2">
                      No territory matches this filter.
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((r) => (
                  <tr key={r.territoryId} data-quiet={r.total === 0}>
                    <td className="coverage-sticky strong">
                      <span className="flex items-center gap-1.5">
                        <span className="truncate">{r.name}</span>
                        {!r.isActive && (
                          <span className="font-mono text-[9px] uppercase text-ink-3">hidden</span>
                        )}
                      </span>
                      {r.code && (
                        <span className="block font-mono text-[10px] text-ink-3">{r.code}</span>
                      )}
                    </td>

                    <td>
                      {r.part ? (
                        <span className="part-pill" data-part={r.part}>
                          {r.part}
                        </span>
                      ) : (
                        <span className="font-mono text-[10.5px] text-ink-3">—</span>
                      )}
                    </td>

                    <td>
                      <AroCell row={r} />
                    </td>

                    <td className="num strong">{r.active || <Zero />}</td>

                    {showStages &&
                      STAGE_COLUMNS.map((c) => (
                        <Cell
                          key={c.status}
                          value={r.stages[c.status] ?? 0}
                          peak={peaks[c.status]}
                          tone={c.tone}
                          band="stage"
                        />
                      ))}

                    {showLetters &&
                      LETTER_COLUMNS.map((c) => (
                        <Cell
                          key={c.stage}
                          value={r.letters[c.stage] ?? 0}
                          peak={peaks[c.stage]}
                          tone={c.tone}
                          band="letter"
                        />
                      ))}

                    <td className="num strong">{r.total || <Zero />}</td>
                    {canSeeValue && (
                      <td className="num">
                        {r.approvedValue > 0 ? (
                          takaCompact(r.approvedValue)
                        ) : (
                          <Zero />
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>

            {filtered.length > 0 && (
              <tfoot>
                <tr>
                  <td className="coverage-sticky strong">All shown</td>
                  <td />
                  <td className="font-mono text-[10.5px] text-ink-3">
                    {(() => {
                      const n = filtered.reduce((sum, r) => sum + r.aros.length, 0);
                      return `${n} ${n === 1 ? "officer" : "officers"}`;
                    })()}
                  </td>
                  <td className="num strong">{totals.active}</td>
                  {showStages &&
                    STAGE_COLUMNS.map((c) => (
                      <td key={c.status} className="num strong">
                        {totals.stages[c.status] || <Zero />}
                      </td>
                    ))}
                  {showLetters &&
                    LETTER_COLUMNS.map((c) => (
                      <td key={c.stage} className="num strong">
                        {totals.letters[c.stage] || <Zero />}
                      </td>
                    ))}
                  <td className="num strong">{totals.total}</td>
                  {canSeeValue && (
                    <td className="num strong">
                      {totals.value > 0 ? takaCompact(totals.value) : <Zero />}
                    </td>
                  )}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <p className="mt-2.5 font-mono text-[10px] leading-relaxed text-ink-3">
        Cell shading compares each column against the busiest territory shown, so filtering to one
        part re-scales it.
        {ranged && " Counts cover vehicles captured inside the selected window only."}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------

/** `<input type="date">` and the query string both want local YYYY-MM-DD. */
function iso(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

/**
 * Windows worth one click.
 *
 * Evaluated on each render rather than frozen at module load, so a tab left
 * open overnight does not offer yesterday's "last 30 days".
 */
const RANGE_PRESETS: { label: string; value: () => [string, string] }[] = [
  { label: "All time", value: () => ["", ""] },
  { label: "30 days", value: () => [daysAgo(30), iso(new Date())] },
  { label: "90 days", value: () => [daysAgo(90), iso(new Date())] },
  {
    label: "This year",
    value: () => [iso(new Date(new Date().getFullYear(), 0, 1)), iso(new Date())],
  },
];

/** A zero that recedes. A grid of bold noughts hides the numbers that matter. */
function Zero() {
  return <span className="text-ink-3 opacity-40">·</span>;
}

function Cell({
  value,
  peak,
  tone,
  band,
}: {
  value: number;
  peak: number;
  tone: string;
  band: "stage" | "letter";
}) {
  if (value === 0) {
    return (
      <td className={`num band-${band}`}>
        <Zero />
      </td>
    );
  }
  // Floored at 0.12 so the smallest non-zero cell is still visibly tinted, and
  // capped below full strength so the text stays readable on top of it.
  const intensity = 0.12 + (value / peak) * 0.5;
  return (
    <td className={`num band-${band}`} data-tone={tone}>
      <span
        className="heat-cell"
        style={{ background: `color-mix(in srgb, var(--tone) ${Math.round(intensity * 100)}%, transparent)` }}
      >
        {value}
      </span>
    </td>
  );
}

function AroCell({ row }: { row: CoverageRow }) {
  if (row.territoryId === UNASSIGNED_ID) {
    return <span className="font-mono text-[10.5px] text-ink-3">no territory set</span>;
  }
  if (row.aros.length === 0) {
    return (
      <span className="flex items-center gap-1.5">
        <UserX size={12} className="shrink-0 text-bad" />
        <Link
          href="/admin/users"
          className="text-[11.5px] font-medium text-bad underline-offset-2 hover:underline"
        >
          Unassigned
        </Link>
      </span>
    );
  }
  // The officer POSTED here, if there is one, is the answer to "whose patch is
  // this". Anyone else on the row is covering, and is the answer to the
  // different question "who do I ring today" — so both are shown, and which is
  // which is never left to be inferred from the order.
  const based = row.aros.filter((a) => a.kind === "BASE");
  const covering = row.aros.filter((a) => a.kind === "COVER");

  // Nobody based, but somebody holding it. The vacancy is the headline: a
  // stand-in who reads as the posting is how a patch goes a year unfilled.
  if (based.length === 0) {
    return (
      <span className="block min-w-0" title={covering.map((a) => a.name).join(", ")}>
        <span className="flex items-center gap-1.5">
          <UserX size={12} className="shrink-0 text-warn" />
          <Chip tone="warn">Vacant</Chip>
        </span>
        <span className="mt-0.5 block truncate text-[10.5px] text-ink-3">
          covered by {covering.map((a) => a.name).join(", ")}
        </span>
      </span>
    );
  }

  if (based.length === 1) {
    const a = based[0];
    return (
      <span className="block min-w-0">
        <span className="block truncate text-[11.5px] font-medium text-ink">{a.name}</span>
        {covering.length > 0 ? (
          <span className="block truncate text-[9.5px] text-ink-3">
            + {covering.length} covering
          </span>
        ) : (
          <span className="block truncate font-mono text-[9.5px] text-ink-3">{a.staffId}</span>
        )}
      </span>
    );
  }

  // Two officers BASED on one patch is still roster drift — cover has its own
  // shape now, so this can only mean somebody was posted twice by mistake.
  return (
    <span className="flex items-center gap-1.5" title={based.map((a) => a.name).join(", ")}>
      <Users size={12} className="shrink-0 text-warn" />
      <Chip tone="warn">{based.length} based</Chip>
    </span>
  );
}

function SortIcon({ k, sortKey, asc }: { k: SortKey; sortKey: SortKey; asc: boolean }) {
  if (sortKey !== k) {
    return (
      <ArrowUpDown
        size={10}
        className="ml-1 inline opacity-0 transition-opacity group-hover:opacity-60"
      />
    );
  }
  return asc ? (
    <ArrowUp size={10} className="ml-1 inline text-accent" />
  ) : (
    <ArrowDown size={10} className="ml-1 inline text-accent" />
  );
}
