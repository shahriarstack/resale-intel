import type { Prisma, EventType, VehicleStatus } from "@prisma/client";

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
