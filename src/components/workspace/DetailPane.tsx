"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  X,
  ArrowUpRight,
  Loader2,
  MapPin,
  User,
  Wrench,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import type { VehicleStatus, LetterStage } from "@prisma/client";
import { getJSON } from "@/lib/http";
import { Chip } from "@/components/ui/Chip";
import { STATUS_META, LETTER_META } from "@/lib/status";
import { taka, shortDate, dateTime, timeAgo } from "@/lib/format";
import { vehicleTitle, vehicleMake } from "@/lib/vehicle";
import { gradeSla } from "@/lib/sla";
import { GRADE_META } from "@/lib/grades";
import type { QuickAction, WorkspaceVehicle } from "./types";

interface CostLine {
  id: string;
  description: string;
  amount: number;
}

interface EventRow {
  id: string;
  type: string;
  note: string | null;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
  actor: { name: string } | null;
}

interface VehicleDetail {
  id: string;
  registrationNo: string;
  make: string | null;
  model: string | null;
  year: number | null;
  mileage: string | null;
  customerName: string;
  customerCode: string | null;
  status: VehicleStatus;
  letterStage: LetterStage;
  grade: "A" | "B" | "C" | "D" | null;
  createdAt: string;
  capturedBy: { name: string; staffId: string } | null;
  assignedEngineer: { name: string; staffId: string } | null;
  territory: { name: string } | null;
  currentLocation: { name: string } | null;
  repairDeadline: string | null;
  costing: {
    transportCost: number;
    otherCost: number;
    sopCost: number;
    approvedPrice: number | null;
  } | null;
  repairLines: CostLine[];
  regLines: CostLine[];
  photos: { id: string; url: string; slot: string }[];
  events: EventRow[];
}

/**
 * The right-hand pane of the workspace.
 *
 * Read-only by design apart from the desk's own quick actions: it exists so a
 * desk owner can decide without leaving the queue. Anything that needs the
 * full record — photo evidence, the costing editors, the audit trail in
 * full — is one click away on the vehicle page, which stays the single place
 * those live rather than being half-reimplemented here.
 */
