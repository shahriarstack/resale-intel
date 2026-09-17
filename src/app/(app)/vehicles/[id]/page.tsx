import { notFound, redirect } from "next/navigation";
import { Clock, Lock, Unlock, ChevronRight, FileText } from "lucide-react";
import type { PhotoSlot } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/session";
import { computeBreakdown } from "@/lib/costing";
import { conditionLabel, locationName } from "@/lib/vehicle";
import { taka, shortDate, daysUntil, daysSince, timeAgo } from "@/lib/format";
import { STATUS_META, LETTER_META } from "@/lib/status";
import { GRADE_META } from "@/lib/grades";
import { REPAIR_STAGE_META } from "@/lib/repair";
import { accountTitle, vehicleTitle, vehicleMake } from "@/lib/vehicle";
import { AccountTitle } from "@/components/ui/AccountTitle";
import { BackLink } from "@/components/ui/BackLink";
import type { OfferRow } from "@/lib/bids";
import { Chip } from "@/components/ui/Chip";
import { ActivityFeed } from "@/components/ui/ActivityFeed";
import { VehicleJourney } from "@/components/vehicle/VehicleJourney";
import { BidsPanel } from "@/components/vehicle/BidsPanel";
import { VehicleActions } from "@/components/vehicle/VehicleActions";
import { EngineerAssessmentPanel } from "@/components/engineer/EngineerAssessmentPanel";
import { ServiceHeadPanel } from "@/components/head/ServiceHeadPanel";
import { HandoverSheet } from "@/components/engineer/HandoverSheet";
import { RegistrationPanel } from "@/components/registration/RegistrationPanel";
import { RegistrationStatusPanel } from "@/components/registration/RegistrationStatusPanel";
import { SopPanel } from "@/components/srex/SopPanel";
import { PricePanel } from "@/components/agm/PricePanel";
import { GmApprovalPanel } from "@/components/gm/GmApprovalPanel";
import { PhotoGallery } from "@/components/vehicle/PhotoGallery";
import { CopyRegNo } from "@/components/vehicle/CopyRegNo";
import {
  canEditSop,
  canEditPrice,
  canPlaceBid,
  canViewAllBids,
  canAwardSale,
  canViewCosts,
} from "@/lib/rbac";
import { OFFER_SELECT, shapeOffer } from "@/lib/offerQuery";
import { readCycle, cycleLabel } from "@/lib/resale";
import { readDeskLock } from "@/lib/stageLock";
import { StageLock, ReworkBanner } from "@/components/vehicle/StageLock";
import { pairByAngle } from "@/lib/photos";
import { readValidity } from "@/lib/registrationValidity";
import { isPdfUrl } from "@/lib/photos";

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

  // A sales officer has no file to work here — this page is the eight-desk
  // record, and the desk chain, the letters and the cost basis are all things
  // they are deliberately not shown. Their view of a vehicle is the product
  // listing, so send them to it with this vehicle already open rather than
  // rendering a stripped page that still leaks its own shape.
  if (user.role === "SALES_TEAM") redirect(`/register?v=${id}`);

  const vehicle = await prisma.vehicle.findUnique({
    where: { id },
    include: {
      capturedBy: { select: { name: true, staffId: true } },
      // The authorisation, when this vehicle was entered without a capture
      // request. Null for every file that came through the normal gate.
      captureWindow: {
        select: { reason: true, openedBy: { select: { name: true } } },
      },
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
      bids: { orderBy: { createdAt: "desc" }, select: OFFER_SELECT },
    },
  });
  if (!vehicle) notFound();

  const status = STATUS_META[vehicle.status];
  // Names the vehicle on every hand-off receipt, so the six desk panels do not
  // each build their own slightly different version of the same label.
  const subject = `${vehicleTitle(vehicle)} · ${vehicle.registrationNo}`;
  const validityRead = readValidity(vehicle.registrationValidUntil, vehicle.status === "SOLD");
  const breakdown = computeBreakdown(vehicle.costing, vehicle.regLines, vehicle.asIs);
  const capturePhotos = vehicle.photos.filter((p) => CAPTURE_SLOTS.includes(p.slot));
  // The post-sale retention sweep, if it has been here. Read from the timeline
  // rather than inferred from "sold and has no photos", which is also true of
  // a vehicle nobody ever photographed — two very different records that must
  // not render as the same one.
  const photosPurged = vehicle.events.find((e) => e.type === "PHOTOS_PURGED") ?? null;
  const assessmentPhotos = vehicle.photos.filter((p) => p.slot === "ASSESSMENT_SHEET");
  const estimateImages = assessmentPhotos.filter((p) => !isPdfUrl(p.url));
  const estimateDocs = assessmentPhotos.filter((p) => isPdfUrl(p.url));
  const approvalSheets = vehicle.photos.filter((p) => p.slot === "APPROVAL_SHEET");
  const captureFormPhotos = vehicle.photos.filter((p) => p.slot === "CAPTURE_FORM");
  // Recovery shot beside post-repair shot, one row per angle.
  const handoverPairs = pairByAngle(vehicle.photos).map((r) => ({
    angle: r.angle,
    before: r.before,
    after: r.after,
  }));
  // The field roles never see the assembled cost basis. A sales officer with
  // total cost and margin in front of them is bidding against a number the
  // company would rather they did not have.
  const seesCosts = canViewCosts(user.role);
  const hasCosts = seesCosts && (breakdown.total > 0 || breakdown.approvedPrice !== null);

  const days = daysUntil(vehicle.repairDeadline);
  const overdue = days !== null && days < 0;

  const vehicleName = vehicleTitle(vehicle);
  // The file belongs to an account, and the trail back to it should say so.
  // `vehicleName` keeps the places that genuinely mean the OBJECT — the photo
  // gallery, and the hand-off receipt, which records a truck changing hands.
  const account = accountTitle(vehicle);
  const makeLabel = vehicleMake(vehicle);

  // Sealed sideways: an officer only ever receives the customers they put
  // forward. Management receives the book whole, with who introduced whom.
  const seesAllBids = canViewAllBids(user.role);
  const allOffers: OfferRow[] = vehicle.bids.map((b) => shapeOffer(b, user.id));
  const visibleOffers = seesAllBids ? allOffers : allOffers.filter((b) => b.isMine);

  // A live vehicle whose pricing month has run out is listed but closed.
  const cycle = readCycle(vehicle.resaleCycleEndsAt);
  const mayBid = canPlaceBid(user.role, vehicle.status, cycle.onHold);

  // What this desk's own section should say. Costs no query — it reads the
  // audit trail already loaded for the timeline.
  const lock = readDeskLock(
    user.role,
    vehicle.status,
    vehicle.events.map((e) => ({
      type: e.type,
      createdAt: e.createdAt.toISOString(),
      note: e.note,
      actorName: e.actor?.name ?? null,
    })),
  );
  const mayAward = canAwardSale(user.role, vehicle.status);
  const isSold = vehicle.status === "SOLD";
  const winningBid = isSold ? allOffers.find((b) => b.id === vehicle.winningBidId) ?? null : null;
  // The offer book is only worth showing once the vehicle reaches the market.
  const showBids =
    (vehicle.status === "LIVE_FOR_RESALE" || isSold) &&
    (seesAllBids || mayBid || visibleOffers.length > 0);
  const heroShot =
    ["FRONT", "LEFT", "RIGHT", "BACK"]
      .map((slot) => vehicle.photos.find((p) => p.slot === slot)?.url)
      .find(Boolean) ?? null;

  return (
    <div className="mx-auto w-full max-w-5xl px-5 py-6 sm:px-7 sm:py-7">
      {/* Breadcrumb */}
      {/* BACK, NOT "DASHBOARD".
          This read `Dashboard ›` and went there, which is almost never where
          the reader came from: they opened this file out of a queue they had
          scrolled, filtered and chosen a tab in, and the breadcrumb threw all
          of it away. `BackLink` returns them to it, and only falls through to
          the dashboard when there is genuinely nothing behind — a shared link,
          a new tab, or the home-screen app opened cold on this page, which is
          also the case where pressing the device's own back gesture would shut
          the app. */}
      <nav className="mb-4 flex items-center gap-1.5 font-mono text-[11px] text-ink-3">
        <BackLink to="/dashboard" />
        <ChevronRight size={12} />
        <span className="truncate text-ink-2">{account}</span>
      </nav>

      {/* Header */}
      <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between" style={{ animation: "fadeIn 0.24s var(--ease-standard)" }}>
        <div>
          <div className="flex flex-wrap items-baseline gap-2.5">
            <AccountTitle
              record={vehicle}
              as="h2"
              className="page-title text-[26px] sm:text-[30px]"
            />
            {makeLabel && (
              <span
                className="rounded px-2 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: "var(--surface-3)", color: "var(--ink-3)" }}
              >
                {makeLabel}
              </span>
            )}
          </div>
          {/* The vehicle, beside the registration that identifies it. It has
              come down one level, not off the page. */}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <CopyRegNo regNo={vehicle.registrationNo} />
            <span className="text-[13px] text-ink-2">{vehicleName}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {vehicle.isLocked && (
            <Chip tone="warn">
              <Lock size={11} /> Locked
            </Chip>
          )}
          {/* Provenance, stated on the file itself.
              A vehicle entered during a direct-capture window never passed the
              approval gate, and anybody reading this record — a manager, an
              auditor, whoever inherits the desk — should be told that here
              rather than having to find it in the timeline. The window's reason
              rides in the tooltip so the chip stays a chip. */}
          {vehicle.intakeSource === "BACKFILL_CAPTURE" && (
            <Chip tone="warn">
              <Unlock size={11} /> Direct entry
            </Chip>
          )}
          {vehicle.grade && (
            <Chip tone={GRADE_META[vehicle.grade].tone}>
              Grade {vehicle.grade} · {GRADE_META[vehicle.grade].label}
            </Chip>
          )}
          <Chip tone={LETTER_META[vehicle.letterStage].tone}>{LETTER_META[vehicle.letterStage].label}</Chip>
          <Chip tone={status.tone}>{status.label}</Chip>
          {vehicle.status === "LIVE_FOR_RESALE" && cycle.onHold && (
            <Chip tone="warn">On hold · {cycleLabel(cycle)}</Chip>
          )}
        </div>
      </header>

      {vehicle.repairDeadline && (
        <div
          className="mb-6 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold"
          style={
            overdue
              ? { background: "var(--bad-soft)", color: "var(--bad-ink)" }
              : { background: "var(--ok-soft)", color: "var(--ok-ink)" }
          }
        >
          <Clock size={16} />
          {overdue ? `Overdue by ${Math.abs(days!)} day${Math.abs(days!) === 1 ? "" : "s"}` : `${days} day${days === 1 ? "" : "s"} to repair deadline`}
          <span className="font-mono text-xs opacity-70">· {shortDate(vehicle.repairDeadline)}</span>
        </div>
      )}

      {/* What the engineer last reported about the work itself.
          The deadline above says how much time is left; this says whether the
          repair is actually moving, which is the question the countdown cannot
          answer on its own. */}
      {vehicle.repairStage && (
        <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Chip tone={REPAIR_STAGE_META[vehicle.repairStage].tone}>
            {REPAIR_STAGE_META[vehicle.repairStage].label}
          </Chip>
          {vehicle.repairStageNote && (
            <span className="text-[13px] text-ink-2">
              &ldquo;{vehicle.repairStageNote}&rdquo;
            </span>
          )}
          {vehicle.repairStageAt && (
            <span className="font-mono text-[11px] text-ink-3">
              reported {timeAgo(vehicle.repairStageAt)}
            </span>
          )}
        </div>
      )}

      {/* Where the file is, and every desk still waiting for it */}
      <div className="mb-4" style={{ animation: "fadeIn 0.28s var(--ease-standard) 0.04s both" }}>
        <VehicleJourney status={vehicle.status} daysAtStage={daysSince(vehicle.updatedAt)} />
      </div>

      {/* `min-w-0` on both columns.
          A grid item's `min-width` defaults to `auto`, which resolves to its
          MIN-CONTENT — so the 620px journey rail nested inside this column was
          inflating the whole track and pushing the page to 716px on a 360px
          phone. Zeroing the minimum lets the column shrink to the viewport and
          the rail scroll inside its own container, which is what it was
          already built to do. */}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0 space-y-4">
          {/* Details */}
          <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.05s both" }}>
            <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Details</h2>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
              <Detail label="Customer" value={vehicle.customerName} />
              <Detail label="Customer code" value={vehicle.customerCode} />
              {/* Mileage carries "N/A" as a real answer, so it is printed as
                  written rather than having " km" appended to it. */}
              <Detail
                label="Mileage"
                value={
                  vehicle.mileage
                    ? vehicle.mileage.toUpperCase() === "N/A"
                      ? "Not available"
                      : `${vehicle.mileage} km`
                    : undefined
                }
              />
              <Detail label="Condition at recovery" value={conditionLabel(vehicle.condition)} />
              <Detail label="Territory" value={vehicle.territory?.name} />
              <Detail label="Current location" value={locationName(vehicle) ?? undefined} />
              {/* Kept for records captured before the field was retired from the
                  form — blank on everything since. */}
              {vehicle.capturedLocation && (
                <Detail label="Captured location" value={vehicle.capturedLocation} />
              )}
              <Detail
                label="Case slip"
                value={
                  vehicle.hasCaseSlip
                    ? `Yes · fine ${taka(vehicle.caseSlipFine ?? 0)}`
                    : "No"
                }
              />
              <Detail label="Capture date" value={shortDate(vehicle.captureDate)} />
              {/* Why this file has no capture request.
                  Written out rather than hidden behind the header chip's
                  tooltip: a native tooltip never appears on a phone and never
                  on keyboard focus, and this is the sentence that answers the
                  only hard question this record raises. */}
              {vehicle.intakeSource === "BACKFILL_CAPTURE" && (
                <Detail
                  label="Entered without a request"
                  value={
                    vehicle.captureWindow
                      ? `Window opened by ${vehicle.captureWindow.openedBy.name} — ${vehicle.captureWindow.reason}`
                      : "During a direct-capture window"
                  }
                />
              )}
              {/* Field spend on the day of the seizure. Shown as a record and
                  labelled as one — it is deliberately not part of the cost
                  basis below, and a reader who assumed otherwise would think
                  the totals did not add up. */}
              {vehicle.captureCost !== null && vehicle.captureCost !== undefined && (
                <Detail
                  label="Capture cost"
                  value={`${taka(vehicle.captureCost)} · record only`}
                />
              )}
              <Detail
                label="Captured by"
                value={vehicle.capturedBy ? `${vehicle.capturedBy.name}` : "—"}
              />
              <Detail
                label="Engineer"
                value={vehicle.assignedEngineer ? `${vehicle.assignedEngineer.name}` : "Unassigned"}
              />
              {/* Registration Team gets the full editable panel below — this
                  quick-glance row is for everyone else, so the rest of the
                  chain can see what the paperwork will cost to keep current
                  without needing edit access to it. */}
              {vehicle.registrationValidUntil && user.role !== "REGISTRATION_TEAM" && (
                <Detail
                  label="Registration valid until"
                  value={`${shortDate(vehicle.registrationValidUntil)} · ${
                    validityRead.state === "sold"
                      ? "sold, untracked"
                      : validityRead.state === "expired"
                        ? `expired ${Math.abs(validityRead.daysLeft ?? 0)}d ago`
                        : `${validityRead.daysLeft}d left`
                  }${vehicle.regLines.length ? ` · est. ${taka(vehicle.regLines.reduce((s, l) => s + l.amount, 0))}` : ""}`}
                />
              )}
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
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.1s both" }}>
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
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.15s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Capture photos</h2>
              <PhotoGallery
                photos={capturePhotos.map((p) => ({ id: p.id, url: p.url, label: p.slot }))}
              />
            </section>
          )}

          {/* What used to be here.
              A sold vehicle's photographs are deleted seven days after the
              sale (see lib/photoRetention.ts). Saying so on the file is the
              point of keeping the event: without this the page is silent, and
              a silent gap reads as a vehicle that was never photographed. */}
          {capturePhotos.length === 0 && photosPurged && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.15s both" }}>
              <h2 className="mb-2 font-display text-[15px] font-bold text-ink">Capture photos</h2>
              <p className="text-[13px] leading-relaxed text-ink-2">
                {photosPurged.oldValue ?? "The"} photograph
                {photosPurged.oldValue === "1" ? " was" : "s were"} removed on{" "}
                <span className="font-medium text-ink">{shortDate(photosPurged.createdAt)}</span>,
                seven days after the sale closed. Everything else on this file is unchanged —
                the cost basis, the desk history, the sale, and every document attached to it.
              </p>
            </section>
          )}

          {/* The repair estimate the engineer submitted. Photographs go in the
              gallery; a PDF cannot, so it gets a link beside it rather than a
              broken tile inside it. */}
          {assessmentPhotos.length > 0 && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.2s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">
                Repair estimate
              </h2>
              {estimateImages.length > 0 && (
                <PhotoGallery
                  photos={estimateImages.map((p) => ({ id: p.id, url: p.url, label: "Sheet" }))}
                />
              )}
              {estimateDocs.length > 0 && (
                <div className={estimateImages.length > 0 ? "mt-3 flex flex-wrap gap-1.5" : "flex flex-wrap gap-1.5"}>
                  {estimateDocs.map((p, i) => (
                    <a
                      key={p.id}
                      href={p.url}
                      target="_blank"
                      rel="noreferrer"
                      className="sheet-chip"
                    >
                      <FileText size={12} />
                      Estimate PDF{estimateDocs.length > 1 ? ` ${i + 1}` : ""}
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* The Service Manager's signed authorisation. Shown to everyone who
              can see the file — the engineer who picks the repair back up
              most of all — with a direct download link. */}
          {approvalSheets.length > 0 && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.21s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">
                Repair approval sheet
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {approvalSheets.map((p, i) => (
                  <a
                    key={p.id}
                    href={p.url}
                    target="_blank"
                    rel="noreferrer"
                    download
                    className="sheet-chip"
                  >
                    <FileText size={12} />
                    Approval sheet{approvalSheets.length > 1 ? ` ${i + 1}` : ""}
                  </a>
                ))}
              </div>
            </section>
          )}

          {/* ---- Archived breakdown ----
              Vehicles assessed before the estimate became a single figure plus
              an uploaded sheet still carry their itemisation. It is read-only
              and it is history, but deleting the detail a repair was approved
              on is not something a change of input format gets to do. */}
          {vehicle.repairLines.length > 0 && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.24s both" }}>
              <h2 className="font-display text-[15px] font-bold text-ink">
                Itemised estimate
              </h2>
              <p className="mb-3 mt-0.5 text-[11.5px] text-ink-3">
                Archived — entered before estimates moved to a single figure and a sheet.
              </p>
              <ul className="space-y-1.5 text-sm">
                {vehicle.repairLines.map((l) => (
                  <li key={l.id} className="flex items-baseline justify-between gap-3">
                    <span className="min-w-0 truncate text-ink-2">{l.description}</span>
                    <span className="tnum shrink-0 text-ink">{taka(l.amount)}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* The signed paper form the ARO photographed at capture. Kept apart
              from the vehicle angles: it is evidence of the handover, not of
              the vehicle's condition. */}
          {captureFormPhotos.length > 0 && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.22s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Capture form</h2>
              <PhotoGallery
                photos={captureFormPhotos.map((p) => ({ id: p.id, url: p.url, label: "Form" }))}
              />
            </section>
          )}
        </div>

        {/* Sidebar */}
        <div className="min-w-0 space-y-4">
          {!(user.role === "GM_SR_GM" && vehicle.status === "PRICE_APPROVED") && (
            <VehicleActions
              vehicleId={vehicle.id}
              status={vehicle.status}
              role={user.role}
              isOwner={vehicle.capturedById === user.id}
            />
          )}

          {user.role === "SERVICE_ENGINEER" && <StageLock lock={lock} />}
          {user.role === "SERVICE_ENGINEER" && lock.state === "reopened" && (
            <ReworkBanner lock={lock} />
          )}

          {(user.role === "SERVICE_ENGINEER" || user.role === "SUPER_ADMIN") &&
            vehicle.status === "CN_APPROVED" &&
            (user.role === "SUPER_ADMIN" || vehicle.assignedEngineerId === user.id) && (
              <EngineerAssessmentPanel
                vehicleId={vehicle.id}
                subject={subject}
                initialRepairCost={vehicle.costing?.repairCost ?? 0}
                initialNote={vehicle.costing?.repairNote ?? ""}
                initialTransport={vehicle.costing?.transportCost ?? 0}
                initialOther={vehicle.costing?.otherCost ?? 0}
                existingSheets={assessmentPhotos.map((p) => ({ id: p.id, url: p.url }))}
              />
            )}

          {/* ---- Handover set ----
              The engineer's last act on the vehicle. Rendered for the desks
              that need to act on it or answer for it: the engineer files it,
              the Service Manager and admin can see whether it has been filed.
              An as-is vehicle never gets one — no work was done, so there is
              nothing new to photograph. */}
          {vehicle.status === "REPAIR_APPROVED" &&
            !vehicle.asIs &&
            (user.role === "SUPER_ADMIN" ||
              (user.role === "SERVICE_ENGINEER" && vehicle.assignedEngineerId === user.id)) && (
              <HandoverSheet vehicleId={vehicle.id} pairs={handoverPairs} />
            )}

          {user.role === "SERVICE_HEAD" && <StageLock lock={lock} />}

          {(user.role === "SERVICE_HEAD" || user.role === "SUPER_ADMIN") &&
            vehicle.status === "COST_SUBMITTED" && (
              <ServiceHeadPanel
                vehicleId={vehicle.id}
                subject={subject}
                repairCost={vehicle.costing?.repairCost ?? 0}
                repairNote={vehicle.costing?.repairNote ?? null}
                sheets={assessmentPhotos.map((p) => ({ id: p.id, url: p.url }))}
                transportCost={vehicle.costing?.transportCost ?? 0}
                otherCost={vehicle.costing?.otherCost ?? 0}
              />
            )}

          {user.role === "REGISTRATION_TEAM" && <StageLock lock={lock} />}

          {(user.role === "REGISTRATION_TEAM" || user.role === "SUPER_ADMIN") &&
            vehicle.status === "REPAIR_APPROVED" && (
              <RegistrationPanel
                vehicleId={vehicle.id}
                subject={subject}
                initialLines={vehicle.regLines.map((l) => ({ description: l.description, amount: l.amount }))}
              />
            )}

          {/* The one panel on this page that does not close when the file
              moves on — Registration's watch over the paperwork and its cost
              stays open for the vehicle's whole life from here. */}
          {(user.role === "REGISTRATION_TEAM" || user.role === "SUPER_ADMIN") &&
            vehicle.registrationValidUntil && (
              <RegistrationStatusPanel
                vehicleId={vehicle.id}
                initialLines={vehicle.regLines.map((l) => ({ description: l.description, amount: l.amount }))}
                validUntil={vehicle.registrationValidUntil.toISOString()}
                validDays={vehicle.registrationValidDays}
                sold={vehicle.status === "SOLD"}
              />
            )}

          {user.role === "SR_EXECUTIVE" && <StageLock lock={lock} />}

          {(user.role === "SR_EXECUTIVE" || user.role === "SUPER_ADMIN") &&
            canEditSop(user.role, vehicle.status) && (
              <SopPanel
                vehicleId={vehicle.id}
                subject={subject}
                currentSop={vehicle.costing?.sopCost ?? 0}
                currentCommission={vehicle.costing?.dealerCommission ?? 0}
                costBase={breakdown.total - breakdown.sop - breakdown.dealerCommission}
                isFirstSet={vehicle.status === "REGISTRATION_DONE"}
                currentGrade={vehicle.grade}
                currentPrice={breakdown.approvedPrice}
                cycleEndsAt={vehicle.resaleCycleEndsAt?.toISOString() ?? null}
                isLive={vehicle.status === "LIVE_FOR_RESALE"}
              />
            )}

          {user.role === "AGM_DGM" && <StageLock lock={lock} />}
          {user.role === "AGM_DGM" && lock.state === "reopened" && <ReworkBanner lock={lock} />}

          {(user.role === "AGM_DGM" || user.role === "SUPER_ADMIN") &&
            canEditPrice(user.role, vehicle.status) && (
              <PricePanel
                vehicleId={vehicle.id}
                subject={subject}
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
              subject={subject}
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
              image={heroShot}
              offers={visibleOffers}
              sealed={!seesAllBids}
              canOffer={mayBid}
              canAward={mayAward}
              approvedPrice={breakdown.approvedPrice}
              sold={
                isSold
                  ? {
                      at: vehicle.soldAt?.toISOString() ?? null,
                      amount: winningBid?.amount ?? null,
                      customer: winningBid?.customerName ?? null,
                      via: winningBid?.officerName ?? null,
                    }
                  : null
              }
              winningBidId={vehicle.winningBidId}
            />
          )}

          {/* Field roles get the journey in this slot instead of the money.
              Once their part is done that IS the answer they came for: not what
              the vehicle costs, but where their file has got to. */}
          {!seesCosts && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.1s both" }}>
              <div className="mb-3 flex items-baseline justify-between gap-3">
                <h2 className="font-display text-[15px] font-bold text-ink">Where this file is</h2>
                <span className="font-mono text-[10px] text-ink-3">
                  {lock.state === "locked" ? "your part is done" : "live status"}
                </span>
              </div>
              <VehicleJourney
                status={vehicle.status}
                daysAtStage={daysSince(vehicle.updatedAt)}
              />
              <p className="mt-3 text-[11.5px] leading-snug text-ink-2">
                {lock.state === "locked"
                  ? `You handed this on. ${status.heldBy} has it now — the timeline below records every step it takes from here.`
                  : `Sitting with ${status.heldBy}.`}
              </p>
            </section>
          )}

          {hasCosts && (
            <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.1s both" }}>
              <h2 className="mb-3 font-display text-[15px] font-bold text-ink">Cost summary</h2>
              <dl className="space-y-2.5 text-sm">
                <CostRow label="Repair" value={taka(breakdown.repair)} />
                <CostRow label="Transport" value={taka(breakdown.transport)} />
                <CostRow label="Other" value={taka(breakdown.other)} />
                <CostRow label="Registration" value={taka(breakdown.registration)} />
                <CostRow label="SOP" value={taka(breakdown.sop)} />
                <CostRow label="Dealer commission" value={taka(breakdown.dealerCommission)} />
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
          <section className="card p-4" style={{ animation: "fadeIn 0.2s var(--ease-standard) 0.15s both" }}>
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
