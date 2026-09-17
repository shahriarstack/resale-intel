"use client";

import { useState } from "react";
import {
  CarFront,
  ChevronDown,
  Clock,
  Flag,
  Landmark,
  MapPin,
  Undo2,
} from "lucide-react";
import { AccountTitle } from "@/components/ui/AccountTitle";
import { Chip } from "@/components/ui/Chip";
import { CaseActionModal } from "@/components/offroad/CaseActionModal";
import { RaiseFlagModal, ResolveFlagModal } from "@/components/offroad/CaseFlagModal";
import {
  ACCIDENT_SEVERITY_META,
  CONDITION_META,
  FLAG_META,
  OFFROAD_KIND_META,
  OFFROAD_STATUS_META,
  caseReasonLine,
} from "@/lib/offroad";
import { shortDate, takaCompact } from "@/lib/format";
import type { CaseRow, FlagRow } from "@/lib/recoveryDesk";

/**
 * One off-road case as a ROW, for the HQ console.
 *
 * A card is the right shape on a phone, where one case fills the screen and
 * the officer is acting on it. It is the wrong shape at a desk: a supervisor
 * is comparing thirty cases, and comparison needs columns that line up. The
 * card layout put the clock in a different horizontal position on every row,
 * which is exactly what makes a list impossible to scan.
 *
 * So the desk gets aligned columns — vehicle, customer, territory, officer,
 * reason, clock, flags, actions — and everything that does not fit is behind
 * one disclosure per row. The card is unchanged and still serves the field.
 */
