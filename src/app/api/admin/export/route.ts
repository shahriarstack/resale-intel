import { fail } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { computeBreakdown } from "@/lib/costing";
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
      repairLines: { select: { amount: true } },
      regLines: { select: { amount: true } },
    },
  });

  const headers = [
    "Registration No", "Make", "Model", "Year", "Mileage",
    "Customer", "Customer Code", "Status", "Letter", "Grade", "Territory", "Current Location",
    "Captured By", "Captured Staff ID", "Engineer",
    "Repair", "Transport", "Other", "Registration", "SOP",
    "Total Cost", "Approved Price", "Margin",
    "Capture Date", "Repair Deadline", "Created", "Updated",
  ];

  const rows = vehicles.map((v) => {
    const b = computeBreakdown(v.costing, v.repairLines, v.regLines);
    return [
      v.registrationNo, v.make, v.model, v.year, v.mileage,
      v.customerName, v.customerCode, statusLabel(v.status), letterLabel(v.letterStage),
      v.grade ? gradeLabel(v.grade) : "",
      v.territory?.name, v.currentLocation?.name,
      v.capturedBy?.name, v.capturedBy?.staffId, v.assignedEngineer?.name,
      b.repair, b.transport, b.other, b.registration, b.sop,
      b.total, b.approvedPrice, b.margin,
      iso(v.captureDate), iso(v.repairDeadline), iso(v.createdAt), iso(v.updatedAt),
    ];
  });

  const csv = [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);

  return new Response("﻿" + csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="resale-register-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}

function iso(d: Date | null | undefined): string {
  return d ? new Date(d).toISOString() : "";
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
