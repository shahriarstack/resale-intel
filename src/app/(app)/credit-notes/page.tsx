import { redirect } from "next/navigation";
import { Gavel } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canDecideCaptureRequest } from "@/lib/rbac";
import { getRecoveryManagerInsight } from "@/lib/insights";
import { DeskInbox } from "@/components/desk/DeskInbox";
import { ApprovedHistory } from "@/components/desk/ApprovedHistory";
import { RecoveryManagerInsights } from "@/components/analytics/DeskInsights";

export const dynamic = "force-dynamic";

/**
 * The Credit Note desk, on its own route.
 *
 * It used to be the first of six tabs on the dashboard, which put a queue this
 * desk works every day behind a click and beside five things that are not
 * queues at all. The inbox component itself is untouched — this only gives it
 * an address.
 */
export default async function CreditNotesPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canDecideCaptureRequest(user.role)) redirect("/dashboard");

  const [vehicles, insight] = await Promise.all([
    prisma.vehicle.findMany({
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
    }),
    getRecoveryManagerInsight(),
  ]);

  return (
    <div className="w-full px-5 py-6 xl:px-8 2xl:px-10">
      <header className="mb-5">
        <div className="flex items-center gap-2">
          <span
            className="grid h-6 w-6 place-items-center rounded-md"
            style={{
              background: "color-mix(in srgb, var(--accent) 12%, var(--surface))",
              color: "var(--accent)",
            }}
          >
            <Gavel size={13} />
          </span>
          <div className="eyebrow" style={{ color: "var(--accent)" }}>
            Approvals
          </div>
        </div>
        <h1 className="page-title mt-1 text-[30px] leading-tight">Credit Notes</h1>
        <p className="mt-1 max-w-3xl text-[13.5px] text-ink-2">
          Files the field team has finished with, awaiting your ruling. Approving passes the
          vehicle to the Service Engineer; declining returns it to the officer with a reason.
        </p>
      </header>

      <DeskInbox
        insight={
          <>
            <RecoveryManagerInsights data={insight} />
            <ApprovedHistory />
          </>
        }
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
    </div>
  );
}
