"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Wrench,
  ClipboardList,
  Hourglass,
  CheckCircle2,
  RotateCcw,
  FileEdit,
  Bell,
  ChevronRight,
  Timer,
  MapPin,
  BarChart3,
  PackageCheck,
  type LucideIcon,
} from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { CountUp } from "@/components/ui/CountUp";
import { AroSearch, AroTabs } from "@/components/aro/AroList";
import { RepairProgress } from "@/components/engineer/RepairProgress";
import { STATUS_META } from "@/lib/status";
import { taka } from "@/lib/format";
import { vehicleTitle, vehicleMake } from "@/lib/vehicle";
import { AccountTitle } from "@/components/ui/AccountTitle";
import { EngineerScorecard } from "@/components/scorecard/EngineerScorecard";
import type {
  Bucket,
  EngineerMetrics,
  WorkbenchVehicle,
} from "@/lib/engineer";
import type { EngineerScorecard as ScorecardData } from "@/lib/scorecard";

/**
 * The bench is four queues plus one record.
 *
 * "My month" is deliberately last and deliberately in the same strip rather
 * than in a separate screen: an engineer should be able to look at how the
 * month is going without leaving the place they do the work, and a performance
 * view you have to go and find is a performance view nobody sees.
 */
type Section = Bucket | "month";

// One word per segment. "Under review" alone was 86px of a 343px rail and
// pushed the fifth bucket off the edge; the segment is the bucket, so the
// label does not have to be a sentence. `aria` keeps the full wording for
// anyone who cannot see which column they are in.
const TABS: { key: Section; label: string; aria: string; icon: LucideIcon; tone: string }[] = [
  { key: "assess", label: "Assess", aria: "To assess", icon: Wrench, tone: "var(--cat-assess)" },
  { key: "review", label: "Review", aria: "Under review", icon: Hourglass, tone: "var(--cat-review)" },
  { key: "repair", label: "Repair", aria: "In repair", icon: Timer, tone: "var(--cat-repair)" },
  { key: "cleared", label: "Cleared", aria: "Cleared", icon: CheckCircle2, tone: "var(--cat-cleared)" },
  { key: "month", label: "Month", aria: "My month", icon: BarChart3, tone: "var(--cat-bench)" },
];

/**
 * The Service Engineer's portal.
 *
 * Built to the same standard as the field team's pipeline: bucketed tabs,
 * a metric rail, search, and cards dense enough to decide from without
 * opening the record.
 *
 * The three additions that matter are all things the previous inbox could not
 * express — a rework carries the Service Manager's reason on the card, a started
 * assessment shows how far along it is, and a vehicle in repair shows the
 * deadline it is being repaired against.
 */
