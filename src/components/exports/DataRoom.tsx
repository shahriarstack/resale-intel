"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Role } from "@prisma/client";
import { Check, Download, Loader2, Lock, MapPin } from "lucide-react";
import { getJSON } from "@/lib/http";
import { useToast } from "@/components/ui/Toast";
import { roleLabel } from "@/lib/rbac";
import {
  BAND_LABEL,
  BAND_NOTE,
  BAND_ORDER,
  DATASETS,
  DATASET_ORDER,
  type DatasetKey,
} from "@/lib/exports";

/**
 * The data room.
 *
 * Two halves and one rule: nobody should have to open a CSV to find out whether
 * it was the right one. The left half picks a category and narrows it; the
 * right half is the MANIFEST — the live row count, the columns that will be in
 * the file, the columns this desk is not given, the first three rows, and the
 * name the file will be saved under. Every one of those is answered by the
 * server for the exact filters on screen, so the manifest and the download
 * cannot disagree.
 *
 * The count is debounced rather than fetched on every keystroke, because it is
 * a real query — the off-road category is three queries merged — and a count
 * that lags the filter by a moment is better than one that is cheap and wrong.
 */

interface Territory {
  id: string;
  name: string;
}

interface Manifest {
  rows: number;
  columns: string[];
  withheld: string[];
  sample: string[][];
  filename: string;
  dateLabel: string;
}

