import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, Lock, ChevronRight } from "lucide-react";
import type { PhotoSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { computeBreakdown } from "@/lib/costing";
import { taka, shortDate, daysUntil, daysSince } from "@/lib/format";
import { STATUS_META, LETTER_META } from "@/lib/status";
import { GRADE_META } from "@/lib/grades";
import { vehicleTitle, vehicleMake } from "@/lib/vehicle";
import { standingOffers, type BidRow } from "@/lib/bids";
import { Chip } from "@/components/ui/Chip";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { VehicleJourney } from "@/components/vehicle/VehicleJourney";
import { BidsPanel } from "@/components/vehicle/BidsPanel";
import { VehicleActions } from "@/components/vehicle/VehicleActions";
import { EngineerAssessmentPanel } from "@/components/engineer/EngineerAssessmentPanel";
import { ServiceHeadPanel } from "@/components/head/ServiceHeadPanel";
import { RegistrationPanel } from "@/components/registration/RegistrationPanel";
import { SopPanel } from "@/components/srex/SopPanel";
import { PricePanel } from "@/components/agm/PricePanel";
import { GmApprovalPanel } from "@/components/gm/GmApprovalPanel";
import { PhotoGallery } from "@/components/vehicle/PhotoGallery";
import { CopyRegNo } from "@/components/vehicle/CopyRegNo";
import { canEditSop, canEditPrice, canPlaceBid, canViewAllBids, canAwardSale } from "@/lib/rbac";

export const dynamic = "force-dynamic";

const CAPTURE_SLOTS: PhotoSlot[] = ["LEFT", "RIGHT", "FRONT", "BACK", "CABIN", "SLEEP"];

export default async function VehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) notFound();

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      capturedBy: { select: { name: true, staffId: true } },
      assignedEngineer: { select: { name: true, staffId: true } },
      territory: { select: { name: true } },
      currentLocation: { select: { name: true } },
      photos: true,
      answers: { include: { question: true }, orderBy: { question: { sortOrder: "asc" } } },
      costing: true,
      repairLines: true,
      regLines: true,
      events: {
        orderBy: { createdAt: "desc" },
        include: { actor: { select: { name: true } } },
      },
      bids: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          amount: true,
          note: true,
          createdAt: true,
          bidderId: true,
          bidder: { select: { name: true, staffId: true } },
        },
      },
    },
  });
  if (!vehicle) notFound();

  const status = STATUS_META[vehicle.status];
  const breakdown = computeBreakdown(vehicle.costing, vehicle.repairLines, vehicle.regLines);
  const capturePhotos = vehicle.photos.filter((p) => CAPTURE_SLOTS.includes(p.slot));
  const assessmentPhotos = vehicle.photos.filter((p) => p.slot === "ASSESSMENT_SHEET");
  const hasCosts = breakdown.total > 0 || breakdown.approvedPrice !== null;

  const days = daysUntil(vehicle.repairDeadline);
  const overdue = days !== null && days < 0;

  const vehicleName = vehicleTitle(vehicle);
  const makeLabel = vehicleMake(vehicle);

  // Sealed bidding: an officer only ever receives their own offers.
  const seesAllBids = canViewAllBids(user.role);
  const allBids: BidRow[] = vehicle.bids.map((b) => ({
    id: b.id,
    amount: b.amount,
    note: b.note,
    createdAt: b.createdAt.toISOString(),
    bidderId: b.bidderId,
    bidderName: b.bidder.name,
    bidderStaffId: b.bidder.staffId,
    isMine: b.bidderId === user.id,
  }));
  const visibleBids = seesAllBids ? allBids : allBids.filter((b) => b.isMine);

  const mayBid = canPlaceBid(user.role, vehicle.status);
  const mayAward = canAwardSale(user.role, vehicle.status);
  const isSold = vehicle.status === "SOLD";
  const winningBid = isSold ? allBids.find((b) => b.id === vehicle.winningBidId) ?? null : null;
  // The bid book is only worth showing once the vehicle reaches the marketplace.
  const showBids =
    (vehicle.status === "LIVE_FOR_RESALE" || isSold) &&
    (seesAllBids || mayBid || visibleBids.length > 0);

  return (
    <div className="mx-auto max-w-5xl px-5 py-6 sm:px-7 sm:py-7">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
        <Link href="/dashboard" className="transition-colors hover:text-accent">Dashboard</Link>
        <ChevronRight size={12} />
        <span className="text-ink-2">{vehicleName}</span>
      </nav>

      {/* Header */}
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}>
        <div>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <h1 className="page-title text-[26px] sm:text-[30px]">{vehicleName}</h1>
            {makeLabel && (
              <span
                className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}
              >
                {makeLabel}
              </span>
            )}
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <CopyRegNo regNo={vehicle.registrationNo} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vehicle.isLocked && (
            <Chip tone="warn">
              <Lock size={11} /> Locked
            </Chip>
          )}
          {vehicle.grade && (
            <Chip tone={GRADE_META[vehicle.grade].tone}>
              Grade {vehicle.grade} · {GRADE_META[vehicle.grade].label}
            </Chip>
          )}
          <Chip tone={LETTER_META[vehicle.letterStage].tone}>{LETTER_META[vehicle.letterStage].label}</Chip>
          <Chip tone={status.tone}>{status.label}</Chip>
        </div>
      </header>

      {vehicle.repairDeadline && (
        <div
          className="mb-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={
            overdue
              ? { background: "var(--bad-soft)", color: "var(--bad)" }
              : { background: "var(--ok-soft)", color: "var(--ok)" }
          }
        >
          <Clock size={16} />
          {overdue ? `Overdue by ${Math.abs(days!)} day${Math.abs(days!) === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"} to repair deadline`}
          <span className="font-mono text-xs opacity-70">· {shortDate(vehicle.repairDeadline)}</span>
        </div>
      )}

      {/* Where the file is, and every desk still waiting for it */}
      <div className="mb-4" style={{ animation: "fadeIn 0.28s var(--ease-standard) 0.04s both" }}>
        <VehicleJourney status={vehicle.status} daysAtStage={daysSince(vehicle.updatedAt)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {/* Details */}
          <section className="card p-4" style={{ animation: "fadeIn 0.2s ease 0.05s both" }}>
            <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Details</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              <Detail label="Customer" value={vehicle.customerName} />
              <Detail label="Customer code" value={vehicle.customerCode} />
              <Detail label="Year / Mileage" value={`${vehicle.year ?? "—"} · ${vehicle.mileage ?? "—"} km`} />
              <Detail label="Territory" value={vehicle.territory?.name} />
              <Detail label="Current location" value={vehicle.currentLocation?.name} />
              <Detail label="Captured location" value={vehicle.capturedLocation} />
              <Detail label="Capture date" value={shortDate(vehicle.captureDate)} />
              <Detail
                label="Captured by"
                value={vehicle.capturedBy ? `${vehicle.capturedBy.name}` : "—"}
              />
              <Detail
                label="Engineer"
                value={vehicle.assignedEngineer ? `${vehicle.assignedEngineer.name}` : "Unassigned"}
              />
            </dl>
            {vehicle.remarks && (
              <div className="mt-5 border-t border-rule pt-4">
                <div className="label mb-1.5">Remarks</div>
                <p className="text-sm text-ink-2">{vehicle.remarks}</p>
              </div>
            )}
          </section>

          {/* Checklist */}
          {vehicle.answers.length > 0 && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s ease 0.1s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Documentation</h2>
              <ul className="space-y-2">
                {vehicle.answers.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-3 rounded-lg border border-rule bg-surface-2 px-3.5 py-2 text-sm">
                    <span className="text-ink-2">{a.question.label}</span>
                    <Chip tone={a.answer ? "ok" : "bad"}>{a.answer ? "Yes" : "No"}</Chip>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* Capture photos */}
          {capturePhotos.length > 0 && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s ease 0.15s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Capture photos</h2>
              <PhotoGallery
                photos={capturePhotos.map((p) => ({ id: p.id, url: p.url, label: p.slot }))}
              />
            </section>
          )}

          {assessmentPhotos.length > 0 && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s ease 0.2s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Assessment sheets</h2>
              <PhotoGallery
                photos={assessmentPhotos.map((p) => ({ id: p.id, url: p.url, label: "Sheet" }))}
              />
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {!(user.role === "GM_SR_GM" && vehicle.status === "PRICE_APPROVED") && (
            <VehicleActions
              vehicleId={vehicle.id}
              status={vehicle.status}
              role={user.role}
              isOwner={vehicle.capturedById === user.id}
            />
          )}

          {(user.role === "SERVICE_ENGINEER" || user.role === "SUPER_ADMIN") &&
            vehicle.status === "CN_APPROVED" &&
            (user.role === "SUPER_ADMIN" || vehicle.assignedEngineerId === user.id) && (
              <EngineerAssessmentPanel
                vehicleId={vehicle.id}
                initialLines={vehicle.repairLines.map((l) => ({ description: l.description, amount: l.amount }))}
                initialTransport={vehicle.costing?.transportCost ?? 0}
                initialOther={vehicle.costing?.otherCost ?? 0}
                existingSheets={assessmentPhotos.map((p) => ({ id: p.id, url: p.url }))}
              />
            )}

          {(user.role === "SERVICE_HEAD" || user.role === "SUPER_ADMIN") &&
            vehicle.status === "COST_SUBMITTED" && (
              <ServiceHeadPanel
                vehicleId={vehicle.id}
                repairLines={vehicle.repairLines.map((l) => ({ id: l.id, description: l.description, amount: l.amount }))}
                transportCost={vehicle.costing?.transportCost ?? 0}
                otherCost={vehicle.costing?.otherCost ?? 0}
              />
            )}

          {(user.role === "REGISTRATION_TEAM" || user.role === "SUPER_ADMIN") &&
            vehicle.status === "REPAIR_APPROVED" && (
              <RegistrationPanel
                vehicleId={vehicle.id}
                initialLines={vehicle.regLines.map((l) => ({ description: l.description, amount: l.amount }))}
              />
            )}

          {(user.role === "SR_EXECUTIVE" || user.role === "SUPER_ADMIN") &&
            canEditSop(user.role, vehicle.status) && (
              <SopPanel
                vehicleId={vehicle.id}
                currentSop={vehicle.costing?.sopCost ?? 0}
                costBase={breakdown.total - breakdown.sop}
                isFirstSet={vehicle.status === "REGISTRATION_DONE"}
                currentGrade={vehicle.grade}
                currentPrice={breakdown.approvedPrice}
              />
            )}

          {(user.role === "AGM_DGM" || user.role === "SUPER_ADMIN") &&
            canEditPrice(user.role, vehicle.status) && (
              <PricePanel
                vehicleId={vehicle.id}
                parts={{
                  repair: breakdown.repair,
                  transport: breakdown.transport,
                  other: breakdown.other,
                  registration: breakdown.registration,
                  sop: breakdown.sop,
                  total: breakdown.total,
                }}
                currentPrice={breakdown.approvedPrice}
                isFirstApproval={vehicle.status === "SOP_ADDED"}
              />
            )}

          {user.role === "GM_SR_GM" && vehicle.status === "PRICE_APPROVED" && (
            <GmApprovalPanel
              vehicleId={vehicle.id}
              parts={{
                repair: breakdown.repair,
                transport: breakdown.transport,
                other: breakdown.other,
                registration: breakdown.registration,
                sop: breakdown.sop,
                total: breakdown.total,
              }}
              currentPrice={breakdown.approvedPrice}
            />
          )}

          {showBids && (
            <BidsPanel
              vehicleId={vehicle.id}
              title={vehicleName}
              make={makeLabel}
              registrationNo={vehicle.registrationNo}
              bids={visibleBids}
              sealed={!seesAllBids}
              canBid={mayBid}
              canAward={mayAward}
              approvedPrice={breakdown.approvedPrice}
              sold={
                isSold
                  ? {
                      at: vehicle.soldAt?.toISOString() ?? null,
                      amount: winningBid?.amount ?? null,
                      winner: winningBid?.bidderName ?? null,
                    }
                  : null
              }
              winningBidId={vehicle.winningBidId}
            />
          )}

          {hasCosts && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s ease 0.1s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Cost summary</h2>
              <dl className="space-y-2.5 text-sm">
                <CostRow label="Repair" value={taka(breakdown.repair)} />
                <CostRow label="Transport" value={taka(breakdown.transport)} />
                <CostRow label="Other" value={taka(breakdown.other)} />
                <CostRow label="Registration" value={taka(breakdown.registration)} />
                <CostRow label="SOP" value={taka(breakdown.sop)} />
                <div className="flex items-center justify-between border-t border-rule pt-2.5 font-semibold text-ink">
                  <dt>Total cost</dt>
                  <dd className="tnum">{taka(breakdown.total)}</dd>
                </div>
                {breakdown.approvedPrice !== null && (
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-2">Approved price</dt>
                    <dd className="tnum font-semibold text-ink">{taka(breakdown.approvedPrice)}</dd>
                  </div>
                )}
                {breakdown.margin !== null && (
                  <div className="flex items-center justify-between">
                    <dt className="text-ink-2">Margin</dt>
                    <dd className="tnum font-semibold" style={{ color: breakdown.margin >= 0 ? "var(--ok)" : "var(--bad)" }}>
                      {taka(breakdown.margin)}
                      {breakdown.marginPct !== null && (
                        <span className="ml-1.5 font-mono text-xs opacity-70">({breakdown.marginPct.toFixed(1)}%)</span>
                      )}
                    </dd>
                  </div>
                )}
              </dl>
            </section>
          )}

          {/* Timeline */}
          <section className="card p-4" style={{ animation: "fadeIn 0.2s ease 0.15s both" }}>
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="font-display text-[15px] font-bold text-ink">Activity</h2>
              <span className="font-mono text-[11px] text-ink-3">
                {vehicle.events.length} {vehicle.events.length === 1 ? "entry" : "entries"}
              </span>
            </div>
            <ActivityFeed
              events={vehicle.events.map((e) => ({
                id: e.id,
                type: e.type,
                createdAt: e.createdAt.toISOString(),
                actorName: e.actor?.name ?? null,
                note: e.note,
                fromStatus: e.fromStatus,
                toStatus: e.toStatus,
              }))}
              emptyLabel="Nothing has happened to this file yet."
            />
          </section>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="label mb-1">{label}</dt>
      <dd className="text-sm font-medium text-ink">{value || "—"}</dd>
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-ink-2">{label}</dt>
      <dd className="tnum text-ink">{value}</dd>
    </div>
  );
}
