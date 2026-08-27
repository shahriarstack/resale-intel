import { redirect } from "next/navigation";
import type { VehicleStatus } from "@prisma/client";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ROLE_META, inboxStatusesForRole } from "@/lib/rbac";
import { STATUS_META } from "@/lib/status";
import { computeBreakdown } from "@/lib/costing";
import { vehicleTitle } from "@/lib/vehicle";
import { Chip } from "@/components/ui/Chip";
import { CountUp } from "@/components/ui/CountUp";
import { AroPipeline } from "@/components/aro/AroPipeline";
import { DeskInbox } from "@/components/desk/DeskInbox";
import { EngineerWorkbench } from "@/components/engineer/EngineerWorkbench";
import { getPipelineInsight } from "@/lib/analytics";
import { PipelineInsight } from "@/components/analytics/PipelineInsight";
import {
  AdminDashboard,
  type ActivityItem,
  type AttentionVehicle,
} from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";

// engineerSelect was here but is now removed

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
  costing: { select: { transportCost: true, otherCost: true, sopCost: true } },
  repairLines: { select: { amount: true } },
  regLines: { select: { amount: true } },
} as const;

type DeskRow = {
  repairLines: { amount: number }[];
  regLines: { amount: number }[];
  costing: { transportCost: number; otherCost: number; sopCost: number } | null;
};

