"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { Role, VehicleStatus, EventType } from "@prisma/client";
import {
  Car,
  Activity,
  Wallet,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  Timer,
  Lock,
  MapPin,
  Users,
  ChevronRight,
  Sparkles,
  Layers,
  ArrowRight,
} from "lucide-react";
import { STATUS_META, type Tone } from "@/lib/status";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { PanelHero } from "@/components/ui/PanelHero";
import { StatTile } from "@/components/ui/StatTile";
import { CountUp, useCountUp } from "@/components/ui/CountUp";
import { taka, takaCompact, number as fmtNumber, shortDate } from "@/lib/format";

// ---------------------------------------------------------------------------
// Serialized shapes — the page component computes these server-side.
// ---------------------------------------------------------------------------

export interface AttentionVehicle {
  id: string;
  name: string;
  regNo: string;
  status: VehicleStatus;
  territory: string | null;
  /** Days overdue (overdue list) or days sitting at this desk (stalled list). */
  days: number;
}

export interface ActivityItem {
  id: string;
  type: EventType;
  createdAt: string;
  vehicleId: string;
  vehicleName: string;
  regNo: string;
  actorName: string | null;
  actorRole: Role | null;
  note: string | null;
  fromStatus: VehicleStatus | null;
  toStatus: VehicleStatus | null;
}

export interface AdminDashboardProps {
  greeting: string;
  firstName: string;
  totals: {
    all: number;
    active: number;
    live: number;
    released: number;
    sold: number;
    locked: number;
  };
  money: {
    portfolioValue: number;
    capitalDeployed: number;
    realisedMargin: number;
    avgMarginPct: number | null;
  };
  pipeline: { status: VehicleStatus; count: number }[];
  overdue: AttentionVehicle[];
  stalled: AttentionVehicle[];
  territories: { name: string; count: number; value: number }[];
  roster: { role: Role; label: string; count: number }[];
  events: ActivityItem[];
  generatedAt: string;
  /** Pipeline analytics block, computed server-side and passed in. */
  insight?: React.ReactNode;
}

// Desk order for the funnel. RELEASED is an exit, shown separately.
const FUNNEL: VehicleStatus[] = [
  "CAPTURED",
  "CN_REQUESTED",
  "CN_APPROVED",
  "COST_SUBMITTED",
  "REPAIR_APPROVED",
  "REGISTRATION_DONE",
  "SOP_ADDED",
  "PRICE_APPROVED",
  "LIVE_FOR_RESALE",
];

function toneColor(tone: Tone): string {
  switch (tone) {
    case "accent":
      return "var(--accent)";
    case "ok":
      return "var(--ok)";
    case "warn":
      return "var(--warn)";
    case "bad":
      return "var(--bad)";
    default:
      return "var(--ink-3)";
  }
}

function toneSoft(tone: Tone): string {
  switch (tone) {
    case "accent":
      return "var(--accent-soft)";
    case "ok":
      return "var(--ok-soft)";
    case "warn":
      return "var(--warn-soft)";
    case "bad":
      return "var(--bad-soft)";
    default:
      return "var(--surface-3)";
  }
}

