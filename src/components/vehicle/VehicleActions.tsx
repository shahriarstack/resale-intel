"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Role, VehicleStatus } from "@prisma/client";
import { simpleActions } from "@/lib/rbac";
import { ActionModal, type PendingAction } from "./ActionModal";

const DETAIL: Partial<Record<string, string>> = {
  APPROVE_CN: "Approves the Credit Note and passes the file to the Service Engineer.",
  DECLINE_CN: "Returns the file to the Recovery Team. A reason is required.",
  REQUEST_CN: "Sends the file to the Recovery Manager for CN approval.",
  RELEASE: "The vehicle leaves the pipeline. This is terminal.",
  PUSH_LIVE: "Marks the vehicle live for resale. This is the final approval.",
  SEND_BACK_TO_AGM: "Returns the file to AGM / DGM to revise the price.",
  SEND_BACK_TO_ENGINEER: "Returns the file to the engineer to revise the assessment.",
};

export function VehicleActions({
  vehicleId,
  status,
  role,
  isOwner = true,
}: {
  vehicleId: string;
  status: VehicleStatus;
  role: Role;
  isOwner?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const actions = simpleActions(role, status);

  if (role === "RECOVERY_TEAM" && !isOwner) return null;
  if (actions.length === 0) return null;

  return (
    <section className="card p-4" style={{ animation: "slideUp 0.2s ease 0.1s both" }}>
      <h2 className="mb-4 font-display text-[15px] font-bold text-ink">Actions</h2>
      <div className="flex flex-col gap-2.5">
        {actions.map((t, i) => {
          const cls =
            t.tone === "danger" ? "btn-danger" : t.tone === "ok" ? "btn-ok" : "btn-primary";
          return (
            <button
              key={t.action}
              className={`btn ${cls} btn-block`}
              style={{ animation: `fadeIn 0.15s ease ${i * 0.05}s both` }}
              onClick={() =>
                setPending({
                  action: t.action,
                  label: t.label,
                  requiresNote: t.requiresNote,
                  tone: t.tone,
                  detail: DETAIL[t.action],
                })
              }
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {pending && (
        <ActionModal
          vehicleId={vehicleId}
          pending={pending}
          onClose={() => setPending(null)}
          onDone={() => {
            setPending(null);
            router.refresh();
          }}
        />
      )}
    </section>
  );
}