export function CaseListRow({ kase, readOnly = false }: { kase: CaseRow; readOnly?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const [raising, setRaising] = useState(false);
  const [resolving, setResolving] = useState<FlagRow | null>(null);
  const [revising, setRevising] = useState(false);

  const kind = OFFROAD_KIND_META[kase.kind];
  const statusMeta = OFFROAD_STATUS_META[kase.status];
  const open = statusMeta.open;
  const live = open && !readOnly;
  const Icon = kase.kind === "ACCIDENT" ? CarFront : Landmark;

  // At the desk the inbound flag is the officer's support request and the
  // outbound one is the desk's own attention flag. Fixed, unlike the card,
  // because this component only ever renders for the desk.
  const inbound = kase.openSupport;
  const mine = kase.openAttention;

  return (
    <>
      <div
        className="grid items-center gap-x-3 border-b border-rule px-3 py-2 transition-colors hover:bg-surface-2"
        style={{
          gridTemplateColumns:
            "minmax(186px,1.5fr) minmax(96px,0.68fr) 92px minmax(96px,0.8fr) minmax(120px,0.9fr) minmax(104px,0.8fr) 116px auto",
        }}
      >
        {/* Vehicle */}
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className="grid h-7 w-7 shrink-0 place-items-center rounded-md"
            style={{
              background: `color-mix(in srgb, ${toneVar(kind.tone)} 12%, var(--surface))`,
              color: toneVar(kind.tone),
            }}
          >
            <Icon size={14} />
          </span>
          <div className="min-w-0">
            {/* The account leads the row; the vehicle takes the column the
                customer used to hold. Same three facts, ends swapped — see
                lib/vehicle.ts. */}
            <AccountTitle
              record={kase}
              as="div"
              className="font-display text-[13.5px] font-bold leading-tight text-ink"
            />
            <div className="truncate font-mono text-[10.5px] text-ink-3">
              {kase.registrationNo}
            </div>
          </div>
        </div>

        {/* Vehicle */}
        <div className="min-w-0">
          <div className="truncate text-[12.5px] text-ink-2">
            {[kase.make, kase.model].filter(Boolean).join(" ") || "Vehicle"}
          </div>
        </div>

        {/* Kind / status */}
        <div>
          <Chip tone={open ? kind.tone : statusMeta.tone}>
            {open ? kind.short : statusMeta.label}
          </Chip>
        </div>

        {/* Officer + territory */}
        <div className="min-w-0">
          <div className="truncate text-[12px] text-ink-2">{kase.openedBy?.name ?? "—"}</div>
          <div className="truncate font-mono text-[10.5px] text-ink-3">
            {kase.territory?.name ?? "—"}
          </div>
        </div>

        {/* Reason */}
        <div className="min-w-0 truncate text-[12px] text-ink-2">{caseReasonLine(kase)}</div>

        {/* Exposure — what is riding on this case.
            Three figures in one column rather than three columns: the
            outstanding is the number that ranks one case against another, and
            the overdue pair is the context that explains it. A case opened
            without the account position to hand says so rather than showing
            three zeroes, which would read as a customer who owes nothing. */}
        <div className="min-w-0 text-right">
          {kase.outstandingAmount === null && kase.odAmount === null ? (
            <span className="font-mono text-[10.5px] text-ink-3">not recorded</span>
          ) : (
            <>
              <div className="truncate font-mono text-[12px] font-bold tnum text-ink">
                {kase.outstandingAmount === null ? "—" : takaCompact(kase.outstandingAmount)}
              </div>
              <div className="truncate font-mono text-[10px] text-ink-3">
                {kase.odNumber !== null ? `OD ${kase.odNumber}` : "OD —"}
                {kase.odAmount !== null ? ` · ${takaCompact(kase.odAmount)}` : ""}
              </div>
            </>
          )}
        </div>

        {/* Clock — the column a supervisor actually scans, so it is the one
            place on the row where the figure is allowed to shout. */}
        <div className="text-right">
          {open ? (
            <>
              <div
                className="font-mono text-[13px] font-bold tnum"
                style={{ color: toneVar(kase.clock.tone) }}
              >
                {kase.clock.overdue ? `+${kase.clock.overdueDays}d` : `${kase.clock.daysLeft}d`}
              </div>
              <div className="font-mono text-[10px] text-ink-3 tnum">
                {kase.clock.elapsedDays}/{kase.clock.days}
                {kase.clock.revised ? " ↑" : ""}
              </div>
            </>
          ) : (
            <div className="font-mono text-[10.5px] text-ink-3">{shortDate(kase.resolvedAt)}</div>
          )}
        </div>

        {/* Flags + controls */}
        <div className="flex shrink-0 items-center gap-1">
          {inbound && (
            <button
              onClick={() => setResolving(inbound)}
              title={`Support requested ${inbound.ageDays}d ago`}
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold"
              style={{
                background: "color-mix(in srgb, var(--accent) 12%, var(--surface))",
                color: "var(--accent)",
              }}
            >
              <Flag size={11} />
              {inbound.ageDays}d
            </button>
          )}
          {mine && (
            <button
              onClick={() => setResolving(mine)}
              title="You flagged this — click to withdraw"
              className="flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-bold"
              style={{
                background: "color-mix(in srgb, var(--warn) 12%, var(--surface))",
                color: "var(--warn)",
              }}
            >
              <Undo2 size={11} />
              {mine.ageDays}d
            </button>
          )}
          {live && !mine && (
            <button
              onClick={() => setRaising(true)}
              title="Flag for the officer"
              aria-label="Flag for the officer"
              className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-warn"
            >
              <Flag size={14} />
            </button>
          )}
          {live && (
            <button
              onClick={() => setRevising(true)}
              title="Revise the window"
              aria-label="Revise the window"
              className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-accent"
            >
              <Clock size={14} />
            </button>
          )}
          <button
            onClick={() => setExpanded((s) => !s)}
            aria-expanded={expanded}
            aria-label={expanded ? "Hide detail" : "Show detail"}
            className="grid h-7 w-7 place-items-center rounded-md text-ink-3 transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <ChevronDown
              size={15}
              className="transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : undefined }}
            />
          </button>
        </div>
      </div>

      {expanded && (
        <div
          className="border-b border-rule px-3 py-3"
          style={{ background: "var(--surface-2)", animation: "slideDown 0.16s var(--ease-standard)" }}
        >
          {inbound && (
            <div
              className="mb-3 rounded-lg px-3 py-2"
              style={{ background: "color-mix(in srgb, var(--accent) 7%, var(--surface))" }}
            >
              <div className="label !mb-0.5 text-[9px]" style={{ color: "var(--accent)" }}>
                {FLAG_META.SUPPORT_REQUEST.inboundTitle}
              </div>
              <p className="whitespace-pre-line text-[12.5px] leading-snug text-ink-2">
                {inbound.note}
              </p>
              <p className="mt-1 font-mono text-[10px] text-ink-3">
                — {inbound.raisedBy?.name ?? "—"} · {inbound.ageDays}d ago
              </p>
            </div>
          )}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-4">
            <Fact label={kase.kind === "ACCIDENT" ? "Accident date" : "Seized on"}>
              {shortDate(kase.occurredAt)}
            </Fact>
            <Fact label="Mileage">{kase.mileage ?? "—"}</Fact>
            {kase.kind === "ACCIDENT" ? (
              <>
                <Fact label="Severity">
                  {kase.accidentSeverity ? (
                    <Chip tone={ACCIDENT_SEVERITY_META[kase.accidentSeverity].tone}>
                      {ACCIDENT_SEVERITY_META[kase.accidentSeverity].label}
                    </Chip>
                  ) : (
                    "—"
                  )}
                </Fact>
                <Fact label="Field estimate">{kase.approxDays} days</Fact>
                {kase.accidentNote && (
                  <Fact label="Damage" wide>
                    {kase.accidentNote}
                  </Fact>
                )}
              </>
            ) : (
              <>
                <Fact label="Vehicle condition">
                  {kase.vehicleCondition ? (
                    <Chip tone={CONDITION_META[kase.vehicleCondition].tone}>
                      {CONDITION_META[kase.vehicleCondition].label}
                    </Chip>
                  ) : (
                    "—"
                  )}
                </Fact>
                <Fact label="Held at">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={11} className="shrink-0 text-ink-3" />
                    {kase.vehicleLocation ?? "—"}
                  </span>
                </Fact>
                {kase.thanaReasonNote && (
                  <Fact label="Case detail" wide>
                    {kase.thanaReasonNote}
                  </Fact>
                )}
              </>
            )}
            <Fact label="Remarks" wide>
              {kase.remarks}
            </Fact>
            {kase.clock.revised && kase.revisedBy && (
              <Fact label="Window revised" wide>
                {kase.revisedBy.name} · {shortDate(kase.revisedAt)} · {kase.approxDays}d →{" "}
                {kase.revisedDays}d
              </Fact>
            )}
            {kase.nocReference && (
              <Fact label="NOC">
                <span className="font-mono">{kase.nocReference}</span>
              </Fact>
            )}
            {kase.resolutionNote && (
              <Fact label="Outcome" wide>
                {kase.resolutionNote}
              </Fact>
            )}
          </dl>

          {kase.photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {kase.photos.map((p) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={p.id}
                  src={p.url}
                  alt={p.caption ?? "Case photo"}
                  className="h-16 w-16 rounded-md object-cover"
                  style={{ border: "1px solid var(--rule)" }}
                />
              ))}
            </div>
          )}

          {kase.flags.filter((f) => f.status === "RESOLVED").length > 0 && (
            <div className="mt-3">
              <div className="label text-[9px]">Flag history</div>
              <ul className="flex flex-col gap-1.5">
                {kase.flags
                  .filter((f) => f.status === "RESOLVED")
                  .map((f) => (
                    <li key={f.id} className="text-[11.5px] leading-snug text-ink-2">
                      <span className="font-semibold">{FLAG_META[f.kind].label}</span>
                      <span className="text-ink-3">
                        {" "}
                        · {f.raisedBy?.name ?? "—"} · {shortDate(f.raisedAt)}
                      </span>
                      : {f.note}
                      {f.resolutionNote && (
                        <span className="text-ink-3"> ↳ {f.resolutionNote}</span>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {raising && (
        <RaiseFlagModal kind="ATTENTION" kase={kase} onClose={() => setRaising(false)} />
      )}
      {resolving && (
        <ResolveFlagModal
          flag={resolving}
          caseId={kase.id}
          withdrawing={resolving.kind === "ATTENTION"}
          onClose={() => setResolving(null)}
        />
      )}
      {revising && (
        <CaseActionModal
          open
          action="REVISE_TIMELINE"
          kase={kase}
          onClose={() => setRevising(false)}
        />
      )}
    </>
  );
}

/** The column headings for a list of these rows. */
export function CaseListHeader() {
  return (
    <div
      className="grid items-center gap-x-3 border-b border-rule-strong px-3 py-2"
      style={{
        gridTemplateColumns:
          "minmax(186px,1.5fr) minmax(96px,0.68fr) 92px minmax(96px,0.8fr) minmax(120px,0.9fr) minmax(104px,0.8fr) 116px auto",
        background: "var(--surface-2)",
      }}
    >
      {["Customer", "Vehicle", "Type", "Officer · territory", "Reason"].map((h) => (
        <span key={h} className="label !mb-0 text-[9px]">
          {h}
        </span>
      ))}
      <span className="label !mb-0 text-right text-[9px]">Exposure</span>
      <span className="label !mb-0 text-right text-[9px]">Window</span>
      <span className="label !mb-0 text-right text-[9px]">Actions</span>
    </div>
  );
}

function Fact({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "col-span-2 md:col-span-4" : undefined}>
      <dt className="label !mb-0.5 text-[9px]">{label}</dt>
      <dd className="break-words text-[12px] leading-snug text-ink-2">{children}</dd>
    </div>
  );
}

function toneVar(tone: string): string {
  switch (tone) {
    case "ok":
      return "var(--ok)";
    case "warn":
      return "var(--warn)";
    case "bad":
      return "var(--bad)";
    case "accent":
      return "var(--accent)";
    default:
      return "var(--ink-3)";
  }
}