function withTotal<T extends DeskRow>(v: T) {
  const repair = v.repairLines.reduce((s, l) => s + l.amount, 0);
  const reg = v.regLines.reduce((s, l) => s + l.amount, 0);
  const c = v.costing;
  return {
    ...v,
    totalCost: repair + reg + (c ? c.transportCost + c.otherCost + c.sopCost : 0),
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

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const meta = ROLE_META[user.role];

  if (user.role === "SALES_TEAM") redirect("/register");

  if (user.role === "RECOVERY_TEAM") {
    const [vehicles, engineers, totalCaptures] = await Promise.all([
      prisma.vehicle.findMany({
        where: { capturedById: user.id },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
          id: true,
          registrationNo: true,
          make: true,
          model: true,
          status: true,
          letterStage: true,
          isLocked: true,
          assignedEngineerId: true,
          territory: { select: { name: true } },
          assignedEngineer: { select: { name: true } },
        },
      }),
      prisma.user.findMany({
        where: { role: "SERVICE_ENGINEER", isActive: true },
        orderBy: { name: "asc" },
        select: { id: true, name: true, staffId: true },
      }),
      prisma.vehicle.count({ where: { capturedById: user.id } }),
    ]);

    // Capture momentum: the last 30 days against the 30 before it. Only this
    // figure supports a real trend — "active" and "tracking" are point-in-time
    // snapshots with no history to compare against.
    const now = Date.now();
    const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
    const d60 = new Date(now - 60 * 24 * 60 * 60 * 1000);

    const [capturesLast30, capturesPrior30] = await Promise.all([
      prisma.vehicle.count({
        where: { capturedById: user.id, createdAt: { gte: d30 } },
      }),
      prisma.vehicle.count({
        where: { capturedById: user.id, createdAt: { gte: d60, lt: d30 } },
      }),
    ]);

    return (
      <AroPipeline
        vehicles={vehicles}
        engineers={engineers}
        totalCaptures={totalCaptures}
        capturesLast30={capturesLast30}
        capturesPrior30={capturesPrior30}
      />
    );
  }

  if (user.role === "RECOVERY_MANAGER") {
    const vehicles = await prisma.vehicle.findMany({
      where: { status: "CN_REQUESTED" },
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
        capturedBy: { select: { name: true } },
        assignedEngineer: { select: { name: true } },
        territory: { select: { name: true } },
      },
    });
    const insight = await getPipelineInsight();
    return (
      <DeskInbox
        insight={<PipelineInsight data={insight} />}
        title="Credit Note requests"
        subtitle="Review and approve Credit Note requests from the field team."
        vehicles={vehicles}
        columns={["letter", "territory"]}
        quickActions={[
          {
            action: "APPROVE_CN",
            label: "Approve Credit Note",
            short: "Approve",
            tone: "ok",
            detail: "Approves the Credit Note and passes the file to the Service Engineer.",
          },
          {
            action: "DECLINE_CN",
            label: "Decline Credit Note",
            short: "Decline",
            tone: "danger",
            requiresNote: true,
            detail: "Returns the file to the Recovery Team. A reason is required.",
          },
        ]}
      />
    );
  }

  if (user.role === "SERVICE_ENGINEER") {
    const { getEngineerWorkbench } = await import("@/lib/engineer");
    const { vehicles, metrics } = await getEngineerWorkbench(user.id);
    return <EngineerWorkbench vehicles={vehicles} metrics={metrics} firstName={firstName(user.name)} />;
  }

  if (user.role === "SERVICE_HEAD") {
    const rows = await prisma.vehicle.findMany({
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
        capturedBy: { select: { name: true } },
        assignedEngineer: { select: { name: true } },
        territory: { select: { name: true } },
        costing: { select: { transportCost: true, otherCost: true } },
        repairLines: { select: { amount: true } },
      },
    });
    const vehicles = rows.map((v) => ({
      ...v,
      totalCost:
        v.repairLines.reduce((s, l) => s + l.amount, 0) +
        (v.costing?.transportCost ?? 0) +
        (v.costing?.otherCost ?? 0),
    }));
    const insight = await getPipelineInsight();
    return (
      <DeskInbox
        insight={<PipelineInsight data={insight} />}
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
    const insight = await getPipelineInsight();
    return (
      <DeskInbox
        insight={<PipelineInsight data={insight} />}
        title="Registration queue"
        subtitle="Add registration-related costs for repair-approved vehicles."
        vehicles={await deskInboxProps("REPAIR_APPROVED")}
        columns={["engineer", "cost"]}
        actionLabel="Register"
      />
    );
  }

  if (user.role === "SR_EXECUTIVE") {
    const insight = await getPipelineInsight();
    return (
      <DeskInbox
        insight={<PipelineInsight data={insight} />}
        title="SOP & pricing"
        subtitle="Set the SOP cost, grade the condition and propose a selling price for approval."
        vehicles={await deskInboxProps("REGISTRATION_DONE")}
        columns={["territory", "cost"]}
        actionLabel="Price it"
      />
    );
  }

  if (user.role === "AGM_DGM") {
    const insight = await getPipelineInsight();
    return (
      <DeskInbox
        insight={<PipelineInsight data={insight} />}
        title="Price approvals"
        subtitle="Review the full cost breakdown and set the approved selling price."
        vehicles={await deskInboxProps("SOP_ADDED")}
        columns={["territory", "cost"]}
        actionLabel="Set price"
      />
    );
  }

  if (user.role === "GM_SR_GM") {
    const insight = await getPipelineInsight();
    return (
      <DeskInbox
        insight={<PipelineInsight data={insight} />}
        title="Final approvals"
        subtitle="Give the final sign-off to push a vehicle live for resale."
        vehicles={await deskInboxProps("PRICE_APPROVED")}
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
            label: "Send back to AGM / DGM",
            short: "Send back",
            tone: "danger",
            requiresNote: true,
            detail: "Returns the file to AGM / DGM to revise the price.",
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
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7 sm:py-8">
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

async function SuperAdminDashboard({ name }: { name: string }) {
  const [vehicles, recentEvents, userGroups] = await Promise.all([
    prisma.vehicle.findMany({
      select: {
        id: true,
        registrationNo: true,
        make: true,
        model: true,
        status: true,
        isLocked: true,
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
        repairLines: { select: { amount: true } },
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
        vehicle: { select: { registrationNo: true, make: true, model: true } },
        actor: { select: { name: true, role: true } },
      },
    }),
    prisma.user.groupBy({
      by: ["role"],
      _count: { _all: true },
      where: { isActive: true },
    }),
  ]);

  const now = Date.now();
  // Model is the heading; the make is near-constant across the fleet.
  const label = (make: string | null, model: string | null) => vehicleTitle({ make, model });

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

    const cost = computeBreakdown(v.costing, v.repairLines, v.regLines);
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
        name: label(v.make, v.model),
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
    vehicleName: label(e.vehicle.make, e.vehicle.model),
    regNo: e.vehicle.registrationNo,
    actorName: e.actor?.name ?? null,
    actorRole: e.actor?.role ?? null,
    note: e.note,
    fromStatus: e.fromStatus,
    toStatus: e.toStatus,
  }));

  const insight = await getPipelineInsight();

  return (
    <AdminDashboard
      insight={<PipelineInsight data={insight} />}
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
      generatedAt={new Date().toISOString()}
    />
  );
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
