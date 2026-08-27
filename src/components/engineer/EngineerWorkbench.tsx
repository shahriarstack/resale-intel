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
  AlertTriangle,
  Search,
  ChevronRight,
  Timer,
  MapPin,
  TrendingDown,
  TrendingUp,
  Target,
  Layers,
  type LucideIcon,
} from "lucide-react";
import { Chip } from "@/components/ui/Chip";
import { StatTile } from "@/components/ui/StatTile";
import { STATUS_META } from "@/lib/status";
import { taka, takaCompact } from "@/lib/format";
import { vehicleTitle, vehicleMake } from "@/lib/vehicle";
import type {
  Bucket,
  EngineerMetrics,
  WorkbenchVehicle,
} from "@/lib/engineer";

const TABS: { key: Bucket; label: string; icon: LucideIcon }[] = [
  { key: "assess", label: "To assess", icon: Wrench },
  { key: "review", label: "Under review", icon: Hourglass },
  { key: "repair", label: "In repair", icon: Timer },
  { key: "cleared", label: "Cleared", icon: CheckCircle2 },
];

/**
 * The Service Engineer's portal.
 *
 * Built to the same standard as the field team's pipeline: bucketed tabs,
 * a metric rail, search, and cards dense enough to decide from without
 * opening the record.
 *
 * The three additions that matter are all things the previous inbox could not
 * express — a rework carries the Service Head's reason on the card, a started
 * assessment shows how far along it is, and a vehicle in repair shows the
 * deadline it is being repaired against.
 */
