import type { EventType, Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Tone } from "@/lib/status";
import { accountTitle } from "@/lib/vehicle";

/**
 * Approved history — what a desk has already decided.
 *
 * Every approving desk in DeskInbox works the same way: a queue at one status,
 * an action that moves the file on (or back), and then the file is gone —
 * nothing on screen ever shows what happened to it. That is right for the
 * queue itself, which exists to answer "what needs me right now", but it
 * leaves no way to answer the very next question a desk gets asked: "did I
 * already approve that one?"
 *
 * This is that answer, built from the audit spine every desk action already
 * writes (see rbac.ts's TRANSITIONS table, which is what actually produces
 * these events). Nothing new is recorded — a desk's history is exactly the
 * VehicleEvent rows its own actions have left behind.
 *
 * The map below is hand-written rather than derived from TRANSITIONS
 * automatically: SOLD_AS_IS is a Service Manager decision that does not go
 * through the generic transition endpoint (it is a branch inside the repair-
 * approval route), so a mechanical derivation would miss it. A short list a
 * person maintains is also simply easier to read than the sole authority on
 * what counts as a desk's own decision.
 */
export interface DecisionMeta {
  event: EventType;
  label: string;
  tone: Tone;
}

export const DESK_DECISIONS: Partial<Record<Role, DecisionMeta[]>> = {
  RECOVERY_MANAGER: [
    { event: "CN_APPROVED", label: "CN approved", tone: "ok" },
    { event: "CN_DECLINED", label: "CN declined", tone: "bad" },
  ],
  SERVICE_HEAD: [
    { event: "REPAIR_APPROVED", label: "Repair approved", tone: "ok" },
    { event: "SOLD_AS_IS", label: "Sold as is", tone: "warn" },
    { event: "REPAIR_SENT_BACK", label: "Sent back", tone: "bad" },
  ],
  REGISTRATION_TEAM: [
    { event: "REGISTRATION_COMPLETED", label: "Registered", tone: "ok" },
  ],
  SR_EXECUTIVE: [
    { event: "SOP_SET", label: "Submitted for pricing", tone: "ok" },
  ],
  AGM_DGM: [
    { event: "PRICE_APPROVED", label: "Price approved", tone: "ok" },
  ],
  GM_SR_GM: [
    { event: "PUSHED_LIVE", label: "Approved for resale", tone: "ok" },
    { event: "SENT_BACK", label: "Sent back to AGM", tone: "bad" },
  ],
};

export interface DeskHistoryRow {
  id: string;
  vehicleId: string;
  registrationNo: string;
  name: string;
  customerName: string;
  territory: string | null;
  event: EventType;
  label: string;
  tone: Tone;
  note: string | null;
  actorName: string | null;
  at: string;
}

/** How far back a desk's history reaches when no range is asked for. */
const DEFAULT_LOOKBACK_DAYS = 365;

export async function getDeskHistory(
  role: Role,
  range: { from?: Date | null; to?: Date | null } = {},
  limit = 300,
): Promise<DeskHistoryRow[]> {
  const decisions = DESK_DECISIONS[role];
  if (!decisions?.length) return [];
  const metaByEvent = new Map(decisions.map((d) => [d.event, d]));

  const from = range.from ?? new Date(Date.now() - DEFAULT_LOOKBACK_DAYS * 86_400_000);

  const rows = await prisma.vehicleEvent.findMany({
    where: {
      type: { in: decisions.map((d) => d.event) },
      createdAt: { gte: from, ...(range.to ? { lte: range.to } : {}) },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      type: true,
      note: true,
      createdAt: true,
      actor: { select: { name: true } },
      vehicle: {
        select: {
          id: true,
          registrationNo: true,
          make: true,
          model: true,
          customerName: true,
          customerCode: true,
          territory: { select: { name: true } },
        },
      },
    },
  });

  return rows.map((r) => {
    const meta = metaByEvent.get(r.type)!;
    return {
      id: r.id,
      vehicleId: r.vehicle.id,
      registrationNo: r.vehicle.registrationNo,
      name: accountTitle(r.vehicle),
      customerName: r.vehicle.customerName,
      territory: r.vehicle.territory?.name ?? null,
      event: r.type,
      label: meta.label,
      tone: meta.tone,
      note: r.note,
      actorName: r.actor?.name ?? null,
      at: r.createdAt.toISOString(),
    };
  });
}
