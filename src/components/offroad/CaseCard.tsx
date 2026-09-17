"use client";

import { useState } from "react";
import {
  Clock,
  Flag,
  MapPin,
  ShieldCheck,
  CheckCircle2,
  LogOut,
  ChevronDown,
  Undo2,
} from "lucide-react";
import { CrashArt, PoliceArt } from "@/components/aro/Art";
import { AccountTitle } from "@/components/ui/AccountTitle";
import { Chip } from "@/components/ui/Chip";
import { CaseClockRing, CaseClockLine } from "@/components/offroad/CaseClock";
import { CaseActionModal } from "@/components/offroad/CaseActionModal";
import { RaiseFlagModal, ResolveFlagModal } from "@/components/offroad/CaseFlagModal";
import {
  ACCIDENT_SEVERITY_META,
  CONDITION_META,
  FLAG_META,
  OFFROAD_KIND_META,
  OFFROAD_STATUS_META,
  caseReasonLine,
  flagsFor,
  type CaseAction,
  type CaseViewer,
} from "@/lib/offroad";
import { shortDate } from "@/lib/format";
import type { CaseRow, FlagRow } from "@/lib/recoveryDesk";

/**
 * One off-road case, as a card.
 *
 * Shared between the officer's phone and the manager's console, and driven by
 * a single `viewer` prop rather than a handful of independent booleans. That
 * one word decides everything: who may close the case, who may move the clock,
 * which flag this person raises and which one they answer. Four separate
 * capability props would have let a caller assemble a combination that does not
 * exist in the business — a desk that closes cases, a field officer who
 * revises timelines — and one of them eventually would have.
 *
 *   field → closes the case, asks for support, answers attention flags
 *   desk  → revises the clock, raises attention, answers support requests
 *
 * The asymmetry is deliberate. Closing a case is an assertion about a physical
 * vehicle, and only the person who can see it should make one.
 */
