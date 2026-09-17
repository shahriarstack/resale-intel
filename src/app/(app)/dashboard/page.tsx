import { redirect } from "next/navigation";
import type { VehicleStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_META, inboxStatusesForRole, roleLabel } from "@/lib/rbac";
import { STATUS_META } from "@/lib/status";
import { computeBreakdown } from "@/lib/costing";
import { accountTitle } from "@/lib/vehicle";
import { Chip } from "@/components/ui/Chip";
import { CountUp } from "@/components/ui/CountUp";
import { AroDashboard } from "@/components/aro/AroDashboard";
import { ManagerDashboard } from "@/components/recovery/ManagerDashboard";
import { getAroBook, getManagerBook } from "@/lib/recoveryDesk";
import { summariseByTerritory } from "@/lib/recoveryRollup";
import { DeskInbox } from "@/components/desk/DeskInbox";
import { EngineerWorkbench } from "@/components/engineer/EngineerWorkbench";
import { getPipelineInsight } from "@/lib/analytics";
import { getEngineerWorkload } from "@/lib/repairs";
import { parseRange } from "@/lib/coverage";
import {
  getAdminInsight,
  getAgmInsight,
  getGmInsight,
  getServiceHeadInsight,
  getSrExecutiveInsight,
} from "@/lib/insights";
import { getEngineerWorkbench } from "@/lib/engineer";
import { getEngineerScorecard, getTeamScorecard } from "@/lib/scorecard";
import { getRegistrationValidityBoard } from "@/lib/registrationValidityBoard";
import { ApprovedHistory } from "@/components/desk/ApprovedHistory";
import { ValidityBoard } from "@/components/registration/ValidityBoard";
import { TeamScorecard } from "@/components/scorecard/TeamScorecard";
import { HeadInsightTabs } from "@/components/head/HeadInsightTabs";
import { PipelineInsight } from "@/components/analytics/PipelineInsight";
import {
  AdminInsights,
  AgmInsights,
  GmInsights,
  ServiceHeadInsights,
  SrExecutiveInsights,
} from "@/components/analytics/DeskInsights";
import { EngineerWorkloadTable } from "@/components/repairs/EngineerWorkloadTable";
import {
  AdminDashboard,
  type ActivityItem,
  type AttentionVehicle,
} from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

const deskSelect = {
  id: true,
  registrationNo: true,
  make: true,
  model: true,
  customerName: true,
  letterStage: true,
  status: true,
  createdAt: true,
  // Drives desk ageing / overdue detection in the workspace.
  repairDeadline: true,
  capturedBy: { select: { name: true } },
  assignedEngineer: { select: { name: true } },
  territory: { select: { name: true } },
  costing: {
    select: { repairCost: true, transportCost: true, otherCost: true, sopCost: true },
  },
  regLines: { select: { amount: true } },
} as const;

type DeskRow = {
  regLines: { amount: number }[];
  costing: {
    repairCost: number;
    transportCost: number;
    otherCost: number;
    sopCost: number;
  } | null;
};

function withTotal<T extends DeskRow>(v: T) {
  const reg = v.regLines.reduce((s, l) => s + l.amount, 0);
  const c = v.costing;
  return {
    ...v,
    totalCost: reg + (c ? c.repairCost + c.transportCost + c.otherCost + c.sopCost : 0),
  };
}

