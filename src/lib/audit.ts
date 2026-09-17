import type { Prisma, EventType, RecoveryEventType, VehicleStatus } from "@prisma/client";

export interface AuditInput {
  vehicleId: string;
  actorId: string | null;
  type: EventType;
  fromStatus?: VehicleStatus | null;
  toStatus?: VehicleStatus | null;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
}

/**
 * Write one audit row. Pass a transaction client so the event and the change
 * it records commit together — an event without its change, or vice versa, is
 * never persisted.
 */
export function recordEvent(
  tx: Prisma.TransactionClient,
  input: AuditInput,
) {
  return tx.vehicleEvent.create({
    data: {
      vehicleId: input.vehicleId,
      actorId: input.actorId ?? undefined,
      type: input.type,
      fromStatus: input.fromStatus ?? undefined,
      toStatus: input.toStatus ?? undefined,
      field: input.field ?? undefined,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      note: input.note ?? undefined,
    },
  });
}

export interface RecoveryAuditInput {
  /** Exactly one of these two. */
  captureRequestId?: string | null;
  offroadCaseId?: string | null;
  actorId: string | null;
  type: RecoveryEventType;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  note?: string | null;
}

/**
 * Write one audit row for a capture request or an off-road case.
 *
 * The twin of `recordEvent`, and separate for the same reason RecoveryEvent is
 * a separate table: none of these events moves a VehicleStatus, so forcing
 * them through a function whose signature is built around from/to statuses
 * would mean passing nulls at every call site and filtering them out at every
 * read. Same contract otherwise — pass a transaction client so the event and
 * the change it records commit together.
 */
export function recordRecoveryEvent(
  tx: Prisma.TransactionClient,
  input: RecoveryAuditInput,
) {
  return tx.recoveryEvent.create({
    data: {
      captureRequestId: input.captureRequestId ?? undefined,
      offroadCaseId: input.offroadCaseId ?? undefined,
      actorId: input.actorId ?? undefined,
      type: input.type,
      field: input.field ?? undefined,
      oldValue: input.oldValue ?? undefined,
      newValue: input.newValue ?? undefined,
      note: input.note ?? undefined,
    },
  });
}