export function DetailPane({
  vehicle,
  quickActions,
  onClose,
  onAction,
}: {
  vehicle: WorkspaceVehicle;
  quickActions: QuickAction[];
  onClose: () => void;
  onAction: (a: QuickAction) => void;
}) {
  const [data, setData] = useState<VehicleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  // No reset of data/error here: the workspace mounts this with a key of the
  // vehicle id, so selecting a different record gives a fresh component and
  // a fresh loading state without a synchronous setState cascade.
  useEffect(() => {
    let live = true;
    getJSON<VehicleDetail>(`/api/vehicles/${vehicle.id}`)
      .then((d) => {
        if (live) setData(d);
      })
      .catch((e: Error) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [vehicle.id]);

  const sla = gradeSla(vehicle.createdAt, data?.repairDeadline);

  const repair = data?.repairLines.reduce((s, l) => s + l.amount, 0) ?? 0;
  const reg = data?.regLines.reduce((s, l) => s + l.amount, 0) ?? 0;
  const c = data?.costing;
  const total = repair + reg + (c ? c.transportCost + c.otherCost + c.sopCost : 0);

  return (
    <aside className="ws-detail" aria-label="Vehicle detail">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b border-rule bg-[var(--surface-alpha-strong)] px-4 py-3 backdrop-blur-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate font-display text-[19px] font-bold leading-tight tracking-tight text-ink">
                {vehicleTitle(vehicle)}
              </h2>
              {data?.grade && (
                <Chip tone={GRADE_META[data.grade].tone}>{data.grade}</Chip>
              )}
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-ink-3">
              {vehicle.registrationNo}
              {vehicleMake(vehicle) ? ` · ${vehicleMake(vehicle)}` : ""}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-3 transition-colors hover:bg-surface-2 hover:text-ink"
            aria-label="Close detail"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          <Chip tone={STATUS_META[vehicle.status].tone}>
            {STATUS_META[vehicle.status].label}
          </Chip>
          <Chip tone={LETTER_META[vehicle.letterStage].tone}>
            {LETTER_META[vehicle.letterStage].label}
          </Chip>
          <span
            className="flex items-center gap-1.5 font-mono text-[10.5px] text-ink-3"
            style={{ ["--sla-color" as string]: sla.color ?? "var(--ink-3)" }}
          >
            <span className="sla-dot" />
            {sla.label}
          </span>
        </div>
      </div>

      {error ? (
        <div className="grid place-items-center gap-2 px-4 py-12 text-center">
          <AlertTriangle size={22} className="text-warn" />
          <p className="text-[13px] text-ink-2">{error}</p>
        </div>
      ) : !data ? (
        <div className="grid place-items-center gap-2 px-4 py-16">
          <Loader2 size={20} className="animate-spin text-ink-3" />
          <p className="font-mono text-[11px] text-ink-3">Loading record</p>
        </div>
      ) : (
        <div className="px-4 pb-4">
          {/* Overdue is the one thing that must not be scrolled past. */}
          {sla.overdue && (
            <div
              className="mt-3 flex items-start gap-2.5 rounded-[10px] px-3 py-2.5"
              style={{ background: "var(--bad-soft)" }}
            >
              <AlertTriangle size={15} className="mt-px shrink-0 text-bad" />
              <div>
                <p className="text-[12.5px] font-semibold text-bad">{sla.label}</p>
                {data?.repairDeadline && (
                  <p className="mt-0.5 font-mono text-[10.5px] text-ink-2">
                    Committed {shortDate(data.repairDeadline)}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Facts */}
          <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
            <Fact icon={<User size={13} />} label="Customer" value={data.customerName} />
            <Fact
              icon={<MapPin size={13} />}
              label="Territory"
              value={data.territory?.name ?? "—"}
            />
            <Fact
              icon={<Wrench size={13} />}
              label="Engineer"
              value={data.assignedEngineer?.name ?? "Unassigned"}
            />
            <Fact
              icon={<CalendarDays size={13} />}
              label="Captured"
              value={shortDate(data.createdAt)}
            />
          </dl>

          {/* Costing — the figure most desks are deciding on. */}
          {total > 0 && (
            <div className="mt-4 rounded-[10px] border border-rule bg-surface-2 p-3">
              <div className="eyebrow">Cost to date</div>
              <div className="mt-1.5 font-display text-[25px] font-bold leading-none tnum text-ink">
                {taka(total)}
              </div>
              <div className="mt-2.5 space-y-1">
                <CostRow label="Repair" value={repair} />
                <CostRow label="Registration" value={reg} />
                <CostRow label="Transport" value={c?.transportCost ?? 0} />
                <CostRow label="Other" value={c?.otherCost ?? 0} />
                <CostRow label="SOP" value={c?.sopCost ?? 0} />
              </div>
              {c?.approvedPrice != null && (
                <div className="mt-2.5 flex items-baseline justify-between border-t border-rule pt-2.5">
                  <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
                    Price
                  </span>
                  <span className="tnum text-[14px] font-bold text-accent">
                    {taka(c.approvedPrice)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Recent history — the last few moves, not the whole trail. */}
          {data.events.length > 0 && (
            <div className="mt-4">
              <div className="eyebrow">Recent activity</div>
              <ol className="mt-2 space-y-2.5">
                {data.events.slice(0, 5).map((e) => (
                  <li key={e.id} className="flex gap-2.5">
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: "var(--rule-strong)" }}
                    />
                    <div className="min-w-0">
                      <p className="text-[12.5px] leading-snug text-ink-2">
                        <span className="font-semibold text-ink">
                          {e.actor?.name ?? "System"}
                        </span>{" "}
                        {humanEvent(e)}
                      </p>
                      <p
                        className="font-mono text-[10px] text-ink-3"
                        title={dateTime(e.createdAt)}
                      >
                        {timeAgo(e.createdAt)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* Actions pinned to the bottom of the pane */}
      <div className="sticky bottom-0 border-t border-rule bg-[var(--surface-alpha-strong)] p-3 backdrop-blur-xl">
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <button
              key={a.action}
              className={`btn btn-sm flex-1 ${
                a.tone === "danger"
                  ? "btn-danger"
                  : a.tone === "ok"
                    ? "btn-ok"
                    : "btn-primary"
              }`}
              onClick={() => onAction(a)}
            >
              {a.short}
            </button>
          ))}
        </div>
        <Link
          href={`/vehicles/${vehicle.id}`}
          className="btn btn-ghost btn-sm btn-block mt-2"
        >
          Open full record <ArrowUpRight size={14} />
        </Link>
      </div>
    </aside>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-ink-3">
        <span className="text-ink-3">{icon}</span>
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-[13px] font-medium text-ink">{value}</dd>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: number }) {
  if (!value) return null;
  return (
    <div className="flex items-baseline justify-between">
      <span className="font-mono text-[10.5px] uppercase tracking-wider text-ink-3">
        {label}
      </span>
      <span className="tnum text-[12.5px] text-ink-2">{taka(value)}</span>
    </div>
  );
}

/** Turn an audit row into a readable sentence fragment. */
function humanEvent(e: EventRow): string {
  const verb = e.type
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/^cn /, "CN ");
  if (e.field && e.oldValue && e.newValue) {
    return `${verb} — ${e.field}: ${e.oldValue} to ${e.newValue}`;
  }
  return e.note ? `${verb} — ${e.note}` : verb;
}
