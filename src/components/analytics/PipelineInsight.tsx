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
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-ink-3" />
            <h3 className="text-[13px] font-semibold text-ink">Where the work is sitting</h3>
          </div>

          {occupied.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-2">
              No files are in flight. Every record has been released, sold or is live.
            </p>
          ) : (
            <>
              <div className="prop-track mt-3">
                {occupied.map((s, i) => (
                  <div
                    key={s.status}
                    className="prop-seg"
                    style={{
                      flexGrow: s.count,
                      // One hue, stepped by depth in the pipeline, so the rail
                      // reads as a single flow rather than a set of categories.
                      background: `color-mix(in srgb, var(--accent) ${88 - i * 9}%, var(--surface))`,
                    }}
                    title={`${s.label}: ${s.count}`}
                  />
                ))}
              </div>

              <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                {occupied.map((s, i) => (
                  <li key={s.status} className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 shrink-0 rounded-[3px]"
                      style={{
                        background: `color-mix(in srgb, var(--accent) ${88 - i * 9}%, var(--surface))`,
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[12.5px] text-ink-2">
                      {s.label}
                    </span>
                    <span className="tnum text-[12.5px] font-semibold text-ink">{s.count}</span>
                    <span className="tnum w-12 text-right font-mono text-[10.5px] text-ink-3">
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
        <div className="card p-4">
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
        <div className="card p-4 lg:col-span-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUp size={14} className="text-ink-3" />
              <h3 className="text-[13px] font-semibold text-ink">Pushed live, by week</h3>
            </div>
            <span className="font-mono text-[10.5px] text-ink-3">
              {shipped === 0 ? "none" : shipped} in {throughput.length} weeks
            </span>
          </div>

          <div className="spark mt-3 flex h-[72px] items-end gap-1.5">
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
                  className="spark-bar w-full"
                  data-on={t.count > 0}
                  style={{
                    // A visible stub at zero so the week still reads as a
                    // column that happened to ship nothing.
                    height: `${t.count === 0 ? 3 : Math.max(6, (t.count / peak) * 52)}px`,
                  }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9.5px] text-ink-3">
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
    <div className="card p-4">
      <div className="flex items-center gap-2">
        <AlertOctagon size={14} className={severe ? "text-warn" : "text-ink-3"} />
        <h3 className="text-[13px] font-semibold text-ink">Slowest desk</h3>
      </div>
      {!stage ? (
        <p className="mt-3 text-[13px] text-ink-2">Nothing is waiting anywhere.</p>
      ) : (
        <>
          <div className="mt-2 font-display text-[19px] font-bold leading-tight text-ink">
            {stage.label}
          </div>
          <div className="mt-2 flex items-baseline gap-1.5">
            <span
              className="tnum font-display text-[26px] font-bold leading-none"
              style={{ color: severe ? "var(--warn)" : "var(--ink)" }}
            >
              {stage.avgDwell}
            </span>
            <span className="font-mono text-[11px] text-ink-3">
              {stage.avgDwell === 1 ? "day" : "days"} average
            </span>
          </div>
          <p className="mt-1.5 text-[12px] text-ink-2">
            {stage.count} {stage.count === 1 ? "file" : "files"} waiting · longest{" "}
            {stage.maxDwell}d
          </p>
        </>
      )}
    </div>
  );
}