export function DataRoom({
  role,
  territories,
  seesResaleMoney,
}: {
  role: Role;
  territories: Territory[];
  seesResaleMoney: boolean;
}) {
  const { toast } = useToast();
  const [dataset, setDataset] = useState<DatasetKey>("OFFROAD_ALL");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [territoryId, setTerritoryId] = useState("");

  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [counting, setCounting] = useState(true);
  const [error, setError] = useState("");

  const query = useMemo(() => {
    const p = new URLSearchParams({ dataset });
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    if (territoryId) p.set("territory", territoryId);
    return p.toString();
  }, [dataset, from, to, territoryId]);

  const load = useCallback(() => {
    setCounting(true);
    setError("");
    getJSON<Manifest>(`/api/exports/preview?${query}`)
      .then(setManifest)
      .catch((e) => {
        setManifest(null);
        setError((e as Error).message);
      })
      .finally(() => setCounting(false));
  }, [query]);

  // Debounced: typing into a date field would otherwise fire a full query per
  // keystroke, and a half-typed year is a range nobody meant.
  useEffect(() => {
    const t = setTimeout(load, 280);
    return () => clearTimeout(t);
  }, [load]);

  const meta = DATASETS[dataset];
  const empty = manifest !== null && manifest.rows === 0;
  const anyFilter = from !== "" || to !== "" || territoryId !== "";

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-7 lg:px-8">
      <header className="mb-6">
        <div className="eyebrow text-accent">Data</div>
        <h1 className="page-title mt-1 text-[28px]">Data room</h1>
        <p className="mt-1.5 max-w-3xl text-[14px] text-ink-2">
          Raw CSV, by category. Pick what you need, narrow it if you want to, and read what the
          file will contain before you take it — the row count, the columns, and the first few
          rows are all the real thing, not an estimate.
        </p>
      </header>

      <div className="dr-layout">
        {/* ---- Pick a category ---- */}
        <div className="dr-pick">
          {BAND_ORDER.map((band) => {
            const keys = DATASET_ORDER.filter((k) => DATASETS[k].band === band);
            return (
              <section key={band} className="dr-band">
                <header className="dr-band-head">
                  <h2 className="dr-band-title">{BAND_LABEL[band]}</h2>
                  <p className="dr-band-note">{BAND_NOTE[band]}</p>
                </header>
                <div className="dr-sets">
                  {keys.map((k) => {
                    const d = DATASETS[k];
                    const Icon = d.icon;
                    const on = dataset === k;
                    return (
                      <button
                        key={k}
                        className="dr-set"
                        data-on={on}
                        onClick={() => setDataset(k)}
                      >
                        <span className="dr-set-glyph">
                          <Icon size={15} strokeWidth={2} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="dr-set-name">{d.label}</span>
                          <span className="dr-set-q">{d.question}</span>
                          {/* What it counts, and what it leaves out. Only on the
                              selected one: shown on all eleven it is a wall of
                              text, and this is the moment it is actually
                              being decided. */}
                          {on && <span className="dr-set-counts">{d.counts}</span>}
                        </span>
                        <span className="dr-tick">{on && <Check size={13} strokeWidth={3} />}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>

        {/* ---- The manifest ---- */}
        <aside className="dr-manifest">
          <div className="dr-count-block">
            <div className="dr-count">
              {counting ? (
                <Loader2 size={22} className="animate-spin text-ink-3" />
              ) : error ? (
                <span className="dr-count-bad">—</span>
              ) : (
                (manifest?.rows ?? 0).toLocaleString()
              )}
            </div>
            <div className="dr-count-label">
              {error ? error : `row${manifest?.rows === 1 ? "" : "s"} · ${manifest?.columns.length ?? 0} columns`}
            </div>
          </div>

          {/* ---- Narrow it ---- */}
          <div className="dr-filters">
            <label className="dr-filter">
              <span className="dr-filter-label">{meta.dateLabel} from</span>
              <input
                className="field"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="dr-filter">
              <span className="dr-filter-label">to</span>
              <input
                className="field"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label className="dr-filter dr-filter-wide">
              <span className="dr-filter-label">
                <MapPin size={11} /> Territory
              </span>
              <select
                className="field"
                value={territoryId}
                onChange={(e) => setTerritoryId(e.target.value)}
              >
                <option value="">Every territory</option>
                {territories.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            {anyFilter && (
              <button
                className="dr-clear"
                onClick={() => {
                  setFrom("");
                  setTo("");
                  setTerritoryId("");
                }}
              >
                Clear filters
              </button>
            )}
          </div>

          {/* ---- What is in it ---- */}
          {manifest && (
            <>
              <div className="dr-cols">
                <div className="dr-cols-head">Columns</div>
                <div className="dr-chips">
                  {manifest.columns.map((c) => (
                    <span key={c} className="dr-chip">
                      {c}
                    </span>
                  ))}
                </div>
                {manifest.withheld.length > 0 && (
                  <>
                    {/* Named, not hidden. A reader told the margin column is not
                        theirs asks for it; one handed a file quietly missing it
                        reads the absence as a zero. */}
                    <div className="dr-withheld-head">
                      <Lock size={11} />
                      Not included for {roleLabel(role)}
                    </div>
                    <div className="dr-chips">
                      {manifest.withheld.map((c) => (
                        <span key={c} className="dr-chip dr-chip-off">
                          {c}
                        </span>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {manifest.sample.length > 0 && (
                <div className="dr-sample">
                  <div className="dr-cols-head">First rows</div>
                  <div className="dr-sample-scroll">
                    <table className="dr-sample-table">
                      <thead>
                        <tr>
                          {manifest.columns.slice(0, 6).map((c) => (
                            <th key={c}>{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {manifest.sample.map((r, i) => (
                          <tr key={i}>
                            {r.slice(0, 6).map((cell, j) => (
                              <td key={j}>{cell || "—"}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {manifest.columns.length > 6 && (
                    <p className="dr-sample-note">
                      Showing 6 of {manifest.columns.length} columns. The file has them all.
                    </p>
                  )}
                </div>
              )}
            </>
          )}

          {/* ---- Take it ----
              A plain link, not a fetch. The browser's own navigation is what
              saves a file; an XHR would land the CSV in memory with nowhere to
              put it. */}
          <a
            className="btn btn-primary w-full justify-center"
            href={`/api/exports?${query}`}
            aria-disabled={empty || counting}
            onClick={(e) => {
              if (empty || counting) {
                e.preventDefault();
                toast(
                  empty ? "Nothing matches those filters" : "Still counting — one moment",
                  "neutral",
                );
              }
            }}
          >
            <Download size={16} />
            {empty ? "Nothing to download" : "Download CSV"}
          </a>

          {manifest && !empty && <p className="dr-filename">{manifest.filename}</p>}

          {!seesResaleMoney && (
            <p className="dr-desk-note">
              Cost basis, approved price, margin and offer amounts are not included in your
              exports. Your desk rules on the Credit Note; what a vehicle later cost to refurbish
              and what it fetched belong to the resale chain.
            </p>
          )}
        </aside>
      </div>
    </div>
  );
}
