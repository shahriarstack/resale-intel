"use client";

import { useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Download,
  FileUp,
  Loader2,
  Upload,
  X,
} from "lucide-react";
import type { Role } from "@prisma/client";
import { sendJSON } from "@/lib/http";
import { parseCsvRecords, CSV_BOM, toCsv, stamp } from "@/lib/csv";
import { ROLE_META } from "@/lib/rbac";

/**
 * Bulk user import.
 *
 * The shape of this dialog is one decision: the admin sees exactly what will
 * happen BEFORE anything is written. A file drop that goes straight to the
 * server and reports afterwards is the same feature with the anxiety left in
 * — with two hundred officers in a spreadsheet, "what did that just do to my
 * user list" is not a question anyone should have to answer retrospectively.
 *
 * So the file is parsed in the browser, every row is checked against the same
 * rules the server enforces, and the preview names the problems by line
 * number. The Import button only ever sends rows that already passed.
 */

const IMPORT_ROLES: Role[] = ["SALES_TEAM", "RECOVERY_TEAM", "SERVICE_ENGINEER"];

/**
 * What an admin might reasonably type in the role column.
 *
 * Their spreadsheet says "Sales Officer" or "ARO", not `SALES_TEAM`. Matching
 * on the words people actually use costs one lookup table and saves every
 * single one of them a failed import.
 */
const ROLE_WORDS: Record<string, Role> = {
  salesteam: "SALES_TEAM",
  sales: "SALES_TEAM",
  salesofficer: "SALES_TEAM",
  mo: "SALES_TEAM",
  recoveryteam: "RECOVERY_TEAM",
  recovery: "RECOVERY_TEAM",
  recoveryofficer: "RECOVERY_TEAM",
  aro: "RECOVERY_TEAM",
  serviceengineer: "SERVICE_ENGINEER",
  service: "SERVICE_ENGINEER",
  serviceofficer: "SERVICE_ENGINEER",
  engineer: "SERVICE_ENGINEER",
  se: "SERVICE_ENGINEER",
};

interface Parsed {
  line: number;
  staffId: string;
  name: string;
  role: Role | null;
  roleRaw: string;
  designation: string;
  territory: string;
  salesTerritory: string;
  /** "A" / "B", already normalised from whatever the file said. */
  part: "A" | "B" | "";
  /** This patch does not exist yet — it will be created by the import. */
  newTerritory: boolean;
  /** Empty when the row is good to send. */
  error: string;
}

interface ImportReport {
  created: number;
  total: number;
  skipped: { line: number; staffId: string; reason: string }[];
}

const TEMPLATE = [
  ["staff_id", "name", "role", "designation", "territory", "part", "sales_territory"],
  // Part is read generously — "A", "a", "Part A" and "part-a" all mean A — so
  // the column is easy to fill from a list somebody already keeps.
  ["ARO-014", "Rakib Hasan", "Recovery Team", "Sr. ARO", "Dhaka North", "A", ""],
  ["ARO-022", "Imran Kabir", "Recovery Team", "ARO", "Chittagong South", "Part B", ""],
  // An engineer works a bench, not a map: no territory, no part.
  ["SE-007", "Tanvir Ahmed", "Service Engineer", "Sr. SE", "", "", ""],
  // Sales draws its own map, in its own column.
  ["MO-021", "Jubayer Alam", "Sales Team", "Sr. MO", "", "", "Mirpur"],
];

