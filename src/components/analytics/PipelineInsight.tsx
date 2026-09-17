import { TrendingUp, Timer, AlertOctagon, Activity } from "lucide-react";
import type { PipelineInsight as Insight, StageLoad } from "@/lib/analytics";

/**
 * Pipeline insight for the oversight roles.
 *
 * Four readings, each answering a question someone actually asks: where is
 * the work sitting, which desk is slowest, how fast are files clearing, and
 * how many reached resale recently. Deliberately not a chart library — the
 * shapes here are simple enough that inline SVG and a flex rail carry them,
 * and that keeps the bundle and the theming under our own control.
 */
export function PipelineInsight({ data }: { data: Insight }) {
  const { stages, throughput, medianCycleDays, cycleSample, bottleneck, totalInFlight } = data;
  const occupied = stages.filter((s) => s.count > 0);
  const peak = Math.max(1, ...throughput.map((t) => t.count));
  const shipped = throughput.reduce((s, t) => s + t.count, 0);

  return (
    <section className="mt-5">
      <div className="flex items-baseline justify-between">
        <h2 className="eyebrow">Pipeline insight</h2>
        <span className="font-mono text-[10.5px] text-ink-3">
          {totalInFlight} in flight
        </span>
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 lg:grid-cols-3">
        {/* ---- Where the work is sitting ---- */}
        <div className="rounded-[var(--radius-lg)] border border-rule bg-surface p-5 transition-transform duration-300 hover:scale-[0.995] lg:col-span-2">
          <div className="flex items-center gap-2">
            <Activity size={16} className="text-accent" />
            <h3 className="font-display text-[16px] font-bold text-ink">Where the work is sitting</h3>
          </div>

          {occupied.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-2">
              No files are in flight. Every record has been released, sold or is live.
            </p>
          ) : (
            <>
              <div className="prop-track mt-4 h-2.5 overflow-hidden rounded-sm bg-surface-2 shadow-inner">
                {occupied.map((s, i) => (
                  <div
                    key={s.status}
                    className="h-full border-r border-surface/20 last:border-0"
                    style={{
                      flexGrow: s.count,
                      background: `color-mix(in srgb, var(--accent) ${88 - i * 9}%, var(--surface))`,
                    }}
                    title={`${s.label}: ${s.count}`}
                  />
                ))}
              </div>

              <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5">
                {occupied.map((s, i) => (
                  <li key={s.status} className="flex items-center gap-3 rounded-md px-2 py-1 transition-colors hover:bg-surface-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{
                        background: `color-mix(in srgb, var(--accent) ${88 - i * 9}%, var(--surface))`,
                        boxShadow: `0 0 8px color-mix(in srgb, var(--accent) ${88 - i * 9}%, transparent 50%)`
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-ink-2">
                      {s.label}
                    </span>
                    <span className="tnum font-mono text-[12.5px] font-bold text-ink">{s.count}</span>
                    <span className="tnum w-14 text-right font-mono text-[10px] uppercase tracking-wider text-ink-3">
                      {s.avgDwell}d avg
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* ---- Slowest desk ---- */}
        <BottleneckCard stage={bottleneck} />

        {/* ---- Clearing speed ---- */}
        <div className="rounded-[var(--radius-lg)] border border-rule bg-surface p-5 transition-transform duration-300 hover:scale-[0.995]">
          <div className="flex items-center gap-2">
            <Timer size={14} className="text-ink-3" />
            <h3 className="text-[13px] font-semibold text-ink">Capture to live</h3>
          </div>
          {medianCycleDays == null ? (
            <p className="mt-3 text-[13px] text-ink-2">
              No file has been pushed live yet, so there is nothing to time. This
              fills in the first time a vehicle completes the chain.
            </p>
          ) : (
            <>
              <div className="mt-2 font-display text-[32px] font-bold leading-none tnum text-ink">
                {medianCycleDays}
                <span className="ml-1 font-mono text-[13px] font-medium text-ink-3">
                  {medianCycleDays === 1 ? "day" : "days"}
                </span>
              </div>
              <p className="mt-1.5 text-[12px] text-ink-2">
                Median across {cycleSample} completed{" "}
                {cycleSample === 1 ? "file" : "files"}.
              </p>
            </>
          )}
        </div>

        {/* ---- Throughput ---- */}
        <div className="rounded-[var(--radius-lg)] border border-rule bg-surface p-5 transition-transform duration-300 hover:scale-[0.995] lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={16} className="text-accent" />
              <h3 className="font-display text-[16px] font-bold text-ink">Pushed live, by week</h3>
            </div>
            <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
              {shipped === 0 ? "none" : shipped} in {throughput.length} weeks
            </span>
          </div>

          <div className="spark mt-5 flex h-[72px] items-end gap-1.5">
            {throughput.map((t) => (
              <div
                key={t.weekOf.toISOString()}
                className="group/bar flex flex-1 flex-col items-center justify-end gap-1"
                title={`Week of ${t.label}: ${t.count}`}
              >
                <span className="tnum font-mono text-[10px] text-ink-3 opacity-0 transition-opacity group-hover/bar:opacity-100">
                  {t.count}
                </span>
                <div
                  className="w-full rounded-[2px]"
                  style={{
                    height: `${t.count === 0 ? 3 : Math.max(6, (t.count / peak) * 52)}px`,
                    background: t.count > 0 ? "var(--accent)" : "var(--surface-3)",
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9.5px] uppercase text-ink-3">
            <span>{throughput[0]?.label}</span>
            <span>{throughput[throughput.length - 1]?.label}</span>
          </div>
        </div>
      </div>
    </section>
  );
}

function BottleneckCard({ stage }: { stage: StageLoad | null }) {
  const severe = (stage?.avgDwell ?? 0) >= 7;
  return (
    <div className="rounded-[var(--radius-lg)] border border-rule bg-surface p-5 transition-transform duration-300 hover:scale-[0.995]">
      <div className="flex items-center gap-2">
        <AlertOctagon size={16} className={severe ? "text-warn" : "text-accent"} />
        <h3 className="font-display text-[16px] font-bold text-ink">Slowest desk</h3>
      </div>
      {!stage ? (
        <p className="mt-3 text-[13px] text-ink-2">Nothing is waiting anywhere.</p>
      ) : (
        <>
          <div className="mt-4 font-mono text-[12px] font-bold uppercase tracking-wider text-ink">
            {stage.label}
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span
              className="tnum font-display text-[32px] font-bold leading-none"
              style={{ color: severe ? "var(--warn)" : "var(--ink)" }}
            >
              {stage.avgDwell}
            </span>
            <span className="font-mono text-[11px] uppercase tracking-wider text-ink-3">
              {stage.avgDwell === 1 ? "day" : "days"} avg
            </span>
          </div>
          <p className="mt-1.5 text-[11px] font-medium text-ink-2">
            <span className="text-ink">{stage.count}</span> {stage.count === 1 ? "file" : "files"} waiting · longest{" "}
            <span className="text-ink">{stage.maxDwell}d</span>
          </p>
        </>
      )}
    </div>
  );
}