async function deskInboxProps(status: VehicleStatus) {
  const rows = await prisma.vehicle.findMany({
    where: { status },
    orderBy: { createdAt: "asc" },
    select: deskSelect,
  });
  return rows.map(withTotal);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  // Only the Service Manager branch reads this today, but it is parsed here so
  // the URL stays the single home for the window rather than being threaded
  // through a client component's state.
  const { from, to } = await searchParams;
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const meta = ROLE_META[user.role];

  if (user.role === "SALES_TEAM") redirect("/register");
  // A portal viewer holds no desk, so there is no inbox to build them one
  // from. Their whole application is the lens attached to their account.
  if (user.role === "PORTAL_VIEWER") redirect("/portal");

  if (user.role === "RECOVERY_TEAM") {
    // One read for the officer's whole book — captures, capture requests and
    // off-road cases. Assembled in lib/recoveryDesk so the panel receives
    // countdowns and letter schedules already derived, rather than three raw
    // tables and the arithmetic to reconcile them.
    const book = await getAroBook(user.id);
    return <AroDashboard book={book} firstName={firstName(user.name)} />;
  }

  if (user.role === "RECOVERY_MANAGER") {
    // Summary, exceptions and analysis. Every queue this desk works has its
    // own route now, so the dashboard reads rather than transacts.
    const book = await getManagerBook();
    // The three populations that make up "off the road" and "waiting on us".
    // All already in memory from the one read above.
    // The roster goes in with the three books: a territory here IS an officer,
    // so the roll-up carries the name to ring rather than leaving the manager
    // to remember whose patch Sylhet is.
    const territory = summariseByTerritory(
      book.pipelineCaptures,
      [...book.openCases, ...book.closedCases],
      [...book.pendingRequests, ...book.decidedRequests],
      book.aroRoster,
    );
    return <ManagerDashboard book={book} territory={territory} />;
  }

  if (user.role === "SERVICE_ENGINEER") {
    // The scorecard is fetched here rather than lazily on first tap so the
    // "My month" section opens already populated — a metric surface that shows
    // a spinner every time is one people stop opening.
    const [{ vehicles, metrics }, scorecard] = await Promise.all([
      getEngineerWorkbench(user.id),
      getEngineerScorecard(user.id),
    ]);
    return (
      <EngineerWorkbench
        vehicles={vehicles}
        metrics={metrics}
        firstName={firstName(user.name)}
        scorecard={scorecard}
      />
    );
  }

  if (user.role === "SERVICE_HEAD") {
    const range = parseRange(from, to);
    const [rows, insight, workload, scorecard] = await Promise.all([
      prisma.vehicle.findMany({
        where: { status: "COST_SUBMITTED" },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          registrationNo: true,
          make: true,
          model: true,
          customerName: true,
          letterStage: true,
          status: true,
          createdAt: true,
          repairDeadline: true,
          capturedBy: { select: { name: true } },
          assignedEngineer: { select: { name: true } },
          territory: { select: { name: true } },
          costing: { select: { repairCost: true, transportCost: true, otherCost: true } },
        },
      }),
      getServiceHeadInsight(),
      getEngineerWorkload(range),
      getTeamScorecard(),
    ]);
    const vehicles = rows.map((v) => ({
      ...v,
      totalCost:
        (v.costing?.repairCost ?? 0) +
        (v.costing?.transportCost ?? 0) +
        (v.costing?.otherCost ?? 0),
    }));
    return (
      <DeskInbox
        insight={
          <>
            <HeadInsightTabs
              workload={
                <EngineerWorkloadTable
                  rows={workload}
                  from={range.from ? toDateInput(range.from) : ""}
                  to={range.to ? toDateInput(range.to) : ""}
                />
              }
              scorecard={<TeamScorecard initial={scorecard} />}
              insight={<ServiceHeadInsights data={insight} />}
            />
            <ApprovedHistory />
          </>
        }
        title="Repair approvals"
        subtitle="Review engineer cost analysis, then approve and set a repair deadline."
        vehicles={vehicles}
        columns={["engineer", "cost"]}
        actionLabel="Review"
        quickActions={[
          {
            action: "SEND_BACK_TO_ENGINEER",
            label: "Send back to engineer",
            short: "Send back",
            tone: "danger",
            requiresNote: true,
            detail: "Returns the file to the engineer to revise the assessment.",
          },
        ]}
      />
    );
  }

  if (user.role === "REGISTRATION_TEAM") {
    const [vehicles, validity] = await Promise.all([
      deskInboxProps("REPAIR_APPROVED"),
      getRegistrationValidityBoard(),
    ]);
    return (
      <DeskInbox
        title="Registration queue"
        subtitle="Add registration-related costs for repair-approved vehicles."
        vehicles={vehicles}
        columns={["engineer", "cost"]}
        actionLabel="Register"
        insight={
          <>
            <ApprovedHistory />
            <ValidityBoard initial={validity} />
          </>
        }
      />
    );
  }

  if (user.role === "SR_EXECUTIVE") {
    const [vehicles, insight] = await Promise.all([
      deskInboxProps("REGISTRATION_DONE"),
      getSrExecutiveInsight(),
    ]);
    return (
      <DeskInbox
        insight={
          <>
            <SrExecutiveInsights data={insight} />
            <ApprovedHistory />
          </>
        }
        title="SOP & pricing"
        subtitle="Set the SOP cost, grade the condition and propose a selling price for approval."
        vehicles={vehicles}
        columns={["territory", "cost"]}
        actionLabel="Price it"
      />
    );
  }

  if (user.role === "AGM_DGM") {
    // Two blocks, in the order this desk actually thinks: the pricing reading
    // that governs the decision in front of them, then the pipeline behind it.
    const [vehicles, agm, pipeline] = await Promise.all([
      deskInboxProps("SOP_ADDED"),
      getAgmInsight(),
      getPipelineInsight(),
    ]);
    return (
      <DeskInbox
        insight={
          <>
            <AgmInsights data={agm} />
            <PipelineInsight data={pipeline} />
            <ApprovedHistory />
          </>
        }
        title="Price approvals"
        subtitle="Review the full cost breakdown and set the approved selling price."
        vehicles={vehicles}
        columns={["territory", "cost"]}
        actionLabel="Set price"
      />
    );
  }

  if (user.role === "GM_SR_GM") {
    const [vehicles, gm, pipeline] = await Promise.all([
      deskInboxProps("PRICE_APPROVED"),
      getGmInsight(),
      getPipelineInsight(),
    ]);
    return (
      <DeskInbox
        insight={
          <>
            <GmInsights data={gm} />
            <PipelineInsight data={pipeline} />
            <ApprovedHistory />
          </>
        }
        title="Final approvals"
        subtitle="Give the final sign-off to push a vehicle live for resale."
        vehicles={vehicles}
        columns={["territory", "cost"]}
        actionLabel="Review"
        quickActions={[
          {
            action: "PUSH_LIVE",
            label: "Approve for resale",
            short: "Approve",
            tone: "ok",
            detail: "Marks the vehicle live for resale. This is the final approval.",
          },
          {
            action: "SEND_BACK_TO_AGM",
            label: `Send back to ${roleLabel("AGM_DGM")}`,
            short: "Send back",
            tone: "danger",
            requiresNote: true,
            detail: `Returns the file to ${roleLabel("AGM_DGM")} to revise the price.`,
          },
        ]}
      />
    );
  }

  if (user.role === "SUPER_ADMIN") {
    return <SuperAdminDashboard name={user.name} />;
  }

  const inboxStatuses = inboxStatusesForRole(user.role);

  const inboxCount =
    inboxStatuses.length > 0
      ? await prisma.vehicle.count({ where: { status: { in: inboxStatuses } } })
      : 0;

  return (
    <div className="mx-auto w-full max-w-6xl px-5 py-7 sm:px-7 sm:py-8">
      <header className="mb-6" style={{ animation: "fadeIn 0.32s var(--ease-out-quart)" }}>
        <div className="eyebrow">{meta.designations !== "—" ? meta.designations : "Administrator"}</div>
        <h1 className="page-title mt-1 text-[28px] sm:text-[32px]">
          {greeting()}, {firstName(user.name)}.
        </h1>
        <p className="mt-1.5 max-w-prose text-[14px] text-ink-2">
          {inboxStatuses.length > 0
            ? "Files waiting for your action are shown below."
            : "Your workspace is ready."}
        </p>
      </header>

      {inboxStatuses.length > 0 && (
        <section
          className="mb-8"
          style={{ animation: "slideUp 0.4s var(--ease-out-quart) 0.05s both" }}
        >
          <div className="card-elevated flex items-center justify-between gap-6 p-5">
            <div>
              <div className="label mb-1.5">Awaiting your action</div>
              <div className="font-display text-[42px] font-bold leading-none tnum text-ink">
                <CountUp value={inboxCount} />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {inboxStatuses.map((s) => (
                <Chip key={s} tone={STATUS_META[s].tone}>
                  {STATUS_META[s].label}
                </Chip>
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Super Admin oversight — reads the whole book and derives the roll-ups.
// Read-only: every figure is computed from existing rows via computeBreakdown.
// ---------------------------------------------------------------------------

const TERMINAL: VehicleStatus[] = ["RELEASED", "LIVE_FOR_RESALE", "SOLD"];
const DAY_MS = 1000 * 60 * 60 * 24;
const STALL_DAYS = 7;

/**
 * Everything the admin overview reads, in one round trip.
 *
 * The clock read lives here rather than in the component body. This runs once
 * per request as a data fetch — which is what a data function is for — and
 * keeping impure calls out of render bodies leaves the rule meaningful in the
 * client components that genuinely do re-render.
 */
async function loadAdminBook() {
  const [vehicles, recentEvents, userGroups, pipeline, org] = await Promise.all([
    prisma.vehicle.findMany({
      select: {
        id: true,
        registrationNo: true,
        customerName: true,
        customerCode: true,
        make: true,
        model: true,
        status: true,
        isLocked: true,
        asIs: true,
        updatedAt: true,
        repairDeadline: true,
        territory: { select: { name: true } },
        costing: {
          select: {
            transportCost: true,
            otherCost: true,
            sopCost: true,
            approvedPrice: true,
          },
        },
        regLines: { select: { amount: true } },
      },
    }),
    prisma.vehicleEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: 12,
      select: {
        id: true,
        type: true,
        createdAt: true,
        note: true,
        vehicleId: true,
        fromStatus: true,
        toStatus: true,
        vehicle: {
          select: {
            registrationNo: true,
            customerName: true,
            customerCode: true,
            make: true,
            model: true,
          },
        },
        actor: { select: { name: true, role: true } },
      },
    }),
    prisma.user.groupBy({
      by: ["role"],
      _count: { _all: true },
      where: { isActive: true },
    }),
    getPipelineInsight(),
    getAdminInsight(),
  ]);

  return {
    vehicles,
    recentEvents,
    userGroups,
    pipeline,
    org,
    now: Date.now(),
    generatedAt: new Date().toISOString(),
  };
}

async function SuperAdminDashboard({ name }: { name: string }) {
  const { vehicles, recentEvents, userGroups, pipeline, org, now, generatedAt } =
    await loadAdminBook();

  // The account is the heading on every operations screen — the Super Admin
  // book is no exception, and the attention lists here are the same vehicles
  // the desks are looking at. See the note at the top of lib/vehicle.ts.
  const label = (v: { customerCode?: string | null; customerName?: string | null }) =>
    accountTitle(v);

  // --- roll-ups ------------------------------------------------------------
  const byStatus = new Map<VehicleStatus, number>();
  const byTerritory = new Map<string, { count: number; value: number }>();
  const overdue: AttentionVehicle[] = [];
  const stalled: AttentionVehicle[] = [];

  let capitalDeployed = 0;
  let portfolioValue = 0;
  let realisedMargin = 0;
  let marginPctSum = 0;
  let marginPctCount = 0;
  let locked = 0;

  for (const v of vehicles) {
    byStatus.set(v.status, (byStatus.get(v.status) ?? 0) + 1);
    if (v.isLocked) locked++;

    const cost = computeBreakdown(v.costing, v.regLines, v.asIs);
    const inFlight = !TERMINAL.includes(v.status);

    if (inFlight) capitalDeployed += cost.total;
    if (v.status === "LIVE_FOR_RESALE") {
      portfolioValue += cost.approvedPrice ?? 0;
      if (cost.margin !== null) realisedMargin += cost.margin;
    }
    if (cost.marginPct !== null) {
      marginPctSum += cost.marginPct;
      marginPctCount++;
    }

    if (v.status !== "RELEASED") {
      const key = v.territory?.name ?? "Unassigned";
      const prev = byTerritory.get(key) ?? { count: 0, value: 0 };
      byTerritory.set(key, { count: prev.count + 1, value: prev.value + cost.total });
    }

    if (inFlight) {
      const base: Omit<AttentionVehicle, "days"> = {
        id: v.id,
        name: label(v),
        regNo: v.registrationNo,
        status: v.status,
        territory: v.territory?.name ?? null,
      };

      if (v.repairDeadline && v.repairDeadline.getTime() < now) {
        overdue.push({
          ...base,
          days: Math.floor((now - v.repairDeadline.getTime()) / DAY_MS),
        });
      }

      const idle = Math.floor((now - v.updatedAt.getTime()) / DAY_MS);
      if (idle >= STALL_DAYS) stalled.push({ ...base, days: idle });
    }
  }

  overdue.sort((a, b) => b.days - a.days);
  stalled.sort((a, b) => b.days - a.days);

  const all = vehicles.length;
  const released = byStatus.get("RELEASED") ?? 0;
  const live = byStatus.get("LIVE_FOR_RESALE") ?? 0;
  const soldCount = byStatus.get("SOLD") ?? 0;

  const events: ActivityItem[] = recentEvents.map((e) => ({
    id: e.id,
    type: e.type,
    createdAt: e.createdAt.toISOString(),
    vehicleId: e.vehicleId,
    vehicleName: label(e.vehicle),
    regNo: e.vehicle.registrationNo,
    actorName: e.actor?.name ?? null,
    actorRole: e.actor?.role ?? null,
    note: e.note,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
  }));

  return (
    <AdminDashboard
      insight={
        <>
          <AdminInsights data={org} />
          <PipelineInsight data={pipeline} />
        </>
      }
      greeting={greeting()}
      firstName={firstName(name)}
      totals={{
        all,
        active: all - released - live - soldCount,
        live,
        released,
        sold: soldCount,
        locked,
      }}
      money={{
        portfolioValue,
        capitalDeployed,
        realisedMargin,
        avgMarginPct: marginPctCount > 0 ? marginPctSum / marginPctCount : null,
      }}
      pipeline={(Object.keys(STATUS_META) as VehicleStatus[]).map((status) => ({
        status,
        count: byStatus.get(status) ?? 0,
      }))}
      overdue={overdue.slice(0, 8)}
      stalled={stalled.slice(0, 8)}
      territories={[...byTerritory.entries()]
        .map(([name, t]) => ({ name, count: t.count, value: t.value }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 6)}
      roster={userGroups
        .map((g) => ({
          role: g.role,
          label: ROLE_META[g.role].label,
          count: g._count._all,
        }))
        .sort((a, b) => b.count - a.count)}
      events={events}
      generatedAt={generatedAt}
    />
  );
}

/** `<input type="date">` wants local YYYY-MM-DD, not an ISO instant. */
function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function firstName(name: string): string {
  return name.split(" ")[0] || name;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}
