"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { EventType, VehicleStatus } from "@prisma/client";
import {
  Camera,
  Pencil,
  Mail,
  UserPlus,
  LogOut,
  Send,
  CheckCircle2,
  XCircle,
  ClipboardList,
  Wrench,
  Undo2,
  FileCheck,
  Calculator,
  Star,
  Tag,
  BadgeCheck,
  RefreshCw,
  Rocket,
  Lock,
  Unlock,
  Gavel,
  Trophy,
  Activity,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { EVENT_META } from "@/lib/events";
import { STATUS_META, type Tone } from "@/lib/status";
import { timeAgo, dateTime } from "@/lib/format";

export interface FeedEvent {
  id: string;
  type: EventType;
  createdAt: string;
  actorName: string | null;
  note: string | null;
  fromStatus?: VehicleStatus | null;
  toStatus?: VehicleStatus | null;
  /** Set when the feed spans many vehicles (e.g. the admin dashboard). */
  vehicleId?: string;
  vehicleName?: string;
  regNo?: string;
}

const ICONS: Record<EventType, LucideIcon> = {
  CAPTURED: Camera,
  FIELD_EDITED: Pencil,
  LETTER_UPDATED: Mail,
  ENGINEER_ASSIGNED: UserPlus,
  RELEASED: LogOut,
  CN_REQUESTED: Send,
  CN_APPROVED: CheckCircle2,
  CN_DECLINED: XCircle,
  ASSESSMENT_SUBMITTED: ClipboardList,
  REPAIR_APPROVED: Wrench,
  REPAIR_SENT_BACK: Undo2,
  REGISTRATION_COMPLETED: FileCheck,
  SOP_SET: Calculator,
  SOP_UPDATED: Calculator,
  GRADED: Star,
  PRICE_SET: Tag,
  PRICE_APPROVED: BadgeCheck,
  PRICE_REVISED: RefreshCw,
  PUSHED_LIVE: Rocket,
  SENT_BACK: Undo2,
  LOCKED: Lock,
  UNLOCKED: Unlock,
  BID_PLACED: Gavel,
  SALE_AWARDED: Trophy,
};

function toneColor(tone: Tone): string {
  switch (tone) {
    case "accent": return "var(--accent)";
    case "ok": return "var(--ok)";
    case "warn": return "var(--warn)";
    case "bad": return "var(--bad)";
    default: return "var(--ink-3)";
  }
}
function toneSoft(tone: Tone): string {
  switch (tone) {
    case "accent": return "var(--accent-soft)";
    case "ok": return "var(--ok-soft)";
    case "warn": return "var(--warn-soft)";
    case "bad": return "var(--bad-soft)";
    default: return "var(--surface-3)";
  }
}

function initials(name: string): string {
  return name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/** Stable per-day key, so grouping does not depend on "now". */
function dayKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayHeading(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ActivityFeed({
  events,
  showVehicle = false,
  emptyLabel = "No activity recorded yet.",
}: {
  events: FeedEvent[];
  showVehicle?: boolean;
  emptyLabel?: string;
}) {
  // Relative times and Today/Yesterday depend on the clock, so they are only
  // rendered once mounted — the server pass shows absolute dates instead.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setMounted(true), 60_000);
    return () => clearInterval(t);
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, FeedEvent[]>();
    for (const e of events) {
      const k = dayKey(e.createdAt);
      const list = map.get(k);
      if (list) list.push(e);
      else map.set(k, [e]);
    }
    return [...map.entries()].map(([key, items]) => ({ key, items }));
  }, [events]);

  if (events.length === 0) {
    return (
      <div className="grid place-items-center gap-2 py-10 text-center">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-surface-3 text-ink-3">
          <Activity size={18} />
        </span>
        <p className="text-sm text-ink-3">{emptyLabel}</p>
      </div>
    );
  }

  let n = 0;
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="mb-2.5 flex items-center gap-2.5">
            <span
              className="font-mono text-[10px] uppercase tracking-wider text-ink-3"
              suppressHydrationWarning
            >
              {dayHeading(g.items[0].createdAt)}
            </span>
            <span className="h-px flex-1 bg-rule" />
            <span className="font-mono text-[10px] text-ink-3">{g.items.length}</span>
          </div>

          <ol className="relative flex flex-col border-l border-rule pl-0">
            {g.items.map((e) => (
              <FeedRow
                key={e.id}
                event={e}
                showVehicle={showVehicle}
                mounted={mounted}
                index={n++}
              />
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

function FeedRow({
  event: e,
  showVehicle,
  mounted,
  index,
}: {
  event: FeedEvent;
  showVehicle: boolean;
  mounted: boolean;
  index: number;
}) {
  const meta = EVENT_META[e.type];
  const Icon = ICONS[e.type] ?? Activity;
  const moved = e.fromStatus && e.toStatus && e.fromStatus !== e.toStatus;

  return (
    <li
      className="relative pb-4 pl-5 last:pb-0"
      style={{ animation: `slideInRight 0.2s ease ${Math.min(index, 12) * 0.03}s both` }}
    >
      {/* icon sits on the rail */}
      <span
        className="absolute -left-[13px] top-0 grid h-[26px] w-[26px] place-items-center rounded-full border-2"
        style={{
          background: toneSoft(meta.tone),
          color: toneColor(meta.tone),
          borderColor: "var(--surface)",
        }}
      >
        <Icon size={13} strokeWidth={2.4} />
      </span>

      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-sm font-semibold text-ink">{meta.label}</span>
        <span className="font-mono text-[10px] text-ink-3" suppressHydrationWarning>
          {mounted ? timeAgo(e.createdAt) : dateTime(e.createdAt)}
        </span>
      </div>

      {/* status hop */}
      {moved && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <StatusPill status={e.fromStatus!} muted />
          <ArrowRight size={11} className="text-ink-3" />
          <StatusPill status={e.toStatus!} />
        </div>
      )}

      {showVehicle && e.vehicleId && (
        <Link
          href={`/vehicles/${e.vehicleId}`}
          className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-accent transition-opacity hover:opacity-70"
        >
          {e.regNo}
          <span className="text-ink-3">·</span>
          <span className="truncate text-ink-2">{e.vehicleName}</span>
        </Link>
      )}

      {/* actor */}
      <div className="mt-1.5 flex items-center gap-1.5">
        <span
          className="grid h-4 w-4 shrink-0 place-items-center rounded-full font-mono text-[8px] font-bold"
          style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}
        >
          {e.actorName ? initials(e.actorName) : "SY"}
        </span>
        <span className="font-mono text-[10px] text-ink-3">{e.actorName ?? "System"}</span>
      </div>

      {e.note && (
        <p
          className="mt-2 rounded-md border-l-2 bg-surface-2 px-2.5 py-1.5 text-xs italic text-ink-2"
          style={{ borderColor: toneColor(meta.tone) }}
        >
          &ldquo;{e.note}&rdquo;
        </p>
      )}
    </li>
  );
}

function StatusPill({ status, muted }: { status: VehicleStatus; muted?: boolean }) {
  const meta = STATUS_META[status];
  return (
    <span
      className="rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide"
      style={
        muted
          ? { background: "var(--surface-3)", color: "var(--ink-3)" }
          : { background: toneSoft(meta.tone), color: toneColor(meta.tone) }
      }
    >
      {meta.label}
    </span>
  );
}