export function AdminDashboard(props: AdminDashboardProps) {
  const {
    greeting,
    firstName,
    totals,
    money,
    pipeline,
    overdue,
    stalled,
    territories,
    roster,
    events,
    generatedAt,
    insight,
  } = props;

  const [tab, setTab] = useState<"overview" | "analytics">("overview");

  const counts = useMemo(
    () => new Map(pipeline.map((p) => [p.status, p.count])),
    [pipeline],
  );

  const funnelRows = useMemo(
    () => FUNNEL.map((s) => ({ status: s, count: counts.get(s) ?? 0 })),
    [counts],
  );

  const maxCount = useMemo(
    () => Math.max(1, ...funnelRows.map((r) => r.count)),
    [funnelRows],
  );

  // The desk holding the most files (excluding the terminal Live bucket).
  const bottleneck = useMemo(() => {
    const inFlight = funnelRows.filter((r) => r.status !== "LIVE_FOR_RESALE");
    const top = inFlight.reduce((a, b) => (b.count > a.count ? b : a), inFlight[0]);
    return top && top.count > 0 ? top.status : null;
  }, [funnelRows]);

  const empty = totals.all === 0;

  return (
    // Same container, hero and tile grid as every other desk panel. This
    // screen used to run its own 44px greeting, its own metric cells and its
    // own tab control, which made the one panel a Super Admin opens first the
    // one panel that looked like a different product.
    <div className="mx-auto w-full max-w-[1580px] px-5 py-6 lg:px-7">
      <div className="enter flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1" style={{ minWidth: 280 }}>
          <PanelHero
            eyebrow="System overview"
            title={`${greeting}, ${firstName}.`}
            subtitle={
              empty
                ? "No vehicles in the system yet — the pipeline starts at field capture."
                : undefined
            }
            // The three readings that used to be one interpunct-separated
            // sentence in the subtitle. Same numbers, given the column they
            // were always describing.
            facts={
              empty
                ? undefined
                : [
                    { label: "In flight", value: fmtNumber(totals.active), accent: true },
                    { label: "Live for resale", value: fmtNumber(totals.live) },
                    { label: "Records in total", value: fmtNumber(totals.all) },
                  ]
            }
            art="desk"
          />
        </div>
        <div className="flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1.5">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--ok)" }} />
          <span className="font-mono text-[10.5px] tracking-wide text-ink-3">
            Live · {shortDate(generatedAt)}
          </span>
        </div>
      </div>

      {empty ? (
        <GettingStarted />
      ) : (
        <>
          <div className="enter enter-1 mt-3.5 seg" role="group" aria-label="Dashboard view">
            <button className="seg-btn" data-on={tab === "overview"} onClick={() => setTab("overview")}>
              <Layers size={12} />
              Overview
            </button>
            <button className="seg-btn" data-on={tab === "analytics"} onClick={() => setTab("analytics")}>
              <Activity size={12} />
              Analytics
            </button>
          </div>

          {tab === "overview" ? (
            <>
              {/* -------------------------------------------------------------- */}
              {/* KPI canvas — Hairline 1px grid (Ultra-premium dense layout)   */}
              {/* -------------------------------------------------------------- */}
              {/* The same tile the field and desk panels use. Six of them fit
                  a wide screen in one row and fall to three, then two, without
                  the hairline-grid card they used to sit inside — which was
                  the other thing making this screen look unrelated. */}
              {/* The six figures arrive in sequence rather than together.
                  Reading order is left to right, so that is the order they
                  land in — the cascade IS the reading order, said in motion. */}
              <div className="stagger mt-3.5 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
                <StatTile
                  icon={<Car size={17} />}
                  tint="neutral"
                  label="Total"
                  value={totals.all}
                  caption={`${fmtNumber(totals.sold)} sold · ${fmtNumber(totals.released)} released`}
                />
                <StatTile
                  icon={<Layers size={17} />}
                  tint="accent"
                  label="In pipeline"
                  value={totals.active}
                  caption={bottleneck ? `Most at ${STATUS_META[bottleneck].heldBy}` : "All clear"}
                />
                <StatTile
                  icon={<CheckCircle2 size={17} />}
                  tint="ok"
                  label="Live"
                  value={totals.live}
                  caption={
                    totals.all > 0 ? `${Math.round((totals.live / totals.all) * 100)}% of book` : "—"
                  }
                />
                <StatTile
                  icon={<Wallet size={17} />}
                  tint="accent"
                  label="Capital"
                  value={money.capitalDeployed}
                  display={takaCompact(money.capitalDeployed)}
                  caption="Files in flight"
                />
                <StatTile
                  icon={<TrendingUp size={17} />}
                  tint="ok"
                  label="Portfolio"
                  value={money.portfolioValue}
                  display={takaCompact(money.portfolioValue)}
                  caption={`${takaCompact(money.realisedMargin)} margin`}
                />
                <StatTile
                  icon={<Activity size={17} />}
                  tint={
                    money.avgMarginPct === null
                      ? "neutral"
                      : money.avgMarginPct >= 0
                        ? "ok"
                        : "bad"
                  }
                  label="Avg margin"
                  value={money.avgMarginPct ?? 0}
                  display={
                    money.avgMarginPct === null ? "—" : `${money.avgMarginPct.toFixed(1)}%`
                  }
                  caption="Across priced"
                />
              </div>

              {/* -------------------------------------------------------------- */}
              {/* Alert strip — Hairline 1px grid                               */}
              {/* -------------------------------------------------------------- */}
              {(overdue.length > 0 || stalled.length > 0 || totals.locked > 0) && (
                <section className="enter enter-3 mb-4 mt-3.5 overflow-hidden rounded-[var(--radius-lg)] border border-rule bg-rule">
                  <div className="grid grid-cols-1 gap-[1px] sm:grid-cols-3">
                    <AlertCell
                      tone="bad"
                      icon={<AlertTriangle size={13} />}
                      count={overdue.length}
                      label="Repairs overdue"
                      detail={
                        overdue.length > 0
                          ? `Longest ${overdue[0].days}d past deadline`
                          : "No deadlines breached"
                      }
                    />
                    <AlertCell
                      tone="warn"
                      icon={<Timer size={13} />}
                      count={stalled.length}
                      label="Files stalled 7d+"
                      detail={
                        stalled.length > 0
                          ? `Longest idle ${stalled[0].days}d at one desk`
                          : "Everything moving"
                      }
                    />
                    <AlertCell
                      tone="neutral"
                      icon={<Lock size={13} />}
                      count={totals.locked}
                      label="Locked records"
                      detail="Letter 3 / Written issued"
                    />
                  </div>
                </section>
              )}

          {/* -------------------------------------------------------------- */}
          {/* Main grid                                                       */}
          {/* -------------------------------------------------------------- */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            {/* Left — pipeline + attention */}
            <div className="flex flex-col gap-4 lg:col-span-7">
              <Panel
                title="Pipeline"
                icon={<Layers size={17} />}
                right={<span className="font-mono text-[11px] text-ink-3 tracking-widest uppercase">by desk</span>}
                delay={0.08}
                variant="blueprint"
              >
                <div className="flex flex-col">
                  {funnelRows.map((row) => {
                    const meta = STATUS_META[row.status];
                    const isBottleneck = row.status === bottleneck && row.count > 1;
                    const pct = (row.count / maxCount) * 100;
                    return (
                      <div
                        key={row.status}
                        className="group relative grid grid-cols-[1fr_auto] items-center gap-3 rounded-lg px-2.5 py-1.5 transition-all duration-300 hover:scale-[0.99] hover:bg-surface-2"
                      >
                        <div className="min-w-0">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="truncate text-[13px] font-medium text-ink">
                              {meta.label}
                            </span>
                          </div>
                          <div className="relative mt-2 h-1.5 w-full overflow-hidden rounded-sm bg-rule">
                            <div
                              className="h-full rounded-sm"
                              style={{
                                width: `${pct}%`,
                                background: toneColor(meta.tone),
                                transition: "width 0.8s cubic-bezier(0.2, 1, 0.2, 1)",
                              }}
                            />
                            {/* Mechanical grid overlay */}
                            <div 
                              className="absolute inset-0" 
                              style={{ 
                                backgroundImage: "linear-gradient(90deg, transparent 90%, var(--surface-2) 90%)", 
                                backgroundSize: "10% 100%" 
                              }} 
                            />
                          </div>
                          <div className="mt-2 flex items-center justify-between font-mono text-[10px] text-ink-3">
                            <span>{meta.heldBy === "—" ? "TERMINAL STAGE" : `HELD BY ${meta.heldBy.toUpperCase()}`}</span>
                            {isBottleneck && (
                              <span className="flex items-center gap-1 text-warn">
                                <AlertTriangle size={10} /> BOTTLENECK
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right pl-2">
                          <span
                            className="font-display text-2xl font-bold tnum"
                            style={{ color: row.count > 0 ? "var(--ink)" : "var(--ink-3)" }}
                          >
                            <CountUp value={row.count} />
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {totals.released > 0 && (
                  <div className="mt-3 flex items-center justify-between rounded-lg border border-rule bg-surface-2 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm text-ink-2">
                      <ArrowRight size={14} className="text-ink-3" />
                      Released back to customer
                    </span>
                    <span className="font-display text-lg font-bold tnum text-ink-2">
                      {totals.released}
                    </span>
                  </div>
                )}
              </Panel>

              <AttentionPanel overdue={overdue} stalled={stalled} />
            </div>

            {/* Right — money, territories, roster, activity */}
            <div className="flex flex-col gap-4 lg:col-span-5">
              <Panel title="Financials" icon={<Wallet size={17} />} delay={0.1}>
                <dl className="flex flex-col gap-0">
                  <MoneyRow
                    label="Capital deployed"
                    renderValue={<AnimatedFull value={money.capitalDeployed} />}
                  />
                  <MoneyRow
                    label="Portfolio value"
                    renderValue={<AnimatedFull value={money.portfolioValue} />}
                  />
                  <MoneyRow
                    label="Margin on live stock"
                    renderValue={<AnimatedFull value={money.realisedMargin} />}
                    tone={money.realisedMargin >= 0 ? "ok" : "bad"}
                  />
                  <MoneyRow
                    label="Average margin"
                    renderValue={
                      money.avgMarginPct === null ? (
                        <span>—</span>
                      ) : (
                        <CountUp
                          value={money.avgMarginPct}
                          format={(n) => `${n.toFixed(1)}%`}
                        />
                      )
                    }
                    tone={
                      money.avgMarginPct === null
                        ? "neutral"
                        : money.avgMarginPct >= 0
                          ? "ok"
                          : "bad"
                    }
                    last
                  />
                </dl>
              </Panel>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {territories.length > 0 && (
                  <Panel title="Territories" icon={<MapPin size={17} />} delay={0.12}>
                    <div className="flex flex-col gap-2">
                      {territories.map((t) => {
                        const max = Math.max(1, ...territories.map((x) => x.count));
                        return (
                          <div key={t.name}>
                            <div className="mb-1 flex items-baseline justify-between gap-2">
                              <span className="truncate text-[13px] text-ink-2">{t.name}</span>
                              <span className="shrink-0 font-mono text-xs tnum text-ink">
                                <CountUp value={t.count} />
                              </span>
                            </div>
                            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-3">
                              <div
                                className="h-full rounded-full"
                                style={{
                                  width: `${(t.count / max) * 100}%`,
                                  background: "var(--accent)",
                                  transition: "width 0.5s var(--ease-out-quart)",
                                }}
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </Panel>
                )}

              <Panel
                title="Team"
                icon={<Users size={17} />}
                right={
                  <Link
                    href="/admin/users"
                    className="flex items-center gap-1 font-mono text-[11px] text-accent transition-opacity hover:opacity-70"
                  >
                    Manage <ChevronRight size={12} />
                  </Link>
                }
                delay={0.14}
              >
                <div className="flex flex-col divide-y divide-rule">
                  {roster.map((r) => (
                    <div key={r.role} className="flex items-center justify-between py-1.5">
                      <span className="truncate text-[13px] text-ink-2">{r.label}</span>
                      <span className="font-mono text-xs tnum text-ink">
                        <CountUp value={r.count} />
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
              </div>

              <Panel
                title="Recent activity"
                icon={<Activity size={17} />}
                right={<span className="font-mono text-[11px] text-ink-3">{events.length}</span>}
                delay={0.16}
              >
                <ActivityFeed events={events} showVehicle />
              </Panel>
            </div>
          </div>
          </>
          ) : (
            <div style={{ animation: "fadeIn 0.28s var(--ease-standard) both" }}>
              {insight}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Attention list — overdue and stalled files, switchable.
// ---------------------------------------------------------------------------

function AttentionPanel({
  overdue,
  stalled,
}: {
  overdue: AttentionVehicle[];
  stalled: AttentionVehicle[];
}) {
  const [tab, setTab] = useState<"overdue" | "stalled">(
    overdue.length > 0 ? "overdue" : "stalled",
  );
  const list = tab === "overdue" ? overdue : stalled;

  return (
    <Panel
      title="Needs attention"
      icon={<AlertTriangle size={17} />}
      right={
        <div className="flex gap-4">
          <MiniTab
            label={`Overdue (${overdue.length})`}
            on={tab === "overdue"}
            onClick={() => setTab("overdue")}
          />
          <MiniTab
            label={`Stalled (${stalled.length})`}
            on={tab === "stalled"}
            onClick={() => setTab("stalled")}
          />
        </div>
      }
      delay={0.1}
    >
      {list.length === 0 ? (
        <div className="grid place-items-center gap-2 py-10 text-center">
          <div
            className="grid h-11 w-11 place-items-center rounded-full"
            style={{ background: "var(--ok-soft)", color: "var(--ok-ink)" }}
          >
            <CheckCircle2 size={20} />
          </div>
          <p className="text-sm font-medium text-ink-2">
            {tab === "overdue" ? "No repair deadlines breached." : "No files sitting idle."}
          </p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-rule">
          {list.map((v) => {
            const meta = STATUS_META[v.status];
            return (
              <Link
                key={v.id}
                href={`/vehicles/${v.id}`}
                className="group flex items-center justify-between gap-3 rounded-md px-2 py-2 -mx-2 transition-colors duration-150 hover:bg-surface-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-ink">{v.name}</div>
                  <div className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
                    {v.regNo} · {v.territory ?? "No territory"}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className="hidden rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider sm:inline"
                    style={{ background: toneSoft(meta.tone), color: toneColor(meta.tone) }}
                  >
                    {meta.heldBy === "—" ? meta.label : meta.heldBy}
                  </span>
                  <span
                    className="font-mono text-xs font-semibold tnum"
                    style={{ color: tab === "overdue" ? "var(--bad)" : "var(--warn)" }}
                  >
                    {v.days}d
                  </span>
                  <ChevronRight
                    size={15}
                    className="text-ink-3 transition-transform group-hover:translate-x-0.5"
                  />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

function Panel({
  title,
  icon,
  right,
  children,
  delay = 0,
  variant = "default",
}: {
  title: string;
  icon?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  variant?: "default" | "blueprint";
}) {
  // The `blueprint` variant used to paint a 16px dot grid behind the panel.
  // It was texture for its own sake — it carried no information, and behind a
  // chart it competed with the data. The variant survives as a quieter
  // ground so callsites keep working; the pattern does not.

  return (
    <section
      className={`rounded-[var(--radius)] border border-rule p-4 ${
        variant === "blueprint" ? "bg-surface-2" : "bg-surface"
      }`}
      style={{ animation: `fadeIn 0.28s var(--ease-standard) ${delay}s both` }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[16px] font-bold text-ink">
          {icon && <span className="text-accent">{icon}</span>}
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/**
 * One alert cell inside the shared alert strip. Count on the left, label and
 * detail on the right — a compact one-line-plus-caption that reads at a
 * glance without stealing space from the pipeline underneath.
 */
function AlertCell({
  tone,
  icon,
  count,
  label,
  detail,
}: {
  tone: Tone;
  icon: React.ReactNode;
  count: number;
  label: string;
  detail: string;
}) {
  const dim = count === 0;
  return (
    <div className="group flex items-center gap-3 bg-surface px-4 py-3 transition-colors duration-200 hover:bg-surface-2">
      <span
        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg"
        style={{
          background: dim ? "var(--surface-3)" : toneSoft(tone),
          color: dim ? "var(--ink-3)" : toneColor(tone),
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-display text-[19px] font-bold leading-none tnum"
            style={{ color: dim ? "var(--ink-3)" : toneColor(tone) }}
          >
            <CountUp value={count} />
          </span>
          <span className="text-[13px] font-semibold leading-tight text-ink">{label}</span>
        </div>
        <div className="mt-0.5 font-mono text-[10px] leading-snug text-ink-3">{detail}</div>
      </div>
    </div>
  );
}

function MoneyRow({
  label,
  renderValue,
  tone = "neutral",
  last,
}: {
  label: string;
  renderValue: React.ReactNode;
  tone?: Tone;
  last?: boolean;
}) {
  return (
    <div
      className={`group relative overflow-hidden rounded-md px-3 py-2.5 transition-colors hover:bg-surface-2 ${last ? "" : "mb-1"}`}
    >
      <div className="relative z-10 flex items-baseline justify-between gap-3">
        <dt className="text-[13px] font-medium text-ink-2">{label}</dt>
        <dd
          className="font-mono text-[13px] font-semibold tnum"
          style={{ color: tone === "neutral" ? "var(--ink)" : toneColor(tone) }}
        >
          {renderValue}
        </dd>
      </div>
    </div>
  );
}

/** Full-precision taka figure that tweens on mount — "Tk 1,234,567". */
function AnimatedFull({ value }: { value: number }) {
  const v = useCountUp(value, { duration: 560 });
  return <span suppressHydrationWarning>{taka(v)}</span>;
}

function MiniTab({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="pb-0.5 font-mono text-[11px] transition-colors"
      style={
        on
          ? { color: "var(--accent)", borderBottom: "2px solid var(--accent)" }
          : { color: "var(--ink-3)", borderBottom: "2px solid transparent" }
      }
    >
      {label}
    </button>
  );
}

function GettingStarted() {
  const steps = [
    {
      n: 1,
      title: "Add your master data",
      body: "Territories, yards and the capture checklist drive the field form.",
      href: "/admin/master-data",
      cta: "Open master data",
    },
    {
      n: 2,
      title: "Create the desk accounts",
      body: "One account per role so a file can move through all eight desks.",
      href: "/admin/users",
      cta: "Manage users",
    },
    {
      n: 3,
      title: "Capture the first vehicle",
      body: "A Recovery Team account starts the pipeline from the field.",
      href: "/register",
      cta: "Open the marketplace",
    },
  ];

  return (
    <section className="card-lg p-7" style={{ animation: "slideUp 0.25s var(--ease-out-quart) 0.05s both" }}>
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-9 w-9 place-items-center rounded-xl"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Sparkles size={18} />
        </span>
        <div>
          <h2 className="font-display text-xl font-bold text-ink">Get the pipeline running</h2>
          <p className="text-sm text-ink-2">Three steps before the first file moves.</p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        {steps.map((s, i) => (
          <div
            key={s.n}
            className="flex flex-col rounded-xl border border-rule bg-surface-2 p-4"
            style={{ animation: `fadeIn 0.25s var(--ease-standard) ${0.08 + i * 0.05}s both` }}
          >
            <span
              className="grid h-6 w-6 place-items-center rounded-full font-mono text-xs"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {s.n}
            </span>
            <h3 className="mt-3 text-sm font-semibold text-ink">{s.title}</h3>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-ink-2">{s.body}</p>
            <Link
              href={s.href}
              className="mt-3 flex items-center gap-1 font-mono text-[11px] text-accent transition-opacity hover:opacity-70"
            >
              {s.cta} <ChevronRight size={12} />
            </Link>
          </div>
        ))}
      </div>
    </section>
  );
}
