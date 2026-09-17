import type { AdminRecordKind, Prisma } from "@prisma/client";
import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { recordEvent, recordRecoveryEvent } from "@/lib/audit";
import { adminDeleteSchema, adminCorrectSchema } from "@/lib/validation";
import { KIND_LABEL, stageLabelFor } from "@/lib/adminRecords";

export const runtime = "nodejs";

function parseKind(raw: string): AdminRecordKind | null {
  return raw in KIND_LABEL ? (raw as AdminRecordKind) : null;
}

/** "12 photographs, 34 audit events, 2 offers" — or null when nothing goes. */
function cascadeSummary(counts: Record<string, number>): string | null {
  const parts = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([what, n]) => `${n} ${what}${n === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : null;
}

/**
 * DELETE — remove a record, and outlive it.
 *
 * Super Admin only, one record per call. The console selects many and calls
 * this once each, which is the same shape BulkBar uses for transitions and for
 * the same reason: a batch is literally the sequence of single acts, so
 * nothing can slip past a rule a single act would enforce, and a partial
 * failure can be reported honestly per record.
 *
 * THE TOMBSTONE IS WRITTEN IN THE SAME TRANSACTION AS THE DELETION, and this
 * is the whole point of the endpoint. Deleting a vehicle cascades its
 * VehicleEvents — so the strongest act an administrator has was the only one
 * that destroyed its own audit trail. AdminDeletion has no foreign key back to
 * the record, so the cascade cannot reach it. Same transaction, so there is
 * never a tombstone for a record that survived, nor a deletion with no record
 * of itself.
 *
 * The cascade is counted BEFORE the delete, because afterwards there is
 * nothing left to count, and a deletion whose cost is only visible in advance
 * is a deletion nobody can audit.
 */
export const DELETE = withGuard(
  async (
    request: Request,
    context: { params: Promise<{ kind: string; id: string }> },
  ) => {
    const actor = await requireRole("SUPER_ADMIN");
    const { kind: rawKind, id } = await context.params;
    const kind = parseKind(rawKind);
    if (!kind) return fail(`Unknown record kind: ${rawKind}`, 400);

    const { reason } = adminDeleteSchema.parse(await request.json());

    return await prisma.$transaction(async (tx) => {
      let label = "";
      let customer: string | null = null;
      let stage: string | null = null;
      let cascaded: string | null = null;

      if (kind === "VEHICLE") {
        const v = await tx.vehicle.findUnique({
          where: { id },
          select: {
            registrationNo: true,
            customerName: true,
            customerCode: true,
            status: true,
            _count: {
              select: { photos: true, events: true, bids: true, answers: true },
            },
          },
        });
        if (!v) return fail("That vehicle no longer exists", 404);
        label = v.registrationNo;
        customer = [v.customerName, v.customerCode].filter(Boolean).join(" · ") || null;
        stage = stageLabelFor(kind, v.status);
        cascaded = cascadeSummary({
          photograph: v._count.photos,
          "audit event": v._count.events,
          offer: v._count.bids,
          "document answer": v._count.answers,
        });
        await tx.vehicle.delete({ where: { id } });
      } else if (kind === "CAPTURE_REQUEST") {
        const r = await tx.captureRequest.findUnique({
          where: { id },
          select: {
            registrationNo: true,
            customerName: true,
            customerCode: true,
            status: true,
            vehicleId: true,
            _count: { select: { events: true } },
          },
        });
        if (!r) return fail("That capture request no longer exists", 404);
        // A spent approval is the paper trail for a seizure that actually
        // happened. Deleting it would leave a vehicle whose authority to exist
        // cannot be produced.
        if (r.vehicleId) {
          return fail(
            "This request was captured against and is the record of that authority. Delete the vehicle first if that is really what you mean.",
            409,
          );
        }
        label = r.registrationNo;
        customer = [r.customerName, r.customerCode].filter(Boolean).join(" · ") || null;
        stage = stageLabelFor(kind, r.status);
        cascaded = cascadeSummary({ "recovery event": r._count.events });
        await tx.captureRequest.delete({ where: { id } });
      } else {
        const c = await tx.offroadCase.findUnique({
          where: { id },
          select: {
            registrationNo: true,
            customerName: true,
            customerCode: true,
            status: true,
            vehicleId: true,
            _count: { select: { photos: true, events: true, flags: true } },
          },
        });
        if (!c) return fail("That off-road case no longer exists", 404);
        if (c.vehicleId) {
          return fail(
            "This case was converted to a capture and is the origin of that vehicle. Delete the vehicle first if that is really what you mean.",
            409,
          );
        }
        label = c.registrationNo;
        customer = [c.customerName, c.customerCode].filter(Boolean).join(" · ") || null;
        stage = stageLabelFor(kind, c.status);
        cascaded = cascadeSummary({
          photograph: c._count.photos,
          "recovery event": c._count.events,
          flag: c._count.flags,
        });
        await tx.offroadCase.delete({ where: { id } });
      }

      await tx.adminDeletion.create({
        data: {
          kind,
          recordId: id,
          label,
          customer,
          stage,
          cascaded,
          reason,
          deletedById: actor.id,
        },
      });

      return ok({ kind, id, label, cascaded });
    });
  },
);

/**
 * PATCH — correct a record's identity.
 *
 * Only the transcription fields: registration number, customer name, customer
 * code, territory. Everything a desk owns already has an audited path that
 * enforces its own rules, and a Super Admin can walk any of them because
 * `canRunAction` lets them run any transition — so there is no stage this
 * cannot reach without writing columns behind the state machine's back.
 *
 * Every field written here produces its own audit row naming the old value and
 * the new one. A correction that cannot be distinguished from the original
 * entry is not a correction, it is a quiet rewrite of history.
 */
export const PATCH = withGuard(
  async (
    request: Request,
    context: { params: Promise<{ kind: string; id: string }> },
  ) => {
    const actor = await requireRole("SUPER_ADMIN");
    const { kind: rawKind, id } = await context.params;
    const kind = parseKind(rawKind);
    if (!kind) return fail(`Unknown record kind: ${rawKind}`, 400);

    const data = adminCorrectSchema.parse(await request.json());
    const note = data.reason?.trim() || null;

    const select = {
      registrationNo: true,
      customerName: true,
      customerCode: true,
      territoryId: true,
    } as const;

    // Which of the requested fields actually differ. An admin who opens the
    // editor, changes their mind and saves should write no audit rows at all —
    // a trail full of "changed X from Y to Y" is a trail nobody reads.
    function changesAgainst(
      current: { [K in keyof typeof select]: string | null },
    ): { field: string; from: string | null; to: string | null }[] {
      const out: { field: string; from: string | null; to: string | null }[] = [];
      const want: Record<string, string | null | undefined> = {
        registrationNo: data.registrationNo,
        customerName: data.customerName,
        customerCode: data.customerCode === "" ? null : data.customerCode,
        territoryId: data.territoryId,
      };
      for (const [field, to] of Object.entries(want)) {
        if (to === undefined) continue;
        const from = current[field as keyof typeof select] ?? null;
        if ((from ?? null) === (to ?? null)) continue;
        out.push({ field, from, to: to ?? null });
      }
      return out;
    }

    return await prisma.$transaction(async (tx) => {
      if (kind === "VEHICLE") {
        const v = await tx.vehicle.findUnique({ where: { id }, select });
        if (!v) return fail("That vehicle no longer exists", 404);
        const changes = changesAgainst(v);
        if (!changes.length) return ok({ kind, id, changed: 0 });

        await tx.vehicle.update({
          where: { id },
          data: Object.fromEntries(
            changes.map((c) => [c.field, c.to]),
          ) as Prisma.VehicleUpdateInput,
        });
        for (const c of changes) {
          await recordEvent(tx, {
            vehicleId: id,
            actorId: actor.id,
            type: "FIELD_EDITED",
            field: c.field,
            oldValue: c.from,
            newValue: c.to,
            note: note ? `Admin correction — ${note}` : "Admin correction",
          });
        }
        return ok({ kind, id, changed: changes.length });
      }

      const model = kind === "CAPTURE_REQUEST" ? tx.captureRequest : tx.offroadCase;
      const row = await (
        model as { findUnique: (a: unknown) => Promise<typeof select | null> }
      ).findUnique({ where: { id }, select });
      if (!row) return fail("That record no longer exists", 404);

      const changes = changesAgainst(row as never);
      if (!changes.length) return ok({ kind, id, changed: 0 });

      const patch = Object.fromEntries(changes.map((c) => [c.field, c.to]));
      if (kind === "CAPTURE_REQUEST") {
        await tx.captureRequest.update({
          where: { id },
          data: patch as Prisma.CaptureRequestUpdateInput,
        });
      } else {
        await tx.offroadCase.update({
          where: { id },
          data: patch as Prisma.OffroadCaseUpdateInput,
        });
      }

      for (const c of changes) {
        await recordRecoveryEvent(tx, {
          captureRequestId: kind === "CAPTURE_REQUEST" ? id : null,
          offroadCaseId: kind === "OFFROAD_CASE" ? id : null,
          actorId: actor.id,
          type: "CASE_EDITED",
          field: c.field,
          oldValue: c.from,
          newValue: c.to,
          note: note ? `Admin correction — ${note}` : "Admin correction",
        });
      }
      return ok({ kind, id, changed: changes.length });
    });
  },
);