export function UserImportDialog({
  territories,
  onClose,
  onDone,
}: {
  territories: { id: string; name: string }[];
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<Parsed[] | null>(null);
  const [parseError, setParseError] = useState("");
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<ImportReport | null>(null);

  const known = useMemo(
    () => new Set(territories.map((t) => t.name.trim().toLowerCase().replace(/\s+/g, " "))),
    [territories],
  );

  const good = useMemo(() => rows?.filter((r) => !r.error) ?? [], [rows]);
  const bad = useMemo(() => rows?.filter((r) => r.error) ?? [], [rows]);

  /** Patches this file will bring into existence. */
  const newPatches = useMemo(
    () => [...new Set(good.filter((r) => r.newTerritory).map((r) => r.territory))],
    [good],
  );

  /**
   * A patch given two different parts by the same file.
   *
   * Part belongs to the TERRITORY, so two rows naming one patch have to agree.
   * Letting the last row win would make a territory's classification depend on
   * spreadsheet order, and the person who wrote it would never learn which of
   * their two answers was taken. The server refuses these rows too; this is so
   * it is visible before the upload rather than in the receipt after it.
   */
  const partClashes = useMemo(() => {
    const seen = new Map<string, Set<string>>();
    for (const r of good) {
      if (!r.territory || !r.part) continue;
      const key = r.territory.toLowerCase().replace(/\s+/g, " ");
      const set = seen.get(key) ?? new Set<string>();
      set.add(r.part);
      seen.set(key, set);
    }
    return [...seen.entries()]
      .filter(([, set]) => set.size > 1)
      .map(([key, set]) => ({
        name: good.find((r) => r.territory.toLowerCase().replace(/\s+/g, " ") === key)!.territory,
        parts: [...set].sort().join(" and "),
      }));
  }, [good]);

  const downloadTemplate = () => {
    const blob = new Blob([CSV_BOM + toCsv(TEMPLATE)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `user-import-template-${stamp()}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const readFile = async (file: File) => {
    setParseError("");
    setReport(null);
    setFileName(file.name);
    try {
      const { headers, records } = parseCsvRecords(await file.text());

      if (!headers.length) {
        setParseError("That file is empty.");
        setRows(null);
        return;
      }
      const keys = headers.map((h) => h.toLowerCase().replace(/[\s\-_]+/g, ""));
      const missing = ["staffid", "name", "role"].filter((k) => !keys.includes(k));
      if (missing.length) {
        setParseError(
          `The file needs a ${missing.join(", ")} column. Download the template to see the expected headings.`,
        );
        setRows(null);
        return;
      }

      const seen = new Map<string, number>();
      const parsed: Parsed[] = records.map((rec, i) => {
        const line = i + 1;
        const staffId = rec.staffid ?? "";
        const name = rec.name ?? "";
        const roleRaw = rec.role ?? "";
        const role = ROLE_WORDS[roleRaw.toLowerCase().replace(/[\s\-_.]+/g, "")] ?? null;
        const territory = rec.territory ?? "";
        const salesTerritory = rec.salesterritory ?? "";
        // "A", "a", "Part A", "part-b" — all the same two answers.
        const partRaw = (rec.part ?? "").trim().toUpperCase().replace(/^PART[\s\-_]*/, "");
        const part: "A" | "B" | "" = partRaw === "A" || partRaw === "B" ? partRaw : "";
        const newTerritory =
          role !== "SALES_TEAM" &&
          !!territory &&
          !known.has(territory.toLowerCase().replace(/\s+/g, " "));

        let error = "";
        if (!staffId) error = "Staff ID is blank";
        else if (!name) error = "Name is blank";
        else if (!role) error = `"${roleRaw || "blank"}" is not a role this import accepts`;
        // An unknown territory is no longer an error. A patch comes into being
        // when somebody is posted to it, so the import creates it — the row is
        // flagged as new in the preview instead of refused.
        else if (partRaw && partRaw !== "A" && partRaw !== "B")
          error = `Part must be A or B, not "${rec.part}"`;

        if (!error) {
          const dup = seen.get(staffId.toLowerCase());
          if (dup !== undefined) error = `Same Staff ID as line ${dup}`;
          else seen.set(staffId.toLowerCase(), line);
        }

        return {
          line,
          staffId,
          name,
          role,
          roleRaw,
          designation: rec.designation ?? "",
          territory,
          salesTerritory,
          part,
          newTerritory,
          error,
        };
      });

      setRows(parsed);
    } catch {
      setParseError("That file could not be read as CSV.");
      setRows(null);
    }
  };

  const submit = async () => {
    if (!good.length) return;
    setBusy(true);
    setParseError("");
    try {
      const res = await sendJSON<ImportReport>("/api/admin/users/import", "POST", {
        rows: good.map((r) => ({
          staffId: r.staffId,
          name: r.name,
          role: r.role,
          designation: r.designation,
          territory: r.territory,
          part: r.part,
          salesTerritory: r.salesTerritory,
        })),
      });
      setReport(res);
      onDone();
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "The import failed.");
    } finally {
      setBusy(false);
    }
  };

  // ---- The receipt ---------------------------------------------------------
  if (report) {
    return (
      <div className="backdrop backdrop-center" onClick={onClose}>
        <div className="modal-panel max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-start gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl"
              style={{ background: "var(--ok-soft)", color: "var(--ok-ink)" }}
            >
              <CheckCircle2 size={20} />
            </span>
            <div className="min-w-0">
              <h3 className="font-display text-xl font-bold text-ink">
                {report.created} user{report.created === 1 ? "" : "s"} added
              </h3>
              <p className="mt-0.5 text-sm text-ink-2">
                From {report.total} row{report.total === 1 ? "" : "s"} in {fileName || "the file"}.
                {report.created > 0 && " Each signs in with their own Staff ID."}
              </p>
            </div>
          </div>

          {report.skipped.length > 0 && (
            <div className="mt-4">
              <div className="label mb-1.5">
                {report.skipped.length} row{report.skipped.length === 1 ? "" : "s"} skipped
              </div>
              <ul className="max-h-52 overflow-y-auto rounded-[var(--radius)] border border-rule">
                {report.skipped.map((s) => (
                  <li
                    key={`${s.line}-${s.staffId}`}
                    className="flex items-baseline gap-2 border-b border-rule px-3 py-1.5 text-[12px] last:border-b-0"
                  >
                    <span className="font-mono text-[10px] text-ink-3">line {s.line}</span>
                    <span className="font-mono text-[11px] font-semibold text-ink">{s.staffId}</span>
                    <span className="min-w-0 flex-1 text-ink-2">{s.reason}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
                Nothing on these lines was changed. Fix them in the file and import it again — the
                rows that succeeded will be skipped as duplicates.
              </p>
            </div>
          )}

          <button className="btn btn-primary btn-block mt-5" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    );
  }

  // ---- The picker and preview ---------------------------------------------
  return (
    <div className="backdrop backdrop-center" onClick={() => !busy && onClose()}>
      <div className="modal-panel max-w-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-xl font-bold text-ink">Import users from CSV</h3>
            <p className="mt-0.5 text-sm text-ink-2">
              Sales officers, recovery officers and service engineers, in one go.
            </p>
          </div>
          <button
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            onClick={onClose}
            disabled={busy}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <button className="btn btn-ghost btn-sm" onClick={downloadTemplate}>
          <Download size={14} /> Download template
        </button>
        <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
          Columns: <strong className="text-ink-2">staff_id</strong>,{" "}
          <strong className="text-ink-2">name</strong> and{" "}
          <strong className="text-ink-2">role</strong> are required; designation, territory,
          part and sales_territory are optional. There is no password column — each person signs
          in with their own Staff ID. Role accepts &ldquo;Recovery Team&rdquo;,
          &ldquo;Sales Team&rdquo;, &ldquo;Service Engineer&rdquo; or the short forms ARO, MO, SE.{" "}
          <strong className="text-ink-2">part</strong> is A or B and applies to the territory, not
          the person — &ldquo;A&rdquo;, &ldquo;a&rdquo; and &ldquo;Part A&rdquo; all read the same.
          A territory the file names but does not exist yet is created.
        </p>

        <button
          type="button"
          className="sheet-drop mt-3.5"
          onClick={() => fileRef.current?.click()}
          data-empty={!rows}
          disabled={busy}
        >
          <span className="sheet-drop-glyph">
            <FileUp size={18} />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="sheet-drop-title">{fileName || "Choose a CSV file"}</span>
            <span className="sheet-drop-sub">
              {rows ? `${rows.length} rows read` : "Exported from Excel or Google Sheets"}
            </span>
          </span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) readFile(f);
            e.target.value = "";
          }}
        />

        {parseError && (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-bad-ink">
            <AlertCircle size={15} className="mt-0.5 shrink-0" />
            <span className="text-xs font-medium">{parseError}</span>
          </div>
        )}

        {rows && (
          <>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                style={{ background: "var(--ok-soft)", color: "var(--ok-ink)" }}
              >
                {good.length} ready
              </span>
              {bad.length > 0 && (
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                  style={{ background: "var(--bad-soft)", color: "var(--bad-ink)" }}
                >
                  {bad.length} with problems
                </span>
              )}
              {newPatches.length > 0 && (
                <span
                  className="rounded-full px-2.5 py-1 font-mono text-[11px] font-bold"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                  title={newPatches.join(", ")}
                >
                  {newPatches.length} new {newPatches.length === 1 ? "patch" : "patches"}
                </span>
              )}
              {IMPORT_ROLES.map((r) => {
                const n = good.filter((g) => g.role === r).length;
                if (!n) return null;
                return (
                  <span key={r} className="font-mono text-[11px] text-ink-3">
                    {n} {ROLE_META[r].label}
                  </span>
                );
              })}
            </div>

            {/* Named before they are created, because "3 new patches" is the
                kind of number an admin should read rather than discover. */}
            {newPatches.length > 0 && (
              <p className="mt-2 text-[11.5px] leading-snug text-ink-3">
                Will be created: <strong className="text-ink-2">{newPatches.join(", ")}</strong>.
                A patch comes into being when somebody is posted to it — there is no list to
                add them to first.
              </p>
            )}

            {partClashes.length > 0 && (
              <div className="mt-3 rounded-lg border border-bad/25 bg-bad-soft px-3 py-2.5 text-[12px] text-bad-ink">
                <strong>One patch, two parts.</strong>{" "}
                {partClashes.map((c) => `"${c.name}" is given ${c.parts}`).join("; ")}. A
                territory sits in one part — fix the file and re-import. Those rows will be
                skipped; the rest still import.
              </div>
            )}

            {bad.length > 0 && (
              <ul className="mt-3 max-h-40 overflow-y-auto rounded-[var(--radius)] border border-rule">
                {bad.map((r) => (
                  <li
                    key={r.line}
                    className="flex items-baseline gap-2 border-b border-rule px-3 py-1.5 text-[12px] last:border-b-0"
                  >
                    <span className="font-mono text-[10px] text-ink-3">line {r.line}</span>
                    <span className="font-mono text-[11px] font-semibold text-ink">
                      {r.staffId || "—"}
                    </span>
                    <span className="min-w-0 flex-1" style={{ color: "var(--bad)" }}>
                      {r.error}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {/* There was a "starting password" field here, to save the admin
                telling a hundred officers a hundred different secrets. It is
                gone because the problem is: each person signs in with the
                Staff ID already on their row, which the file had to carry
                anyway. */}
          </>
        )}

        <div className="mt-5 flex gap-2.5">
          <button className="btn btn-ghost flex-1" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary flex-1"
            onClick={submit}
            disabled={busy || !good.length}
            title={!good.length ? "Choose a file with at least one valid row" : undefined}
          >
            {busy ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <>
                <Upload size={15} /> Import {good.length || ""}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
