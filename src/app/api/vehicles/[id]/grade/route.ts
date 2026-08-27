import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { gradeSchema } from "@/lib/validation";
import { canSetGrade } from "@/lib/rbac";
import { recordEvent } from "@/lib/audit";
import { gradeLabel } from "@/lib/grades";

// Sr. Executive marks the vehicle's condition grade (A–D). Settable in the same
// window as SOP (from REGISTRATION_DONE through Live) and revisable there.
export const POST = withGuard(
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SR_EXECUTIVE");
    const { id } = await context.params;
    const { grade } = gradeSchema.parse(await request.json());

    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      select: { id: true, status: true, grade: true },
    });
    if (!vehicle) return fail("Vehicle not found", 404);
    if (!canSetGrade(user.role, vehicle.status)) {
      return fail("This vehicle cannot be graded at this stage", 409);
    }
    if (vehicle.grade === grade) return ok({ grade });

    await prisma.$transaction(async (tx) => {
      await tx.vehicle.update({ where: { id }, data: { grade } });
      await recordEvent(tx, {
        vehicleId: id,
        actorId: user.id,
        type: "GRADED",
        field: "grade",
        oldValue: gradeLabel(vehicle.grade),
        newValue: gradeLabel(grade),
      });
    });

    return ok({ grade });
  },
);
