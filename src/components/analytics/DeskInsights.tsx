import {
  Activity,
  AlertTriangle,
  Award,
  BadgeCheck,
  Banknote,
  ClipboardCheck,
  Clock3,
  Gauge,
  Hammer,
  Layers,
  MapPin,
  Scale,
  ShieldAlert,
  Store,
  Timer,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import type {
  AdminInsight,
  AgeProfile,
  AgmInsight,
  GmInsight,
  RecoveryManagerInsight,
  ServiceHeadInsight,
  SrExecutiveInsight,
} from "@/lib/insights";
import { ACTIVITY_DAYS, WINDOW_DAYS } from "@/lib/insights";
import { takaCompact } from "@/lib/format";
import {
  BarList,
  Columns,
  Figure,
  InsightBlock,
  Panel,
  PanelGrid,
  Ranked,
  ReadingStrip,
  SplitRate,
  StackBar,
} from "./kit";

/**
 * Per-desk analytics blocks.
 *
 * Each desk gets the readings that change what its owner does next, and
 * nothing else. The temptation with a shared kit is to give every role the
 * same eight panels; that produces a dashboard everyone scrolls past. A
 * Recovery Manager has no use for realisation rate, and a BM does not need a
 * letter-stage breakdown, so neither is shown one.
 *
 * The queue-age panel is the single exception — it appears on every desk,
 * because "how long has this been sitting with me" is the one question every
 * desk owner has in common.
 */

/** Shared: how long the files currently on this desk have been waiting. */
function QueueAge({ age, span = 4 }: { age: AgeProfile; span?: 3 | 4 | 5 | 6 }) {
  const tone = age.oldest >= 14 ? "bad" : age.oldest >= 7 ? "warn" : "ok";
  return (
    <Panel
      title="Queue age"
      icon={<Clock3 size={11} />}
      tone={tone}
      span={span}
      meta={age.total > 0 ? `oldest ${age.oldest}d` : undefined}
    >
      <BarList
        slices={age.buckets.filter((b) => b.count > 0)}
        emptyLabel="Nothing is waiting on this desk."
      />
    </Panel>
  );
}

// ---------------------------------------------------------------------------

export function RecoveryManagerInsights({ data }: { data: RecoveryManagerInsight }) {
  return (
    <InsightBlock title="Desk insight" meta={`decisions over ${WINDOW_DAYS} days`}>
      <PanelGrid>
        <ReadingStrip readings={data.readings} />

        <Panel title="Credit note rulings" icon={<Scale size={11} />} tone="ok" span={4}>
          <SplitRate
            left={data.decisions.approved}
            right={data.decisions.declined}
            leftLabel="Approved"
            rightLabel="Declined"
          />
        </Panel>

        <QueueAge age={data.age} />

        <Panel title="Letter pressure" icon={<AlertTriangle size={11} />} tone="warn" span={4}>
          <BarList
            slices={data.letters}
            emptyLabel="No files waiting, so no letters to weigh."
          />
        </Panel>

        <Panel title="Where the pressure is" icon={<MapPin size={11} />} tone="accent" span={6}>
          <BarList slices={data.territories} emptyLabel="No territory has files waiting." />
        </Panel>

        <Panel
          title="Field team"
          icon={<Users size={11} />}
          tone="accent"
          span={6}
          meta={`${ACTIVITY_DAYS}d captures`}
        >
          <Ranked
            leaders={data.field}
            emptyLabel="No captures recorded this month."
          />
        </Panel>
      </PanelGrid>
    </InsightBlock>
  );
}

// ---------------------------------------------------------------------------

export function ServiceHeadInsights({ data }: { data: ServiceHeadInsight }) {
  const { deadline } = data;
  return (
    <InsightBlock title="Desk insight" meta={`rates over ${WINDOW_DAYS} days`}>
      <PanelGrid>
        <ReadingStrip readings={data.readings} />

        <Panel
          title="Estimates awaiting approval"
          icon={<Banknote size={11} />}
          tone="accent"
          span={5}
          meta={data.queueValue > 0 ? takaCompact(data.queueValue) : undefined}
        >
          <StackBar
            segments={data.estimateSegments}
            total={data.queueValue}
            emptyLabel="No estimates are waiting on this desk."
          />
        </Panel>

        <Panel
          title="Deadlines kept"
          icon={<Timer size={11} />}
          tone={deadline.late > deadline.onTime ? "bad" : "ok"}
          span={4}
        >
          <SplitRate
            left={deadline.onTime}
            right={deadline.late}
            leftLabel="On time"
            rightLabel="Late"
          />
        </Panel>

        <QueueAge age={data.age} span={3} />

        <Panel
          title="Repairs under way"
          icon={<Wrench size={11} />}
          tone={deadline.overdue > 0 ? "warn" : "accent"}
          span={5}
          meta={`${deadline.running} live`}
        >
          <BarList
            slices={data.repairStages}
            emptyLabel="No repair is currently approved and running."
          />
          {deadline.overdue > 0 && (
            <>
              <div className="insight-rule" />
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-bad">
                <ShieldAlert size={12} className="shrink-0" />
                {deadline.overdue} {deadline.overdue === 1 ? "repair is" : "repairs are"} past the
                deadline you set.
              </p>
            </>
          )}
        </Panel>

        <Panel
          title="Engineer throughput"
          icon={<Hammer size={11} />}
          tone="accent"
          span={7}
          meta={`${ACTIVITY_DAYS}d`}
        >
          <Ranked
            leaders={data.engineers}
            emptyLabel="No assessments submitted this month."
          />
        </Panel>
      </PanelGrid>
    </InsightBlock>
  );
}

// ---------------------------------------------------------------------------

export function SrExecutiveInsights({ data }: { data: SrExecutiveInsight }) {
  const graded = data.marginByGrade.filter((g) => g.marginPct !== null);

  return (
    <InsightBlock title="Desk insight" meta="cost, grade and margin">
      <PanelGrid>
        <ReadingStrip readings={data.readings} />

        <Panel
          title="Where the money went"
          icon={<Layers size={11} />}
          tone="accent"
          span={5}
          meta={data.queueValue > 0 ? takaCompact(data.queueValue) : undefined}
        >
          <StackBar
            segments={data.costSegments}
            total={data.queueValue}
            emptyLabel="No files are waiting for an SOP figure."
          />
        </Panel>

        <Panel title="Condition grades" icon={<BadgeCheck size={11} />} tone="ok" span={4}>
          <BarList slices={data.grades} emptyLabel="Nothing has been graded yet." />
          {data.ungraded > 0 && (
            <>
              <div className="insight-rule" />
              <p className="text-[11px] leading-snug text-ink-2">
                <span className="font-semibold text-bad">{data.ungraded}</span> priced or in-flight{" "}
                {data.ungraded === 1 ? "vehicle has" : "vehicles have"} no grade — they cannot be
                valued with confidence.
              </p>
            </>
          )}
        </Panel>

        <QueueAge age={data.age} span={3} />

        <Panel
          title="Margin by grade"
          icon={<TrendingUp size={11} />}
          tone="ok"
          span={12}
          meta="average across priced files"
        >
          {graded.length === 0 ? (
            <p className="insight-empty">
              No graded vehicle has an approved price yet, so grade cannot be tested against margin.
              This fills in once the first graded file is priced.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-x-6 gap-y-3 lg:grid-cols-4">
              {data.marginByGrade.map((g) => (
                <div
                  key={g.grade}
                  className="reading"
                  data-tone={
                    g.marginPct === null
                      ? "neutral"
                      : g.marginPct < 0
                        ? "bad"
                        : g.marginPct < 10
                          ? "warn"
                          : "ok"
                  }
                >
                  <div className="reading-label">
                    {g.grade} · {g.label}
                  </div>
                  {g.marginPct === null ? (
                    <div className="reading-empty">Not priced</div>
                  ) : (
                    <div className="reading-value">
                      {g.marginPct}
                      <span className="reading-unit">%</span>
                    </div>
                  )}
                  <div className="reading-caption">
                    {g.count} {g.count === 1 ? "file" : "files"}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </PanelGrid>
    </InsightBlock>
  );
}

// ---------------------------------------------------------------------------

export function AgmInsights({ data }: { data: AgmInsight }) {
  return (
    <InsightBlock title="Pricing insight" meta={`margin across the priced book`}>
      <PanelGrid>
        <ReadingStrip readings={data.readings} />

        <Panel title="Margin distribution" icon={<Gauge size={11} />} tone="ok" span={4}>
          <BarList
            slices={data.marginBands}
            emptyLabel="No vehicle has an approved price yet."
          />
        </Panel>

        <Panel
          title="Cost on this desk"
          icon={<Layers size={11} />}
          tone="accent"
          span={5}
          meta={data.queueValue > 0 ? takaCompact(data.queueValue) : undefined}
        >
          <StackBar
            segments={data.costSegments}
            total={data.queueValue}
            emptyLabel="No files are waiting for a price."
          />
        </Panel>

        <QueueAge age={data.age} span={3} />

        <Panel
          title="Thin margins to review"
          icon={<AlertTriangle size={11} />}
          tone="warn"
          span={6}
          meta="below 10%"
        >
          {data.thinFiles.length === 0 ? (
            <p className="insight-empty">
              Every file on this desk carries a proposed margin above 10%. Nothing needs a second
              look on price alone.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.thinFiles.map((f) => (
                <li
                  key={f.id}
                  className="flex items-center gap-2"
                  data-tone={f.marginPct < 0 ? "bad" : "warn"}
                >
                  <span className="bar-dot" aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[11.5px] font-medium leading-tight text-ink">
                      {f.name}
                    </span>
                    <span className="block truncate font-mono text-[9px] leading-tight text-ink-3">
                      {f.regNo}
                    </span>
                  </span>
                  <span
                    className="shrink-0 font-mono text-[12px] font-bold tabular-nums"
                    style={{ color: f.marginPct < 0 ? "var(--bad)" : "var(--warn)" }}
                  >
                    {f.marginPct}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Value by territory" icon={<MapPin size={11} />} tone="accent" span={6}>
          {data.territories.length === 0 ? (
            <p className="insight-empty">No files are waiting for a price.</p>
          ) : (
            <BarList
              slices={data.territories.map((t) => ({
                key: t.name,
                label: t.name,
                count: t.count,
                tone: "accent" as const,
                meta: takaCompact(t.value),
              }))}
              emptyLabel="No files are waiting for a price."
            />
          )}
        </Panel>
      </PanelGrid>
    </InsightBlock>
  );
}

// ---------------------------------------------------------------------------

export function GmInsights({ data }: { data: GmInsight }) {
  const { market } = data;
  return (
    <InsightBlock title="Approval & market insight" meta={`${market.liveCount} live for resale`}>
      <PanelGrid>
        <ReadingStrip readings={data.readings} />

        <Panel
          title="Bids on live stock"
          icon={<Award size={11} />}
          tone={data.bidCoverage.find((s) => s.key === "none")?.count ? "warn" : "ok"}
          span={4}
        >
          <BarList
            slices={data.bidCoverage}
            emptyLabel="Nothing is on the marketplace yet."
          />
          <div className="insight-rule" />
          <p className="text-[11px] leading-snug text-ink-2">
            A live vehicle with no bids is the clearest signal the asking price is wrong.
          </p>
        </Panel>

        <Panel
          title="Marketplace"
          icon={<Store size={11} />}
          tone="accent"
          span={5}
          meta={`${market.soldCount} sold`}
        >
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div className="reading" data-tone="accent">
              <div className="reading-label">Live value</div>
              <div className="reading-value text-[17px]">{takaCompact(market.liveValue)}</div>
              <div className="reading-caption">
                {market.liveCount} {market.liveCount === 1 ? "vehicle" : "vehicles"} listed
              </div>
            </div>
            <div className="reading" data-tone="ok">
              <div className="reading-label">Sold value</div>
              <div className="reading-value text-[17px]">{takaCompact(market.soldValue)}</div>
              <div className="reading-caption">
                {market.soldCount} {market.soldCount === 1 ? "sale" : "sales"} closed
              </div>
            </div>
          </div>
          <div className="insight-rule" />
          <Figure
            value={market.avgDaysOnMarket}
            unit="d"
            caption="Average time a live vehicle has been on the marketplace."
            tone={
              market.avgDaysOnMarket !== null && market.avgDaysOnMarket > 30 ? "warn" : "accent"
            }
            emptyLabel="Nothing is listed yet, so there is no time on market to report."
          />
        </Panel>

        <QueueAge age={data.age} span={3} />

        <Panel
          title="Most active bidders"
          icon={<Users size={11} />}
          tone="accent"
          span={6}
          meta={`${WINDOW_DAYS}d`}
        >
          <Ranked leaders={data.topBidders} emptyLabel="No bids placed in this window." />
        </Panel>

        <Panel title="Price realisation" icon={<TrendingUp size={11} />} tone="ok" span={6}>
          <Figure
            value={market.realisationPct}
            unit="%"
            caption={
              market.realisationPct === null
                ? ""
                : market.realisationPct >= 100
                  ? "Winning bids have averaged above the approved price — the book is priced conservatively."
                  : "Winning bids have averaged below the approved price. The gap is what the market discounted."
            }
            emptyLabel="No sale has closed yet, so there is nothing to compare against the approved price."
          />
        </Panel>
      </PanelGrid>
    </InsightBlock>
  );
}

// ---------------------------------------------------------------------------

export function AdminInsights({ data }: { data: AdminInsight }) {
  return (
    <InsightBlock title="Organisation insight" meta={`activity over ${ACTIVITY_DAYS} days`}>
      <PanelGrid>
        <ReadingStrip readings={data.readings} />

        <Panel
          title="Desk load & oldest wait"
          icon={<Activity size={11} />}
          tone="accent"
          span={6}
          meta="sorted by longest wait"
        >
          {data.deskLoad.length === 0 ? (
            <p className="insight-empty">Nothing is in flight at any desk.</p>
          ) : (
            <BarList
              slices={data.deskLoad.map((d) => ({
                key: d.status,
                label: d.label,
                count: d.count,
                tone: d.tone,
                meta: `${d.oldest}d`,
              }))}
              emptyLabel="Nothing is in flight."
              max={8}
            />
          )}
        </Panel>

        <Panel
          title="What the business did"
          icon={<ClipboardCheck size={11} />}
          tone="ok"
          span={6}
          meta={`${ACTIVITY_DAYS}d`}
        >
          <Columns
            points={data.eventVolume.map((e) => ({
              label: EVENT_SHORT[e.key] ?? e.label,
              value: e.count,
            }))}
            tone="ok"
            emptyLabel="No milestones were recorded this month."
          />
          <div className="insight-rule" />
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1">
            {data.eventVolume.slice(0, 6).map((e) => (
              <li key={e.key} className="flex items-baseline justify-between gap-2">
                <span className="truncate text-[10.5px] text-ink-2">
                  {EVENT_SHORT[e.key] ?? e.label}
                </span>
                <span className="font-mono text-[10.5px] font-semibold tabular-nums text-ink">
                  {e.count}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Grade mix" icon={<BadgeCheck size={11} />} tone="ok" span={4}>
          <BarList slices={data.gradeMix} emptyLabel="Nothing has been graded yet." />
        </Panel>

        <Panel title="Letter ladder" icon={<AlertTriangle size={11} />} tone="warn" span={4}>
          <BarList slices={data.letterMix} emptyLabel="No records on the book." />
        </Panel>

        <Panel
          title="Most active staff"
          icon={<Users size={11} />}
          tone="accent"
          span={4}
          meta={`${ACTIVITY_DAYS}d`}
        >
          <Ranked leaders={data.actors} emptyLabel="Nobody has touched a file this month." />
        </Panel>
      </PanelGrid>
    </InsightBlock>
  );
}

/** Column labels have ~9px to work in, so the audit vocabulary is abbreviated. */
const EVENT_SHORT: Record<string, string> = {
  CAPTURED: "Captured",
  CN_APPROVED: "CN OK",
  ASSESSMENT_SUBMITTED: "Assessed",
  REPAIR_APPROVED: "Repair OK",
  REGISTRATION_COMPLETED: "Reg done",
  PRICE_APPROVED: "Priced",
  PUSHED_LIVE: "Live",
  BID_PLACED: "Bids",
  SALE_AWARDED: "Sold",
};
