/**
 * CSV, both directions.
 *
 * Writing: the admin register and the coverage board both hand a user a file.
 * Reading: the bulk user import takes one back.
 */

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * The UTF-8 byte-order mark.
 *
 * Prepended to every file we hand out, because Excel on Windows assumes the
 * system codepage without it and renders every Bengali name as mojibake.
 * Three bytes to make the export readable by the people who asked for it.
 */
export const CSV_BOM = "﻿";

/**
 * A cell Excel will read as a formula if it is handed one.
 *
 * Excel and Sheets treat a leading `=`, `+`, `-` or `@` as the start of an
 * expression, so a cell reading `=HYPERLINK("http://…","Click")` becomes a
 * live link in the recipient's spreadsheet rather than text.
 */
const FORMULA_LEAD = /^[=+\-@\t\r]/;

/** Something Excel should read as the number it is. */
const NUMERIC = /^-?\d+(\.\d+)?$/;

/**
 * One cell, quoted only when it has to be, and neutralised when it would
 * otherwise be read as a formula.
 *
 * The guard is applied to text and withheld from numbers, because the two
 * have opposite requirements. These exports carry signed money — a negative
 * margin is an ordinary reading here — and prefixing a tab to `-45000` turns
 * a figure the finance desk needs to sum into text Excel will not add up. So
 * anything that is a plain number is passed through untouched.
 *
 * Everything else is prefixed. The register was previously exempt on the
 * grounds that it is generated from our own database rather than from
 * user-supplied strings, and that is not true of it: `customerName`,
 * `customerCode`, `registrationNo`, `make` and `model` are free text typed by
 * a field officer at capture, and they all reach this file. An internal
 * audience does not change what Excel does with a leading `=`.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);

  // A number is a number: never disguised, so the sheet can still total it.
  // Signed figures reach here as `-45000`, which NUMERIC claims before the
  // formula test can, and they go out exactly as they came in.
  const neutralise = !NUMERIC.test(s) && FORMULA_LEAD.test(s);

  // The apostrophe marks the field as text. Some Excel versions consume it on
  // import and some show it in the cell — neither evaluates what follows,
  // which is the whole point, and a stray apostrophe on the rare name that
  // opens with a sign is a fair price for that. Always quoted when it fires,
  // so the marker cannot be mistaken for part of the delimiter structure.
  const body = neutralise ? `'${s}` : s;

  return neutralise || /[",\r\n]/.test(body)
    ? `"${body.replace(/"/g, '""')}"`
    : body;
}

/** A grid of rows into a CSV body. CRLF, which is what Excel expects. */
export function toCsv(rows: unknown[][]): string {
  return rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

/** Today as `YYYY-MM-DD`, for stamping a filename. */
export function stamp(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * A small CSV reader.
 *
 * Hand-rolled rather than a dependency: the whole job is one state machine
 * over a string, and the file this parses is written by an admin in Excel —
 * which means the two things it MUST get right are quoted fields (a name with
 * a comma in it) and `""` escapes inside them. Everything beyond that is
 * ceremony a spreadsheet never emits.
 *
 * Handles quoted fields, escaped quotes, CRLF or LF, a trailing newline, and
 * the byte-order mark Excel writes by default.
 */
export function parseCsv(text: string): string[][] {
  // Excel's BOM would otherwise become part of the first column's name and
  // stop `staff_id` from matching — an hour-long bug the first time.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let i = 0;

  const endField = () => {
    row.push(field);
    field = "";
  };
  const endRow = () => {
    endField();
    // A blank trailing line is an artefact of the file ending in a newline,
    // not a record of a user with no name.
    if (row.length > 1 || row[0].trim() !== "") rows.push(row);
    row = [];
  };

  while (i < src.length) {
    const c = src[i];

    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        quoted = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      quoted = true;
      i++;
      continue;
    }
    if (c === ",") {
      endField();
      i++;
      continue;
    }
    if (c === "\r") {
      // CRLF or a lone CR both end the row.
      if (src[i + 1] === "\n") i++;
      endRow();
      i++;
      continue;
    }
    if (c === "\n") {
      endRow();
      i++;
      continue;
    }
    field += c;
    i++;
  }

  // Whatever is left when the string runs out is the last record.
  if (field !== "" || row.length) endRow();
  return rows;
}

/**
 * Read a CSV into objects keyed by its header row.
 *
 * Header names are lowercased and their spaces, hyphens and underscores
 * dropped, so `Staff ID`, `staff_id` and `staffid` all reach the same key.
 * An admin should not have to match our punctuation to be understood.
 */
export function parseCsvRecords(text: string): {
  headers: string[];
  records: Record<string, string>[];
} {
  const rows = parseCsv(text);
  if (rows.length === 0) return { headers: [], records: [] };

  const raw = rows[0].map((h) => h.trim());
  const keys = raw.map((h) => h.toLowerCase().replace(/[\s\-_]+/g, ""));

  const records = rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    keys.forEach((k, n) => {
      rec[k] = (r[n] ?? "").trim();
    });
    return rec;
  });

  return { headers: raw, records };
}