export function CaseCard({
  kase,
  viewer,
  readOnly = false,
  showOwner = false,
}: {
  kase: CaseRow;
  viewer: CaseViewer;
  /** Closed cases, and any surface that is purely a readout. */
  readOnly?: boolean;
  /** Manager view: whose case this is matters; on the officer's own list it does not. */
  showOwner?: boolean;
}) {
  const [action, setAction] = useState<CaseAction | null>(null);
  const [raising, setRaising] = useState(false);
  const [resolving, setResolving] = useState<FlagRow | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [moreOutcomes, setMoreOutcomes] = useState(false);

  const kind = OFFROAD_KIND_META[kase.kind];
  const statusMeta = OFFROAD_STATUS_META[kase.status];
  const open = statusMeta.open;
  // The illustration carries its own colour, so it reads the same on a tinted
  // plate as on white — unlike the stroke glyph it replaced, which had to be
  // tinted by its container before it meant anything.
  const Art = kase.kind === "ACCIDENT" ? CrashArt : PoliceArt;
  // Slate for an accident, matching CrashArt's bodywork — the plate and the
  // drawing on it have to agree, or the tint reads as a second, contradicting
  // signal.
  const tone = kase.kind === "ACCIDENT" ? "#475569" : "#0e7490";
  const live = open && !readOnly;

  const { raises, answers } = flagsFor(viewer);
  // The flag addressed to whoever is looking, and the one they raised
  // themselves — two different affordances on the same card.
  const inbound = answers === "SUPPORT_REQUEST" ? kase.openSupport : kase.openAttention;
  const mine = raises === "SUPPORT_REQUEST" ? kase.openSupport : kase.openAttention;

  const resolvedFlags = kase.flags.filter((f) => f.status === "RESOLVED");

  // Urgency, as one value rather than three nested conditionals at the border.
  // An unanswered flag outranks a late clock: a clock running out is a fact,
  // a flag is a person waiting.
  const urgency: { tone: string; label: string } | null = inbound
    ? { tone: flagEdge(inbound.kind), label: FLAG_META[inbound.kind].inboundTitle }
    : live && kase.clock.overdue
      ? { tone: "var(--bad)", label: kase.clock.label }
      : live && kase.clock.tone === "warn"
        ? { tone: "var(--warn)", label: kase.clock.label }
        : null;

  return (
    // No coloured left edge. It was doing the same job on four different kinds
    // of surface across the product, at which point it had stopped being a
    // signal and become a house style — and on a phone it ate 3px of an
    // already narrow card. Urgency is now a flat tinted strip across the top,
    // which can also say WHAT is wrong instead of only that something is.
    <article className="card overflow-hidden">
      {urgency && (
        <div
          className="flex items-center gap-1.5 px-3 py-1 text-[10.5px] font-bold uppercase tracking-wide"
          style={{
            background: `color-mix(in srgb, ${urgency.tone} 12%, var(--surface))`,
            color: urgency.tone,
          }}
        >
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: urgency.tone }}
          />
          {urgency.label}
        </div>
      )}
      <div className="p-2.5">
      {/* ---- The ask, if there is one addressed to this reader ---- */}
      {inbound && (
        <FlagBanner
          flag={inbound}
          onResolve={() => setResolving(inbound)}
          disabled={readOnly}
        />
      )}

      <div className="grid grid-cols-[auto_1fr_auto] items-start gap-x-3">
        <span
          className="aro-art h-8 w-8 shrink-0"
          style={{ ["--tone" as string]: tone }}
        >
          <Art size={21} className="art-float" />
        </span>

        <div className="min-w-0">
          {/* The title gets the line to itself.
              It shared it with the kind chip and the pair wrapped, costing
              42px of a 90px identity block on most cards — this column has
              only 219px between the art tile and the clock ring, and
              "Accident" is enough to push a model name over. Truncating the
              title instead was worse: "Foton 3 TON AUMAR…" cannot be told
              apart from any other AUMARK. So the chip moved down to the reason
              line, which had width to spare, and nothing is cut or lost. */}
          {/* THE CUSTOMER HEADS THE CARD, not the truck. A case is a file on
              an account that has stopped paying; the vehicle is what is
              standing in a compound because of it. See lib/vehicle.ts. */}
          <AccountTitle record={kase} className="f-item" />
          {/* The vehicle, demoted to the line the customer used to sit on.
              Registration first and shrink-0 — "DEMO-OR-CTG-15-88…" identifies
              nothing — with the model absorbing whatever is left, and wrapping
              to its own line before it truncates. */}
          <p className="f-meta mt-0.5 flex flex-wrap items-baseline gap-x-1">
            <span className="shrink-0">{kase.registrationNo}</span>
            <span className="min-w-0 truncate">
              {[kase.make, kase.model].filter(Boolean).join(" ") || "Vehicle"}
            </span>
          </p>
          {/* Reason and kind, together. Both answer "what kind of case is
              this" and neither needs a line of its own. */}
          <div className="mt-0.5 flex min-w-0 items-center gap-x-2">
            <span className="f-line min-w-0 truncate">{caseReasonLine(kase)}</span>
            <span className="shrink-0">
              <Chip tone={open ? kind.tone : statusMeta.tone}>
                {open ? kind.short : statusMeta.label}
              </Chip>
            </span>
          </div>
        </div>

        {open ? (
          <CaseClockRing clock={kase.clock} />
        ) : (
          <span className="shrink-0 font-mono text-[10.5px] text-ink-3">
            {shortDate(kase.resolvedAt)}
          </span>
        )}
      </div>

      {open && (
        <div className="mt-1.5 border-t border-rule pt-1.5">
          <CaseClockLine clock={kase.clock} />
        </div>
      )}

      {/* A flag this reader raised and is still waiting on — a status line, not
          a call to action, with a way to take it back. */}
      {mine && (
        <div className="mt-1.5 flex items-center gap-2 rounded-lg bg-surface-2 px-2.5 py-1">
          <Flag size={12} className="shrink-0" style={{ color: flagEdge(mine.kind) }} />
          <span className="flex-1 truncate text-[11.5px] text-ink-2">
            {FLAG_META[mine.kind].label} sent
            {mine.ageDays > 0 ? ` · ${mine.ageDays}d ago` : " · today"}
          </span>
          {!readOnly && (
            <button
              className="shrink-0 text-[11px] font-semibold text-ink-3 underline-offset-2 hover:underline"
              onClick={() => setResolving(mine)}
            >
              <Undo2 size={11} className="mr-0.5 inline" />
              Withdraw
            </button>
          )}
        </div>
      )}

      {/* ---- Detail ---- */}
      <button
        onClick={() => setExpanded((s) => !s)}
        className="mt-1.5 flex w-full items-center justify-between rounded-lg px-1 py-0.5 text-[11.5px] font-semibold text-ink-3 transition-colors hover:bg-surface-2"
        aria-expanded={expanded}
      >
        {expanded ? "Hide detail" : "Detail"}
        <ChevronDown
          size={14}
          className="transition-transform"
          style={{ transform: expanded ? "rotate(180deg)" : undefined }}
        />
      </button>

      {expanded && (
        <div style={{ animation: "slideDown 0.18s var(--ease-standard)" }}>
          <dl className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-lg bg-surface-2 p-2.5 text-[12px]">
            <Fact label={kase.kind === "ACCIDENT" ? "Accident date" : "Seized on"}>
              {shortDate(kase.occurredAt)}
            </Fact>
            <Fact label="Customer ID">{kase.customerCode}</Fact>
            <Fact label="Mileage">{kase.mileage ?? "—"}</Fact>
            <Fact label="Territory">{kase.territory?.name ?? "—"}</Fact>

            {kase.kind === "ACCIDENT" ? (
              <>
                <Fact label="Condition">
                  {kase.accidentSeverity ? (
                    <Chip tone={ACCIDENT_SEVERITY_META[kase.accidentSeverity].tone}>
                      {ACCIDENT_SEVERITY_META[kase.accidentSeverity].label}
                    </Chip>
                  ) : (
                    "—"
                  )}
                </Fact>
                <Fact label="Repair estimate">{kase.approxDays} days</Fact>
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
                <Fact label="Thana">{kase.thanaName ?? "—"}</Fact>
                <Fact label="Vehicle held at" wide>
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
            {showOwner && (
              <Fact label="Opened by" wide>
                {kase.openedBy?.name ?? "—"}
                {kase.openedBy?.staffId ? ` · ${kase.openedBy.staffId}` : ""}
              </Fact>
            )}
            {kase.clock.revised && kase.revisedBy && (
              <Fact label="Timeline revised" wide>
                {kase.revisedBy.name} · {shortDate(kase.revisedAt)} · {kase.approxDays}d →{" "}
                {kase.revisedDays}d
              </Fact>
            )}
            {kase.nocReference && (
              <Fact label="NOC reference" wide>
                <span className="font-mono">{kase.nocReference}</span>
              </Fact>
            )}
            {kase.resolutionNote && (
              <Fact label="Outcome" wide>
                {kase.resolutionNote}
              </Fact>
            )}
            {kase.photos.length > 0 && (
              <Fact label={`Photos (${kase.photos.length})`} wide>
                <span className="mt-1 flex flex-wrap gap-1.5">
                  {kase.photos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={p.id}
                      src={p.url}
                      alt={p.caption ?? "Case photo"}
                      className="h-14 w-14 rounded-md object-cover"
                      style={{ border: "1px solid var(--rule)" }}
                    />
                  ))}
                </span>
              </Fact>
            )}
          </dl>

          {/* The flag history — what has already been asked and answered on
              this case, which is the fastest read on whether it has been
              looked after. */}
          {resolvedFlags.length > 0 && (
            <div className="mt-2 rounded-lg bg-surface-2 p-2.5">
              <div className="label text-[9.5px]">Flag history</div>
              <ul className="mt-1.5 flex flex-col gap-2">
                {resolvedFlags.map((f) => (
                  <li key={f.id} className="text-[11.5px] leading-snug">
                    <span className="font-semibold" style={{ color: flagEdge(f.kind) }}>
                      {FLAG_META[f.kind].label}
                    </span>
                    <span className="text-ink-3">
                      {" "}
                      · {f.raisedBy?.name ?? "—"} · {shortDate(f.raisedAt)}
                    </span>
                    <p className="text-ink-2">{f.note}</p>
                    <p className="text-ink-3">
                      ↳ closed by {f.resolvedBy?.name ?? "—"} · {shortDate(f.resolvedAt)}
                      {f.resolutionNote ? ` · ${f.resolutionNote}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ---- Actions ---- */}
      {live && viewer === "field" && (
        <>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <button className="btn btn-ok btn-sm" onClick={() => setAction("MARK_ONROAD")}>
              <CheckCircle2 size={14} /> Back on-road
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setRaising(true)}
              disabled={!!mine}
            >
              <Flag size={14} /> {mine ? "Help requested" : "Ask for help"}
            </button>
          </div>

          {/* Converting to a capture is rare and irreversible, so it is not a
              peer of the button an officer taps every week. One tap away, and
              behind a label that says what these are. */}
          <button
            onClick={() => setMoreOutcomes((s) => !s)}
            className="mt-0.5 flex w-full items-center justify-center gap-1 rounded-lg py-0.5 text-[11px] font-semibold text-ink-3 transition-colors hover:bg-surface-2"
            aria-expanded={moreOutcomes}
          >
            Other outcomes
            <ChevronDown
              size={13}
              className="transition-transform"
              style={{ transform: moreOutcomes ? "rotate(180deg)" : undefined }}
            />
          </button>
          {moreOutcomes && (
            <div
              className="mt-1 flex flex-col gap-2"
              style={{ animation: "slideDown 0.18s var(--ease-standard)" }}
            >
              {kase.kind === "THANA" && (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setAction("RELEASE_TO_CUSTOMER")}
                >
                  <LogOut size={14} /> Released to the customer
                </button>
              )}
              <button
                className="btn btn-danger btn-sm"
                onClick={() => setAction("CONVERT_TO_CAPTURE")}
              >
                <ShieldCheck size={14} /> Convert to capture
              </button>
            </div>
          )}
        </>
      )}

      {live && viewer === "desk" && (
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setRaising(true)}
            disabled={!!mine}
          >
            <Flag size={14} /> {mine ? "Flag sent" : "Flag for officer"}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => setAction("REVISE_TIMELINE")}>
            <Clock size={14} /> Revise window
          </button>
        </div>
      )}

      {action && <CaseActionModal open action={action} kase={kase} onClose={() => setAction(null)} />}
      {raising && <RaiseFlagModal kind={raises} kase={kase} onClose={() => setRaising(false)} />}
      {resolving && (
        <ResolveFlagModal
          flag={resolving}
          caseId={kase.id}
          withdrawing={resolving.kind === raises}
          onClose={() => setResolving(null)}
        />
      )}
      </div>
    </article>
  );
}

/**
 * The ask, at the top of the card, in the recipient's language.
 *
 * Above the vehicle rather than below the buttons: someone is waiting, and a
 * card that shows the truck first and the person second gets scrolled past.
 */
function FlagBanner({
  flag,
  onResolve,
  disabled,
}: {
  flag: FlagRow;
  onResolve: () => void;
  disabled?: boolean;
}) {
  const meta = FLAG_META[flag.kind];
  const color = flagEdge(flag.kind);

  return (
    // A tinted plane rather than a flat wash. The 7% single-value fill this
    // replaces sat LIGHTER than the hairlines around it, so it read as a
    // bleached patch instead of a deliberate surface; it now falls from 9% to
    // 14% and is closed with a hairline in its own hue. The earlier note here
    // argued against a border on the grounds that the strip above already
    // carries the colour — true of a heavy border, but a hairline is what
    // stops the tint bleeding into the card and is why the panel now reads as
    // placed rather than poured.
    <div
      className="mb-2 rounded-lg px-2.5 py-1.5"
      style={{
        backgroundImage: `linear-gradient(180deg, color-mix(in srgb, ${color} 9%, var(--surface)), color-mix(in srgb, ${color} 14%, var(--surface)))`,
        border: `1px solid color-mix(in srgb, ${color} 24%, var(--surface))`,
      }}
    >
      <p className="whitespace-pre-line text-[12.5px] leading-snug text-ink-2">{flag.note}</p>
      <p className="mt-1 font-mono text-[10px] text-ink-3">
        — {flag.raisedBy?.name ?? "—"}
        {flag.raisedBy?.staffId ? ` · ${flag.raisedBy.staffId}` : ""} ·{" "}
        {flag.ageDays === 0 ? "today" : `${flag.ageDays}d ago`}
      </p>
      {/* Left-aligned and only as wide as it needs to be. Full width would put
          the one button on this card that somebody is waiting on directly
          under the floating "Add vehicle" control. */}
      {!disabled && (
        <button
          className="btn btn-sm mt-2"
          // The same lit-from-above ramp the primary buttons carry, so this
          // one does not read as a flat swatch beside them.
          style={{
            backgroundImage: `linear-gradient(180deg, ${color}, color-mix(in srgb, ${color} 86%, #1a0a12))`,
            color: "#fff",
            border: `1px solid color-mix(in srgb, ${color} 80%, #1a0a12)`,
          }}
          onClick={onResolve}
        >
          <CheckCircle2 size={13} /> {meta.resolveLabel}
        </button>
      )}
    </div>
  );
}

function flagEdge(kind: FlagRow["kind"]): string {
  return kind === "SUPPORT_REQUEST" ? "var(--accent)" : "var(--warn)";
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
    <div className={wide ? "col-span-2" : undefined}>
      <dt className="label text-[9.5px]">{label}</dt>
      <dd className="mt-0.5 break-words text-[12px] leading-snug text-ink-2">{children}</dd>
    </div>
  );
}
