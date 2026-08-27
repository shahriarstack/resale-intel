"use client";

import type { VehicleStatus } from "@prisma/client";
import {
  Check,
  ChevronRight,
  Hourglass,
  CircleDot,
  Trophy,
  LogOut,
  ArrowRight,
} from "lucide-react";
import { buildJourney, type JourneyStep } from "@/lib/journey";

/**
 * The file's route through the eight desks: where it has been, where it is
 * sitting right now, and every desk still waiting for it.
 */
export function VehicleJourney({
  status,
  /** Days the file has been sitting at the current desk. */
  daysAtStage,
  className = "",
}: {
  status: VehicleStatus;
  daysAtStage?: number | null;
  className?: string;
}) {
  const j = buildJourney(status);

  return (
    <section className={`card overflow-hidden ${className}`}>
      {/* ---- header ---- */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule px-5 py-4">
        <h2 className="font-display text-[15px] font-bold text-ink">Journey</h2>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-3">
            <div
              className="h-full rounded-full"
              style={{
                width: `${j.isReleased ? 100 : j.progressPct}%`,
                background: j.isReleased ? "var(--bad)" : j.isComplete ? "var(--ok)" : "var(--accent)",
                transition: "width 0.6s var(--ease-out-expo)",
              }}
            />
          </div>
          <span className="font-mono text-[11px] tnum text-ink-3">
            {j.isReleased
              ? "exited"
              : `step ${j.currentIndex + 1} of ${j.total}`}
          </span>
        </div>
      </div>

      {/* ---- rail ---- */}
      <div className="overflow-x-auto px-5 py-6 no-scrollbar">
        <div className="flex min-w-[620px]">
          {j.steps.map((s, i) => (
            <RailNode
              key={s.status}
              step={s}
              index={i}
              first={i === 0}
              last={i === j.steps.length - 1}
              prevDone={i > 0 && j.steps[i - 1].state === "done"}
              dimmed={j.isReleased && i > 0}
            />
          ))}
        </div>
      </div>

      {/* ---- now / next ---- */}
      <div className="border-t border-rule bg-surface-2 p-5">
        {j.isReleased ? (
          <Banner
            tone="bad"
            icon={<LogOut size={20} />}
            title="Released to the customer"
            body="The vehicle left the pipeline before refurbishment. This is a terminal state — no desk is waiting on it."
          />
        ) : j.isComplete ? (
          <Banner
            tone="ok"
            icon={<Trophy size={20} />}
            title={j.current?.label ?? "Complete"}
            body="The vehicle has been awarded to the winning bid. Every desk has signed off and the file is closed."
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <NowCard step={j.current!} days={daysAtStage} />
            <NextCard upcoming={j.upcoming} />
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function RailNode({
  step,
  index,
  first,
  last,
  prevDone,
  dimmed,
}: {
  step: JourneyStep;
  index: number;
  first: boolean;
  last: boolean;
  prevDone: boolean;
  dimmed: boolean;
}) {
  const done = step.state === "done";
  const current = step.state === "current";

  const nodeStyle: React.CSSProperties = done
    ? { background: "var(--accent)", color: "var(--on-accent)", borderColor: "var(--accent)" }
    : current
      ? {
          background: "var(--surface)",
          color: "var(--accent)",
          borderColor: "var(--accent)",
          animation: "haloPulse 2.4s ease-in-out infinite",
        }
      : { background: "var(--surface)", color: "var(--ink-3)", borderColor: "var(--rule-strong)" };

  // The line to the left is "travelled" only when the step before it is done.
  const leftFilled = prevDone || done || current;
  const rightFilled = done;

  return (
    <div
      className="flex flex-1 flex-col items-center"
      style={{
        opacity: dimmed ? 0.35 : 1,
        animation: `fadeIn 0.3s ease ${index * 0.04}s both`,
      }}
    >
      <div className="flex w-full items-center">
        <span
          className="h-[3px] flex-1 rounded-full"
          style={{
            visibility: first ? "hidden" : "visible",
            background: leftFilled ? "var(--accent)" : "var(--rule)",
            transition: "background 0.4s ease",
          }}
        />
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 transition-[background-color,border-color,color,box-shadow] duration-200"
          style={nodeStyle}
          title={`${step.label} — ${step.heldBy === "—" ? "terminal" : step.heldBy}`}
        >
          {done ? (
            <Check size={15} strokeWidth={3} />
          ) : current ? (
            <CircleDot size={15} strokeWidth={2.5} />
          ) : (
            <span className="font-mono text-[11px] font-semibold">{index + 1}</span>
          )}
        </span>
        <span
          className="h-[3px] flex-1 rounded-full"
          style={{
            visibility: last ? "hidden" : "visible",
            background: rightFilled ? "var(--accent)" : "var(--rule)",
            transition: "background 0.4s ease",
          }}
        />
      </div>

      <span
        className="mt-2 px-1 text-center text-[11px] font-semibold leading-tight"
        style={{ color: current ? "var(--accent)" : done ? "var(--ink-2)" : "var(--ink-3)" }}
      >
        {step.label}
      </span>
      <span className="mt-0.5 px-1 text-center font-mono text-[9px] leading-tight text-ink-3">
        {step.heldBy === "—" ? "terminal" : step.heldBy}
      </span>
    </div>
  );
}

function NowCard({ step, days }: { step: JourneyStep; days?: number | null }) {
  const stale = typeof days === "number" && days >= 7;
  return (
    <div
      className="rounded-xl border bg-surface p-4"
      style={{ borderColor: "var(--accent)" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 place-items-center rounded-full"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Hourglass size={13} />
        </span>
        <span className="label" style={{ color: "var(--accent)" }}>
          Pending now
        </span>
      </div>

      <div className="mt-3 font-display text-xl font-bold leading-tight text-ink">
        {step.label}
      </div>
      <p className="mt-1 text-sm text-ink-2">
        Sitting with <span className="font-semibold text-ink">{step.heldBy}</span>
        {typeof days === "number" && (
          <>
            {" · "}
            <span
              className="font-mono text-xs font-semibold"
              style={{ color: stale ? "var(--warn)" : "var(--ink-2)" }}
            >
              {days}d at this desk
            </span>
          </>
        )}
      </p>

      {step.advanceLabel && (
        <div className="mt-3 rounded-lg bg-surface-2 px-3 py-2">
          <div className="label mb-0.5">Waiting on</div>
          <div className="text-xs font-medium text-ink-2">{step.advanceLabel}</div>
        </div>
      )}
    </div>
  );
}

function NextCard({ upcoming }: { upcoming: JourneyStep[] }) {
  const shown = upcoming.slice(0, 3);
  const rest = upcoming.length - shown.length;

  return (
    <div className="rounded-xl border border-rule bg-surface p-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-6 w-6 place-items-center rounded-full"
          style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}
        >
          <ArrowRight size={13} />
        </span>
        <span className="label">Next up</span>
      </div>

      {upcoming.length === 0 ? (
        <p className="mt-3 text-sm text-ink-2">
          Nothing queued behind this desk — the next sign-off completes the file.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {shown.map((s, i) => (
            <li key={s.status} className="flex items-center gap-2.5">
              <span
                className="grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold"
                style={
                  i === 0
                    ? { background: "var(--accent-soft)", color: "var(--accent)" }
                    : { background: "var(--surface-3)", color: "var(--ink-3)" }
                }
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <div
                  className="text-sm font-medium leading-tight"
                  style={{ color: i === 0 ? "var(--ink)" : "var(--ink-2)" }}
                >
                  {s.heldBy === "—" ? s.label : s.heldBy}
                </div>
                <div className="font-mono text-[10px] leading-tight text-ink-3">{s.label}</div>
              </div>
              {i === 0 && (
                <ChevronRight size={13} className="ml-auto shrink-0 text-accent" />
              )}
            </li>
          ))}
        </ol>
      )}

      {rest > 0 && (
        <div className="mt-2.5 border-t border-rule pt-2 font-mono text-[10px] text-ink-3">
          + {rest} more before it goes live
        </div>
      )}
    </div>
  );
}

function Banner({
  tone,
  icon,
  title,
  body,
}: {
  tone: "ok" | "bad";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const color = tone === "ok" ? "var(--ok)" : "var(--bad)";
  const soft = tone === "ok" ? "var(--ok-soft)" : "var(--bad-soft)";
  return (
    <div className="flex items-start gap-3.5">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{ background: soft, color }}
      >
        {icon}
      </span>
      <div>
        <div className="font-display text-lg font-bold" style={{ color }}>
          {title}
        </div>
        <p className="mt-0.5 max-w-prose text-sm text-ink-2">{body}</p>
      </div>
    </div>
  );
}