export function EngineerWorkbench({
  vehicles,
  metrics,
  firstName,
}: {
  vehicles: WorkbenchVehicle[];
  metrics: EngineerMetrics;
  firstName: string;
}) {
  const [tab, setTab] = useState<Bucket>("assess");
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
    // Soonest deadline first; a missed one is the most urgent of all.
    b.repair.sort((x, y) => (x.daysToDeadline ?? 999) - (y.daysToDeadline ?? 999));
    return b;
  }, [vehicles]);

  const list = useMemo(() => {
    const raw = buckets[tab];
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

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 sm:px-5">
      {/* ---- Header ---- */}
      <header className="mb-4">
        <div className="eyebrow text-accent">Service engineering</div>
        <h1 className="page-title mt-1 text-[27px]">
          {metrics.awaiting > 0
            ? `${metrics.awaiting} to assess, ${firstName}.`
            : `Bench is clear, ${firstName}.`}
        </h1>
        <p className="mt-1 text-[13px] text-ink-2">
          {metrics.inRepair > 0
            ? `${metrics.inRepair} in repair · ${takaCompact(metrics.valueOnBench)} on the bench`
            : `${takaCompact(metrics.valueOnBench)} on the bench`}
        </p>
        <div className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface-2 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest">
          <span className="text-ink-3">Bench Health:</span>
          {metrics.overdue > 0 ? (
            <span className="font-bold text-bad">Needs Attention ({metrics.overdue} overdue)</span>
          ) : metrics.rework > 0 ? (
            <span className="font-bold text-warn">Rework Pending</span>
          ) : (
            <span className="font-bold text-ok">Excellent</span>
          )}
        </div>
      </header>

      {/* ---- Metric rail ---- */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatTile
          icon={<Wrench size={17} />}
          tint="accent"
          label="To assess"
          value={metrics.awaiting}
          caption={
            metrics.rework > 0
              ? `${metrics.rework} sent back`
              : metrics.drafts > 0
                ? `${metrics.drafts} started`
                : "new work"
          }
          onClick={() => setTab("assess")}
          active={tab === "assess"}
        />
        <StatTile
          icon={<Hourglass size={17} />}
          tint="neutral"
          label="Under review"
          value={metrics.underReview}
          caption="with Service Head"
          onClick={() => setTab("review")}
          active={tab === "review"}
        />
        <StatTile
          icon={<Timer size={17} />}
          tint={metrics.overdue > 0 ? "bad" : "info"}
          label="In repair"
          value={metrics.inRepair}
          caption={
            metrics.overdue > 0
              ? `${metrics.overdue} past deadline`
              : "within deadline"
          }
          onClick={() => setTab("repair")}
          active={tab === "repair"}
        />
        <StatTile
          icon={<Layers size={17} />}
          tint="neutral"
          label="On the bench"
          value={metrics.valueOnBench}
          display={<span suppressHydrationWarning>{takaCompact(metrics.valueOnBench)}</span>}
          caption="at current estimate"
        />
      </div>

      {/* ---- Insight strip ----
          Only rendered when there is something true to say. An always-present
          panel of encouraging statistics is noise; these each imply an action
          or tell the engineer how their work is being received. */}
      <Insights metrics={metrics} />

      {/* ---- Tabs ---- */}
      <nav className="mt-4 flex gap-1 overflow-x-auto pb-px" aria-label="Workbench sections">
        {TABS.map((t) => {
          const n = buckets[t.key].length;
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className="viewchip shrink-0"
              data-on={on}
              aria-pressed={on}
            >
              <t.icon size={13} />
              {t.label}
              <span className="viewchip-count">{n}</span>
            </button>
          );
        })}
      </nav>

      {total > 5 && (
        <div className="search-bar mt-3">
          <Search size={16} />
          <input
            className="field text-sm"
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search model, reg no, territory…"
          />
        </div>
      )}

      {/* ---- List ---- */}
      <div className="mt-3.5 flex flex-col gap-2.5">
        {list.length === 0 ? (
          <EmptyBucket tab={tab} searching={!!search.trim()} />
        ) : (
          list.map((v, i) => <VehicleCard key={v.id} v={v} index={i} />)
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Insights({ metrics }: { metrics: EngineerMetrics }) {
  const cards: React.ReactNode[] = [];

  if (metrics.rework > 0) {
    cards.push(
      <InsightCard
        key="rework"
        tone="bad"
        icon={<RotateCcw size={15} />}
        title={`${metrics.rework} sent back for rework`}
        body="The Service Head returned these. The reason is on each card."
      />,
    );
  }

  if (metrics.overdue > 0) {
    cards.push(
      <InsightCard
        key="overdue"
        tone="bad"
        icon={<AlertTriangle size={15} />}
        title={`${metrics.overdue} repair${metrics.overdue === 1 ? "" : "s"} past deadline`}
        body="Committed timeframes have already passed."
      />,
    );
  }

  if (metrics.drafts > 0) {
    cards.push(
      <InsightCard
        key="drafts"
        tone="warn"
        icon={<FileEdit size={15} />}
        title={`${metrics.drafts} assessment${metrics.drafts === 1 ? "" : "s"} in progress`}
        body="Saved but not submitted — nobody is waiting on these yet."
      />,
    );
  }

  // How the Service Head treats this engineer's numbers. Genuinely useful
  // feedback: consistently cut estimates mean padding, consistently raised
  // ones mean work is being missed on inspection.
  if (metrics.adjustment.count > 0 && metrics.adjustment.avgPct !== null) {
    const pct = metrics.adjustment.avgPct;
    const cut = pct < 0;
    cards.push(
      <InsightCard
        key="adj"
        tone="neutral"
        icon={cut ? <TrendingDown size={15} /> : <TrendingUp size={15} />}
        title={`Estimates adjusted ${cut ? "down" : "up"} ${Math.abs(pct)}% on average`}
        body={`Across ${metrics.adjustment.count} review${metrics.adjustment.count === 1 ? "" : "s"} · net ${taka(Math.abs(metrics.adjustment.netTk))} ${cut ? "removed" : "added"}.`}
      />,
    );
  }

  if (metrics.firstTimePass.submitted >= 3 && metrics.firstTimePass.pct !== null) {
    cards.push(
      <InsightCard
        key="pass"
        tone={metrics.firstTimePass.pct >= 80 ? "ok" : "warn"}
        icon={<Target size={15} />}
        title={`${metrics.firstTimePass.pct}% approved first time`}
        body={`${metrics.firstTimePass.submitted} submitted · ${metrics.firstTimePass.sentBack} sent back.`}
      />,
    );
  }

  if (cards.length === 0) return null;

  return (
    <section className="mt-3 flex flex-col gap-2" aria-label="Insights">
      {cards}
    </section>
  );
}

function InsightCard({
  tone,
  icon,
  title,
  body,
}: {
  tone: "bad" | "warn" | "ok" | "neutral";
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  const colour =
    tone === "bad"
      ? "var(--bad)"
      : tone === "warn"
        ? "var(--warn)"
        : tone === "ok"
          ? "var(--ok)"
          : "var(--accent)";
  const soft =
    tone === "bad"
      ? "var(--bad-soft)"
      : tone === "warn"
        ? "var(--warn-soft)"
        : tone === "ok"
          ? "var(--ok-soft)"
          : "var(--accent-soft)";

  return (
    <div
      className="card flex items-start gap-2.5 p-3 aura-glass transition-transform duration-300 hover:scale-[1.01]"
      style={{ animation: "riseIn 0.3s var(--ease-out-quart) both" }}
    >
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
        style={{ background: soft, color: colour }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-[13px] font-semibold leading-tight text-ink">{title}</p>
        <p className="mt-0.5 text-[12px] leading-snug text-ink-2">{body}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function VehicleCard({ v, index }: { v: WorkbenchVehicle; index: number }) {
  const estimate = v.repairTotal + v.transportCost + v.otherCost;
  const make = vehicleMake(v);

  return (
    <Link
      href={`/vehicles/${v.id}`}
      className="card card-lift block overflow-hidden p-0 aura-glass transition-all duration-300 hover:scale-[1.02]"
      style={{ animation: `riseIn 0.28s var(--ease-out-quart) ${Math.min(index, 10) * 0.03}s both` }}
    >
      {/* A rework leads with the reason it came back. Everything else on the
          card is secondary to knowing why this is on the bench again. */}
      {v.isRework && (
        <div
          className="flex items-start gap-2 px-3.5 py-2"
          style={{ background: "var(--bad-soft)" }}
        >
          <RotateCcw size={13} className="mt-0.5 shrink-0" style={{ color: "var(--bad)" }} />
          <div className="min-w-0">
            <p className="text-[11.5px] font-bold uppercase tracking-wide" style={{ color: "var(--bad)" }}>
              Sent back
            </p>
            {v.reworkNote && (
              <p className="mt-0.5 text-[12px] leading-snug text-ink-2">
                &ldquo;{v.reworkNote}&rdquo;
              </p>
            )}
          </div>
        </div>
      )}

      <div className="p-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-[17px] font-bold leading-tight tracking-tight text-ink">
              {vehicleTitle(v)}
            </h3>
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
              {v.registrationNo}
              {make ? ` · ${make}` : ""}
            </p>
          </div>
          {v.bucket === "assess" ? (
            <span className="btn btn-primary btn-sm shrink-0">
              {v.hasDraft ? <FileEdit size={13} /> : <Wrench size={13} />}
              {v.hasDraft ? "Resume" : "Assess"}
            </span>
          ) : (
            <div className="flex shrink-0 items-center gap-1.5">
              <Chip tone={STATUS_META[v.status].tone}>{STATUS_META[v.status].label}</Chip>
              <ChevronRight size={15} className="text-ink-3" />
            </div>
          )}
        </div>

        {/* Facts row */}
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1.5">
          <Fact icon={<MapPin size={11} />} text={v.territory?.name ?? "—"} />
          <Fact icon={<ClipboardList size={11} />} text={`${v.age}d old`} />
          {v.capturedBy && <Fact icon={<Wrench size={11} />} text={v.capturedBy.name} />}
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
              <span className={v.lineCount ? "" : "opacity-50"}>
                {v.lineCount} cost {v.lineCount === 1 ? "line" : "lines"}
              </span>
              <span className={v.sheetCount ? "" : "opacity-50"}>
                {v.sheetCount} {v.sheetCount === 1 ? "sheet" : "sheets"}
              </span>
              {/* Both are required to submit, so say which is missing. */}
              {(!v.lineCount || !v.sheetCount) && (
                <span style={{ color: "var(--warn)" }}>
                  needs {!v.lineCount ? "a cost line" : "a sheet"}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Submitted estimate, once it is out of the engineer's hands. */}
        {(v.bucket === "review" || v.bucket === "repair") && estimate > 0 && (
          <div className="mt-2.5 flex items-baseline justify-between border-t border-rule pt-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              Estimate
            </span>
            <span className="tnum text-[13px] font-bold text-ink">{taka(estimate)}</span>
          </div>
        )}

        {/* Deadline countdown — only ever shown while a repair is live. */}
        {v.bucket === "repair" && v.daysToDeadline !== null && (
          <DeadlineBar days={v.daysToDeadline} overdue={v.overdue} />
        )}
      </div>
    </Link>
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
    <div className="mt-2.5">
      <div className="flex items-baseline justify-between">
        <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
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
      <div className="prop-track mt-1.5" style={{ height: 5 }}>
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
      body: "Assessments you submit sit here until the Service Head approves the repair.",
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
    <div
      className="card grid place-items-center gap-2.5 px-6 py-12 text-center aura-glass aura-float"
      style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}
    >
      <div className="grid h-12 w-12 place-items-center rounded-full bg-surface-2">
        <CheckCircle2 size={24} className="text-ink-3" strokeWidth={1.5} />
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