export function EngineerWorkbench({
  vehicles,
  metrics,
  firstName,
  scorecard,
}: {
  vehicles: WorkbenchVehicle[];
  metrics: EngineerMetrics;
  firstName: string;
  /** The engineer's own monthly record, for the "My month" section. */
  scorecard: ScorecardData;
}) {
  const [tab, setTab] = useState<Section>("assess");
  const [search, setSearch] = useState("");

  const buckets = useMemo(() => {
    const b: Record<Bucket, WorkbenchVehicle[]> = {
      assess: [],
      review: [],
      repair: [],
      cleared: [],
    };
    for (const v of vehicles) b[v.bucket].push(v);
    // Reworks first, then anything already started, then oldest first — the
    // order an engineer would actually work through the bench.
    b.assess.sort(
      (x, y) =>
        Number(y.isRework) - Number(x.isRework) ||
        Number(y.hasDraft) - Number(x.hasDraft) ||
        y.age - x.age,
    );
    // Soonest deadline first; a missed one is the most urgent of all. An
    // as-is file needs nothing, so it sinks below everything that does.
    b.repair.sort(
      (x, y) =>
        Number(x.asIs) - Number(y.asIs) ||
        (x.daysToDeadline ?? 999) - (y.daysToDeadline ?? 999),
    );
    return b;
  }, [vehicles]);

  const onMonth = tab === "month";

  const list = useMemo(() => {
    const raw = tab === "month" ? [] : buckets[tab];
    const q = search.trim().toLowerCase();
    if (!q) return raw;
    return raw.filter(
      (v) =>
        v.registrationNo.toLowerCase().includes(q) ||
        (v.make ?? "").toLowerCase().includes(q) ||
        (v.model ?? "").toLowerCase().includes(q) ||
        (v.territory?.name ?? "").toLowerCase().includes(q),
    );
  }, [buckets, tab, search]);

  const total = vehicles.length;

  // Rendered client-side only via suppressHydrationWarning: the server and the
  // phone can sit on different sides of midnight, and a date that flips on
  // hydration is worse than one that arrives a frame late.
  // The date tile's three parts, matching the officer's panel. Client-side
  // only: the server and the phone can sit on different sides of midnight, and
  // a date that flips on hydration is worse than one arriving a frame late.
  const today = useMemo(() => {
    const d = new Date();
    const p = (o: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", o);
    return {
      dow: p({ weekday: "short" }).toUpperCase(),
      day: p({ day: "numeric" }),
      mon: p({ month: "short" }).toUpperCase(),
    };
  }, []);

  // The bench, as one figure. Assess + review + repair is what the engineer is
  // actually holding; cleared has left their hands and is counted apart, on the
  // same rule the officer's panel uses for resale stock.
  const inHand = buckets.assess.length + buckets.review.length + buckets.repair.length;

  // The oldest file still in hand. The headline says how many; this says how
  // long, which is the question a Service Manager asks about the first — and
  // nothing else on this screen carries it, because every bucket here is
  // sorted by what is due next.
  const longest = useMemo(() => {
    const held: { v: WorkbenchVehicle; to: Bucket }[] = [
      ...buckets.assess.map((v) => ({ v, to: "assess" as Bucket })),
      ...buckets.review.map((v) => ({ v, to: "review" as Bucket })),
      ...buckets.repair.map((v) => ({ v, to: "repair" as Bucket })),
    ];
    return held.sort((a, b) => b.v.age - a.v.age)[0] ?? null;
  }, [buckets]);

  return (
    <div className="aro-page min-h-screen">
      <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-4">
        {/* ================= Greeting =================
            The same header as the officer's panel: greeting left, date right,
            on one baseline. It used to live INSIDE the slab, which spent the
            one block on this screen that can carry figures on a salutation. */}
        <header className="aro-greet">
          <div className="aro-greet-line">
            <span className="aro-greet-eyebrow">{greeting()},</span>
            <h1 className="aro-greet-name">{firstName}</h1>
          </div>
          <time className="aro-datetile" suppressHydrationWarning>
            <span className="aro-datetile-dow">{today.dow}</span>
            <span className="aro-datetile-day">{today.day}</span>
            <span className="aro-datetile-mon">{today.mon}</span>
          </time>
        </header>

        {/* ================= The bench, in one block =================
            The officer's summary slab, doing the same job for the workshop:
            what is in hand, how long the oldest of it has been, and the split
            across the three stages of work.

            NO INSTRUMENT ILLUSTRATION. A gauge used to sit in the corner of
            this panel, and its job was to fill a slab that carried a greeting
            and no numbers. The slab carries numbers now, so it needs nothing
            drawn on it — the same trade the officer's tyre-track watermark
            made. */}
        <section className="aro-slab mt-2.5 p-3.5">
          <div className="aro-slab-head">
            <div className="min-w-0">
              <div className="aro-slab-eyebrow">
                <span className="aro-slab-mark" aria-hidden="true">
                  <Wrench size={11} strokeWidth={2.4} />
                </span>
                <span className="aro-slab-label">On the bench</span>
                <span className="aro-radar" aria-hidden="true">
                  <span className="aro-radar-ring" />
                  <span className="aro-radar-ring" />
                  <span className="aro-radar-dot" />
                </span>
              </div>
              <div className="aro-slab-figure">
                <CountUp value={inHand} />
              </div>
            </div>

            {/* A button rather than a link: every destination on this screen is
                a bucket in the strip below, not another page. */}
            {longest && (
              <button
                type="button"
                onClick={() => setTab(longest.to)}
                className="aro-slab-aside aro-press"
              >
                <span className="aro-slab-aside-label">
                  Longest on bench
                  <ChevronRight size={11} className="aro-slab-aside-chev" />
                </span>
                <span className="aro-slab-aside-figure">
                  <CountUp value={longest.v.age} />
                  <span className="aro-slab-aside-unit">d</span>
                </span>
                <span className="aro-slab-aside-reg">{longest.v.registrationNo}</span>
              </button>
            )}
          </div>

          {inHand > 0 && (
            <div
              className="aro-scale"
              role="img"
              aria-label={`${buckets.assess.length} to assess, ${buckets.review.length} under review, ${buckets.repair.length} in repair`}
            >
              {/* Rendered only when the bucket has something in it. The
                  segment carries a `min-width` so a thin sliver stays visible,
                  which on an EMPTY bucket drew a stub of a category that is not
                  there — the officer's panel has the same rule and had not yet
                  met a zero to prove it. */}
              {buckets.assess.length > 0 && (
                <span className="aro-scale-seg aro-scale-1" style={{ flexGrow: buckets.assess.length }} />
              )}
              {buckets.review.length > 0 && (
                <span className="aro-scale-seg aro-scale-2" style={{ flexGrow: buckets.review.length }} />
              )}
              {buckets.repair.length > 0 && (
                <span className="aro-scale-seg aro-scale-3" style={{ flexGrow: buckets.repair.length }} />
              )}
            </div>
          )}

          <div className="mt-2.5 grid grid-cols-4 gap-2.5 border-t border-white/10 pt-3">
            <BenchCell value={buckets.assess.length} label="Assess" />
            <BenchCell value={buckets.review.length} label="Review" />
            <BenchCell value={buckets.repair.length} label="Repair" />
            <BenchCell value={buckets.cleared.length} label="Cleared" apart />
          </div>

          {/* What the bench is worth, which is the one figure on this panel a
              Service Manager will ask about and the engineer had nowhere to
              read. */}
          <p className="aro-slab-note">
            <PackageCheck size={11} className="shrink-0" />
            {taka(metrics.valueOnBench)} on the bench at current estimate.
          </p>
        </section>

        {/* ================= Needs your attention =================
            Was a single scrolling row of coloured counts. It is now the
            officer's inset-grouped list: one card, hairline-divided rows, the
            whole row a target, and the count as a tinted pill. The row can say
            what is wrong AND what to do about it, which a chip reading
            "1 parts" could not. */}
        <AttentionGroup metrics={metrics} onJump={setTab} />

        <AroTabs
          tabs={TABS.map((t) => ({
            key: t.key,
            label: t.label,
            // "My month" is a record, not a queue — see AroTab.count.
            count: t.key === "month" ? undefined : buckets[t.key as Bucket].length,
          }))}
          value={tab}
          onChange={(k) => setTab(k as Section)}
        />

        {total > 5 && !onMonth && <AroSearch value={search} onChange={setSearch} />}

        {/* ---- Body ----
            Four of the five sections are the same queue rendered from a
            different bucket. The fifth is the engineer's own record, which is
            not a queue at all — so it replaces the list rather than sitting
            under it. */}
        {tab === "month" ? (
          <div className="mt-3.5">
            <EngineerScorecard initial={scorecard} />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {list.length === 0 ? (
              <EmptyBucket tab={tab} searching={!!search.trim()} />
            ) : (
              list.map((v, i) => <VehicleCard key={v.id} v={v} index={i} />)
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** One figure inside the bench block. The officer's `Cell`, for this panel. */
function BenchCell({
  value,
  label,
  apart,
}: {
  value: number;
  label: string;
  /** Cleared work: it has left the bench, and must not add up with the rest. */
  apart?: boolean;
}) {
  return (
    <div className={`aro-cell ${apart ? "aro-cell--apart" : ""}`}>
      <div className="aro-cell-figure leading-none">
        <CountUp value={value} />
      </div>
      <div className="aro-cell-label break-words">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * The attention line.
 *
 * One row, only rendered when something actually needs the engineer. Each
 * count is a button that jumps to the bucket the item lives in, so the line is
 * navigation rather than a notice board.
 *
 * This replaced five stacked advisory cards. Those cost roughly 200px above
 * the first vehicle and largely repeated information that was already on the
 * metric tiles and on the cards themselves: "1 sent back for rework" was also
 * a tile caption AND a red banner on the card it referred to.
 */
/**
 * What needs the engineer, as an inset-grouped list.
 *
 * Was one scrolling row of coloured counts — "3 overdue", "1 parts",
 * "2 photos" — which is a legend rather than a list. A chip has room for a
 * number and one word, so it can say what is wrong and never what to do about
 * it, and five of them in a horizontal scroller means the least urgent thing
 * is the one that falls off the end where nobody looks.
 *
 * This is the officer's list, with the same rules: one card, hairline-divided
 * rows, the whole row a target, the count as a tinted pill, and a genuinely
 * late row carrying the pulse. Each row still jumps to the bucket the work
 * lives in, so it is navigation and not a notice board.
 */
function AttentionGroup({
  metrics,
  onJump,
}: {
  metrics: EngineerMetrics;
  onJump: (b: Bucket) => void;
}) {
  const items: {
    key: string;
    icon: LucideIcon;
    label: string;
    detail: string;
    count: number;
    tone: string;
    to: Bucket;
    /** Genuinely late or genuinely refused — earns the pulse. Nothing else. */
    alert?: boolean;
  }[] = [];

  if (metrics.rework > 0)
    items.push({
      key: "rework",
      icon: RotateCcw,
      label: "Sent back for rework",
      detail: "Read the manager's reason, then resubmit",
      count: metrics.rework,
      tone: "#c42847",
      to: "assess",
      alert: true,
    });
  if (metrics.overdue > 0)
    items.push({
      key: "overdue",
      icon: Timer,
      label: "Past the repair deadline",
      detail: "Update the stage or say what is holding it",
      count: metrics.overdue,
      tone: "#c2410c",
      to: "repair",
      alert: true,
    });
  if (metrics.blocked > 0)
    items.push({
      key: "blocked",
      icon: PackageCheck,
      label: "Waiting on parts",
      detail: "Blocked until the part arrives",
      count: metrics.blocked,
      tone: "#b45309",
      to: "repair",
    });
  if (metrics.awaitingPhotos > 0)
    items.push({
      key: "photos",
      icon: Bell,
      label: "Still to photograph",
      detail: "Five post-repair shots close the job",
      count: metrics.awaitingPhotos,
      tone: "#4338ca",
      to: "repair",
    });
  if (metrics.drafts > 0)
    items.push({
      key: "drafts",
      icon: FileEdit,
      label: "Assessments started",
      detail: "Begun but not submitted",
      count: metrics.drafts,
      tone: "#0f766e",
      to: "assess",
    });

  return (
    <>
      <div className="aro-group-header">
        <span>Needs your attention</span>
        {items.length > 0 && <span className="tnum opacity-70">{items.length}</span>}
      </div>

      <div className="aro-group">
        {items.length === 0 ? (
          <div className="aro-group-row" style={{ ["--tone" as string]: "var(--ok)" }}>
            <span className="aro-glyph">
              <CheckCircle2 size={19} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="aro-group-title">All clear</div>
              <p className="aro-group-sub truncate">
                Nothing sent back, nothing late, nothing blocked.
              </p>
            </div>
          </div>
        ) : (
          items.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onJump(t.to)}
              className="aro-group-row w-full text-left"
              style={{ ["--tone" as string]: t.tone }}
            >
              <span className="aro-glyph">
                <t.icon size={19} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="aro-group-title block truncate">{t.label}</span>
                <span className="aro-group-sub block truncate">{t.detail}</span>
              </span>
              <span className={`aro-pill ${t.alert ? "aro-alert" : ""}`}>{t.count}</span>
              <ChevronRight size={15} className="shrink-0 text-ink-3 opacity-60" />
            </button>
          ))
        )}
      </div>
    </>
  );
}


/* ------------------------------------------------------------------ */

function VehicleCard({ v, index }: { v: WorkbenchVehicle; index: number }) {
  const estimate = v.repairTotal + v.transportCost + v.otherCost;
  const make = vehicleMake(v);
  // A live repair carries the progress control, and a <button> is not valid
  // inside an <a>. So that one bucket renders as a container with a linked
  // heading instead of a wholly-clickable card.
  // An as-is file is on the bench to be READ, not worked. No progress
        // control, no deadline, no photo step — it is a notice, so it goes back
        // to being a plain link like every other non-actionable card.
        const interactive = v.bucket === "repair" && !v.asIs;
  const Shell = interactive ? "div" : Link;
  const shellProps = interactive
    ? {}
    : ({ href: `/vehicles/${v.id}` } as { href: string });

  return (
    <Shell
      {...(shellProps as { href: string })}
      className={`card aura-glass block overflow-hidden p-0${interactive ? "" : " card-lift"}`}
      style={{ animation: `riseIn 0.28s var(--ease-out-quart) ${Math.min(index, 10) * 0.03}s both` }}
    >
      {/* An as-is file leads with the fact that it needs nothing. It is the
          only thing on the card worth reading, and without it an engineer sees
          a vehicle assigned to them at "repair approved" and starts work on a
          repair that was deliberately cancelled. */}
      {v.asIs && (
        <div className="asis-banner">
          <PackageCheck size={14} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="asis-banner-title">No work needed — selling as is</p>
            <p className="asis-banner-body">
              {v.asIsReason
                ? `“${v.asIsReason}”`
                : "The Service Manager released this without a repair. Nothing to do."}
            </p>
          </div>
        </div>
      )}

      {/* A rework leads with the reason it came back. Everything else on the
          card is secondary to knowing why this is on the bench again. */}
      {v.isRework && (
        <div
          className="flex items-start gap-2 px-3.5 py-2"
          style={{ background: "var(--bad-soft)" }}
        >
          <RotateCcw size={13} className="mt-0.5 shrink-0" style={{ color: "var(--bad)" }} />
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: "var(--bad)" }}>
                Sent back
              </p>
              <span className="shrink-0 rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] font-semibold text-ink-2">
                {v.age}d old
              </span>
            </div>
            {v.reworkNote && (
              <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
                &ldquo;{v.reworkNote}&rdquo;
              </p>
            )}
          </div>
        </div>
      )}

      <div className="p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {interactive ? (
              <Link
                href={`/vehicles/${v.id}`}
                className="block transition-colors hover:text-accent"
              >
                <AccountTitle record={v} as="span" className="f-item" />
              </Link>
            ) : (
              <AccountTitle record={v} className="f-item" />
            )}
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
              {v.registrationNo} · {vehicleTitle(v)}
              {make ? ` · ${make}` : ""}
            </p>
          </div>
          {v.asIs ? (
            <ChevronRight size={15} className="shrink-0 text-ink-3" />
          ) : v.bucket === "assess" ? (
            <span className="btn btn-primary btn-sm shrink-0">
              {v.hasDraft ? <FileEdit size={13} /> : <Wrench size={13} />}
              {v.hasDraft ? "Resume" : "Assess"}
            </span>
          ) : v.bucket === "cleared" ? (
            // Only this bucket spans several statuses, so only here does
            // naming the status add anything the tab has not already said.
            <div className="flex shrink-0 items-center gap-1.5">
              <Chip tone={STATUS_META[v.status].tone}>{STATUS_META[v.status].label}</Chip>
              <ChevronRight size={15} className="text-ink-3" />
            </div>
          ) : v.bucket === "review" ? (
            <ChevronRight size={15} className="shrink-0 text-ink-3" />
          ) : null}
        </div>

        {/* Facts row */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          <Fact icon={<MapPin size={11} />} text={v.territory?.name ?? "—"} />
          <Fact icon={<ClipboardList size={11} />} text={`${v.age}d old`} />
          {/* Only while the file is still theirs to assess: mid-repair, who
              captured it months ago is not information they act on. */}
          {v.capturedBy && v.bucket === "assess" && (
            <Fact icon={<Wrench size={11} />} text={v.capturedBy.name} />
          )}
        </div>

        {/* Draft progress — the reason this card is different from a new job. */}
        {v.hasDraft && (
          <div className="mt-2.5 rounded-[9px] border border-rule bg-surface-2 px-2.5 py-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                Draft in progress
              </span>
              <span className="tnum text-[12.5px] font-bold text-ink">{taka(estimate)}</span>
            </div>
            <div className="mt-1.5 flex items-center gap-3 font-mono text-[10.5px] text-ink-2">
              <span className={v.repairTotal ? "" : "opacity-50"}>
                {v.repairTotal ? "cost entered" : "no cost yet"}
              </span>
              <span className={v.sheetCount ? "" : "opacity-50"}>
                {v.sheetCount} {v.sheetCount === 1 ? "sheet" : "sheets"}
              </span>
              {/* Both are required to submit, so say which is missing. */}
              {(!v.repairTotal || !v.sheetCount) && (
                <span style={{ color: "var(--warn)" }}>
                  needs {!v.repairTotal ? "the cost" : "the estimate sheet"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Submitted estimate, once it is out of the engineer's hands.
            Label and figure on one line rather than a labelled block: the word
            "Estimate" is not worth a row of its own next to the number it
            names. */}
        {(v.bucket === "review" || v.bucket === "repair") && estimate > 0 && (
          <div className="mt-2 flex items-baseline justify-between border-t border-rule pt-2">
            <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">
              Estimate
            </span>
            <span className="tnum text-[12.5px] font-bold text-ink">{taka(estimate)}</span>
          </div>
        )}

        {/* Deadline countdown — only ever shown while a repair is live. */}
        {v.bucket === "repair" && v.daysToDeadline !== null && (
          <DeadlineBar days={v.daysToDeadline} overdue={v.overdue} />
        )}

        {/* The engineer reports where the work has got to. One tap. */}
        {interactive && (
          <RepairProgress
            vehicleId={v.id}
            stage={v.repairStage}
            blocker={v.repairBlocker}
            note={v.repairStageNote}
            at={v.repairStageAt}
            vehicleName={vehicleTitle(v)}
            handover={{
              done: v.handoverDone,
              required: v.handoverRequired,
              complete: v.handoverComplete,
            }}
            handoverPairs={v.handoverPairs}
          />
        )}
      </div>
    </Shell>
  );
}

function Fact({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="flex items-center gap-1 font-mono text-[10.5px] text-ink-3">
      <span className="text-ink-3">{icon}</span>
      <span className="truncate">{text}</span>
    </span>
  );
}

function DeadlineBar({ days, overdue }: { days: number; overdue: boolean }) {
  const colour = overdue
    ? "var(--bad)"
    : days <= 2
      ? "var(--warn)"
      : "var(--ok)";
  // A 14-day window is the visual span; anything longer simply reads as full.
  const pct = overdue ? 100 : Math.max(6, Math.min(100, ((14 - days) / 14) * 100));

  return (
    <div className="mt-2">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-3">
          Repair deadline
        </span>
        <span className="tnum text-[12px] font-bold" style={{ color: colour }}>
          {overdue
            ? `${Math.abs(days)}d overdue`
            : days === 0
              ? "due today"
              : `${days}d left`}
        </span>
      </div>
      <div className="prop-track mt-1" style={{ height: 4 }}>
        <div
          className="prop-seg"
          style={{ flexGrow: pct, background: colour, opacity: overdue ? 1 : 0.85 }}
        />
        <div className="prop-seg" style={{ flexGrow: 100 - pct }} />
      </div>
    </div>
  );
}

function EmptyBucket({ tab, searching }: { tab: Bucket; searching: boolean }) {
  const copy: Record<Bucket, { title: string; body: string }> = {
    assess: {
      title: "Nothing to assess",
      body: "New work appears here once a Credit Note is approved and the file is assigned to you.",
    },
    review: {
      title: "Nothing under review",
      body: "Assessments you submit sit here until the Service Manager approves the repair.",
    },
    repair: {
      title: "No repairs running",
      body: "Approved repairs appear here with the deadline you are working to.",
    },
    cleared: {
      title: "Nothing cleared yet",
      body: "Files move here once Registration takes them on.",
    },
  };
  const c = copy[tab];

  return (
    <div className="bench-empty" style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}>
      {/* Two inert layers: a wash that lifts from the foot of the card, and a
          soft arc across it. An empty bucket is the one state with nothing to
          read, so it is the one place a little atmosphere costs the reader
          nothing — everywhere else on this panel the surface stays out of the
          way of the figures. */}
      <span className="bench-empty-wash" aria-hidden="true" />
      <span className="bench-empty-arc" aria-hidden="true" />
      <div className="bench-empty-plate">
        <CheckCircle2 size={22} strokeWidth={1.6} />
        {/* Three specks, placed rather than scattered — they read as a mark
            around the glyph instead of as decoration sprinkled on it. */}
        <span className="bench-spark" style={{ top: -2, right: -6, ["--d" as string]: "0s" }} />
        <span className="bench-spark" style={{ bottom: 2, left: -8, ["--d" as string]: "0.9s" }} />
        <span className="bench-spark" style={{ top: 12, right: -12, ["--d" as string]: "1.7s" }} />
      </div>
      <div>
        <p className="font-display text-[15px] font-bold text-ink">
          {searching ? "No matches" : c.title}
        </p>
        <p className="mx-auto mt-1 max-w-[38ch] text-[12.5px] leading-snug text-ink-2">
          {searching ? "Nothing here matches your search." : c.body}
        </p>
      </div>
    </div>
  );
}

