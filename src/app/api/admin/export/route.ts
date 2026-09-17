import { fail } from "@/lib/api";
import { CSV_BOM, csvCell, stamp } from "@/lib/csv";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeBreakdown } from "@/lib/costing";
import { locationName } from "@/lib/vehicle";
import { statusLabel, letterLabel } from "@/lib/status";
import { gradeLabel } from "@/lib/grades";

export const dynamic = "force-dynamic";

// Full register export (Super Admin). Every vehicle, every cost component, the
// responsible person at each recorded stage, and stage timestamps.
export async function GET() {
  const user = await getSessionUser();
  if (!user) return fail("Sign in required", 401);
  if (user.role !== "SUPER_ADMIN") return fail("Super Admin only", 403);

  const vehicles = await prisma.vehicle.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      capturedBy: { select: { name: true, staffId: true } },
      assignedEngineer: { select: { name: true } },
      territory: { select: { name: true } },
      currentLocation: { select: { name: true } },
      costing: true,

      regLines: { select: { amount: true } },
    },
  });

  const headers = [
    "Registration No", "Brand", "Model", "Year", "Mileage",
    "Customer Code", "Customer", "Status", "Letter", "Grade", "Territory", "Current Location",
    "Case Slip", "Case Slip Fine",
    "Captured By", "Captured Staff ID", "Engineer",
    "Repair", "Transport", "Other", "Registration", "SOP",
    "Total Cost", "Approved Price", "Margin",
    "Capture Date", "Repair Deadline", "Created", "Updated",
  ];

  const rows = vehicles.map((v) => {
    const b = computeBreakdown(v.costing, v.regLines, v.asIs);
    return [
      v.registrationNo, v.make, v.model, v.year, v.mileage,
      v.customerCode, v.customerName, statusLabel(v.status), letterLabel(v.letterStage),
      v.grade ? gradeLabel(v.grade) : "",
      v.territory?.name, locationName(v),
      v.hasCaseSlip ? "Yes" : "No", v.hasCaseSlip ? (v.caseSlipFine ?? 0) : "",
      v.capturedBy?.name, v.capturedBy?.staffId, v.assignedEngineer?.name,
      b.repair, b.transport, b.other, b.registration, b.sop,
      b.total, b.approvedPrice, b.margin,
      iso(v.captureDate), iso(v.repairDeadline), iso(v.createdAt), iso(v.updatedAt),
    ];
  });

  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const today = stamp();

  return new Response(CSV_BOM + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resale-register-${today}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function iso(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString() : "";
}

