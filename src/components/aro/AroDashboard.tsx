"use client";

import { useMemo } from "react";
import Link from "next/link";
import { CalendarDays, ChevronRight, Clock3, Crosshair, History, Info } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { CountUp } from "@/components/ui/CountUp";
import {
  ApprovedArt,
  ClearArt,
  CrashArt,
  FlagArt,
  LetterArt,
  OverdueArt,
  PoliceArt,
  RequestArt,
  TruckArt,
} from "@/components/aro/Art";
import { daysSince } from "@/lib/format";
import { isCaptureStage, isResaleInventory } from "@/lib/status";
import type { AroBook } from "@/lib/recoveryDesk";

type Art = (p: { size?: number; className?: string }) => React.ReactElement;

/**
 * The officer's landing screen.
 *
 * White cards on a soft grey ground, one deep indigo block for the headline
 * figure, and colour carried by the illustration plates rather than by the
 * cards themselves. A tinted card competes with the card beside it; a white
 * card with a coloured plate in its corner does not, and the plate is where
 * the eye lands anyway.
 *
 * The structural change from the previous pass is the attention list. It was
 * four separate tinted cards — four shadows, four sets of margins, about 40px
 * of screen spent on the gaps between things that belong together. It is now
 * ONE card with hairline-divided rows: same information, ~90px shorter, and it
 * finally reads as a list rather than as four unrelated announcements.
 */
export function AroDashboard({ book, firstName }: { book: AroBook; firstName: string }) {
  const { captures, requests, cases, totals } = book;

  const counts = useMemo(() => {
    // The Credit Note is the boundary. Before it a vehicle is a CAPTURE —
    // seized, letters running or the CN out for approval, still off the road.
    // After it the write-off is authorised and the vehicle has stopped being a
    // recovery case: it is stock being assessed, repaired, priced and sold.
    // Counting that as "off-road" told an officer fifteen vehicles needed
    // recovering when they were in a workshop being prepared for sale.
    const captured = captures.filter((v) => isCaptureStage(v.status));
    const resale = captures.filter((v) => isResaleInventory(v.status));
    // Only files still in the officer's own hands carry a live letter ladder.
    const withLetters = captures.filter((v) => v.status === "CAPTURED");
    const open = cases.filter((c) => c.status === "OPEN");
    const accident = open.filter((c) => c.kind === "ACCIDENT").length;
    const thana = open.filter((c) => c.kind === "THANA").length;

    return {
      withLetters,
      openCases: open,
      captured: captured.length,
      resale: resale.length,
      accident,
      thana,
      // Off the road = captures + the two case kinds. Resale inventory is
      // deliberately absent: nobody is trying to recover it.
      offroadNow: captured.length + accident + thana,
      pending: requests.filter((r) => r.status === "PENDING").length,
      approved: requests.filter((r) => r.status === "APPROVED").length,

      /**
       * The longest any one thing has been off the road.
       *
       * The headline says how MANY; this says how LONG, and the second is the
       * question a manager asks about the first. Nothing else on the officer's
       * screen carries it: every list here is sorted by what is due next, so a
       * vehicle nobody can move sinks quietly to the bottom and stays there.
       *
       * One clock over two kinds of record — a seizure dates from the capture,
       * a case from the day it happened — because "off the road" is one idea
       * and splitting it into two figures would be reporting our own filing.
       */
      longest: [
        ...captured.map((v) => ({
          days: daysSince(v.captureDate),
          reg: v.registrationNo,
          href: "/captures",
        })),
        ...open.map((c) => ({
          days: daysSince(c.occurredAt),
          reg: c.registrationNo,
          href: "/offroad",
        })),
      ]
        .filter((x): x is { days: number; reg: string; href: string } => x.days !== null)
        .sort((a, b) => b.days - a.days)[0] ?? null,
    };
  }, [captures, cases, requests]);

  const todo = useMemo(() => {
    const items: {
      key: string;
      Art: Art;
      label: string;
      detail: string;
      count: number;
      tone: string;
      href: string;
      /** Genuinely late — earns the pulsing halo. Nothing else does. */
      alert?: boolean;
    }[] = [];

    const flagged = counts.openCases.filter((c) => c.openAttention).length;
    if (flagged)
      items.push({
        key: "flag",
        Art: FlagArt,
        label: "Manager needs you",
        detail: "Read the note and mark it done",
        count: flagged,
        // Orange, matching FlagArt's pennant — someone is waiting on you.
        tone: "#c2410c",
        href: "/offroad",
        alert: true,
      });

    if (counts.approved)
      items.push({
        key: "approved",
        Art: ApprovedArt,
        label: "Approved — go and capture",
        detail: "Complete the form once in hand",
        count: counts.approved,
        tone: "#059669",
        href: "/captures",
      });

    const letters = counts.withLetters.filter(
      (v) => v.next.kind === "ISSUE_LETTER" && v.next.due,
    ).length;
    if (letters)
      items.push({
        key: "letters",
        Art: LetterArt,
        label: "Letters due or late",
        detail: "Issue the next notice on the ladder",
        count: letters,
        // Garnet, matching LetterArt.
        tone: "#c42847",
        href: "/captures",
        alert: true,
      });

    const cnDue = counts.withLetters.filter((v) => v.next.kind === "REQUEST_CN").length;
    if (cnDue)
      items.push({
        key: "cn",
        Art: TruckArt,
        label: "Credit Note owed",
        detail: "All letters served — request it",
        count: cnDue,
        tone: "#4338ca",
        href: "/captures",
      });

    const late = counts.openCases.filter((c) => c.clock.overdue).length;
    if (late)
      items.push({
        key: "late",
        Art: OverdueArt,
        label: "Past their window",
        detail: "Close it, or ask HQ for help",
        count: late,
        // Deep garnet, matching OverdueArt — the hardest state on this list,
        // so it sits a step below --bad rather than on it.
        tone: "#a82239",
        href: "/offroad",
        alert: true,
      });

    return items;
  }, [counts]);

  const trendPct =
    totals.capturesPrior30 === 0
      ? null
      : Math.round(
          ((totals.capturesLast30 - totals.capturesPrior30) / totals.capturesPrior30) * 100,
        );

  // One clock read for the whole header.
  const today = useMemo(() => {
    const d = new Date();
    const p = (opt: Intl.DateTimeFormatOptions) => d.toLocaleDateString("en-GB", opt);
    return {
      iso: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
      dow: p({ weekday: "short" }).toUpperCase(),
      day: String(d.getDate()),
      mon: p({ month: "short" }).toUpperCase(),
      full: p({ weekday: "long", day: "numeric", month: "long" }),
    };
  }, []);

  return (
    <div className="aro-page min-h-screen">
      <div className="mx-auto w-full max-w-lg px-4 pb-24 pt-4">
        {/* ================= Greeting =================
            Greeting left, date right, on one baseline. The date is a tile
            rather than a line of prose because it is the one thing on this
            screen that is never read as a sentence — an officer glances at it
            to know which day the letter ladder is counting from. Stacked
            weekday / day / month in mono, it can be taken in without reading,
            and it gives the header a right-hand anchor so the greeting is not
            floating alone above a full-bleed card. */}
        <header className="aro-greet">
          {/* One line, on a shared baseline: "Good evening, Rakib". Two lines
              gave a two-word greeting the vertical space of a heading, which
              is more than a salutation is worth on the screen an officer
              opens forty times a day. */}
          <div className="aro-greet-line">
            <span className="aro-greet-eyebrow">{greeting()},</span>
            <h1 className="aro-greet-name">{firstName}</h1>
          </div>
          <time className="aro-datetile" dateTime={today.iso} aria-label={today.full}>
            <span className="aro-datetile-dow">{today.dow}</span>
            <span className="aro-datetile-day">{today.day}</span>
            <span className="aro-datetile-mon">{today.mon}</span>
          </time>
        </header>

        {/* ================= The book, in one block =================
            Four figures, one card. Three of them are the vehicles nobody can
            earn from — captures, accidents, custody — and the fourth is the
            stock that has cleared its Credit Note and is on its way to a sale.
            The heavier divider before it is the whole point of the layout:
            they are not the same kind of number and must not add up.

            NO WATERMARK. A tyre track used to run corner to corner under all
            of this, and its job was to stop the right-hand half of the panel
            looking empty — which is a decoration paid for by a layout problem
            rather than a solution to one. The space is now spent on the second
            figure a manager always asks for after the first, and on a bar that
            draws the headline to scale. Texture that carries no information is
            the cheapest way to look busy and the fastest way to look dated.
            ==================================================================== */}
        <section className="aro-slab mt-2.5 p-3.5">
          <div className="aro-slab-head">
            <div className="min-w-0">
              <div className="aro-slab-eyebrow">
                {/* The glyph is the subject of the panel, stated once. It
                    replaces nothing — the label used to start at the padding
                    edge with no anchor, which on a full-bleed gradient reads
                    as text floating on colour rather than as a titled block. */}
                <span className="aro-slab-mark" aria-hidden="true">
                  <Crosshair size={11} strokeWidth={2.4} />
                </span>
                <span className="aro-slab-label">Off the road</span>
                {/* The radar says this figure is current. It is the only
                    always-on motion on the screen, and it sits beside the
                    number rather than on it. */}
                <span className="aro-radar" aria-hidden="true">
                  <span className="aro-radar-ring" />
                  <span className="aro-radar-ring" />
                  <span className="aro-radar-dot" />
                </span>
              </div>
              <div className="aro-slab-figure">
                <CountUp value={counts.offroadNow} />
              </div>
            </div>

            {/* The other half of the headline, and a way in.
                Right-aligned and a third of the size, so it reads as the
                footnote to the big figure rather than as a second headline
                competing with it. It is a LINK because it names one specific
                vehicle — it goes to the list that holds it, which is the
                captures book for a seizure and the off-road book for a case —
                and a named thing you cannot tap is a dead end. */}
            {counts.longest && (
              <Link href={counts.longest.href} className="aro-slab-aside aro-press">
                <span className="aro-slab-aside-label">
                  Longest off road
                  <ChevronRight size={11} className="aro-slab-aside-chev" />
                </span>
                <span className="aro-slab-aside-figure">
                  <CountUp value={counts.longest.days} />
                  <span className="aro-slab-aside-unit">d</span>
                </span>
                {/* Set in a chip rather than as loose type: on a gradient a
                    line of small mono at 58% white reads as a smudge, and the
                    chip gives it a surface of its own to sit on. */}
                <span className="aro-slab-aside-reg">{counts.longest.reg}</span>
              </Link>
            )}
          </div>

          {/* ---- The headline, drawn to scale ----
              The three segments are the three cells below it, in the same
              order, at their true proportions — so the bar is not a graphic
              about the number, it IS the number, and the row underneath is its
              legend. It replaces the watermark in exactly the place the
              watermark was, which is the point: the panel keeps its texture
              and the texture is now worth reading.

              Monochrome on purpose. Giving each segment its own hue would put
              a fourth palette on a slab that already carries the house
              gradient; three values of white separate them cleanly and let the
              gradient stay the only colour in the block. */}
          {counts.offroadNow > 0 && (
            <div
              className="aro-scale"
              role="img"
              aria-label={`${counts.captured} captured, ${counts.accident} accident, ${counts.thana} in custody`}
            >
              {/* Only the categories that have something in them. The segment
                  keeps a `min-width` so a thin sliver stays visible, which on a
                  count of zero would draw a stub of a category that is not
                  there. */}
              {counts.captured > 0 && (
                <span className="aro-scale-seg aro-scale-1" style={{ flexGrow: counts.captured }} />
              )}
              {counts.accident > 0 && (
                <span className="aro-scale-seg aro-scale-2" style={{ flexGrow: counts.accident }} />
              )}
              {counts.thana > 0 && (
                <span className="aro-scale-seg aro-scale-3" style={{ flexGrow: counts.thana }} />
              )}
            </div>
          )}

          <div className="mt-2.5 grid grid-cols-4 gap-2.5 border-t border-white/10 pt-3">
            <Cell value={counts.captured} label="Captured" />
            <Cell value={counts.accident} label="Accident" />
            <Cell value={counts.thana} label="Thana" />
            <Cell value={counts.resale} label="Resale" apart />
          </div>

          {/* The footnote, on its own surface. As loose 60%-white type it was
              the one line on the slab that had to be hunted for; a translucent
              strip with the mark that means "this is an aside" makes it
              findable without making it louder. */}
          <p className="aro-slab-note">
            <Info size={11} className="shrink-0" />
            Resale stock has cleared its Credit Note — no longer a recovery case.
          </p>
        </section>

        {/* ================= Needs your attention =================
            An inset-grouped list: one container, hairlines inset to where the
            label starts, and the whole row as the tap target. */}

        <div className="aro-group-header">
          <span>Needs your attention</span>
          {todo.length > 0 && <span className="tnum opacity-70">{todo.length}</span>}
        </div>

        <div className="aro-group">
          {todo.length === 0 ? (
            <div className="aro-group-row" style={{ ["--tone" as string]: "var(--ok)" }}>
              <span className="aro-glyph">
                <ClearArt size={19} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="aro-group-title">All clear</div>
                <p className="aro-group-sub truncate">
                  No letters due, no flags, nothing past its window.
                </p>
              </div>
            </div>
          ) : (
            todo.map((t) => (
              <Link
                key={t.key}
                href={t.href}
                className="aro-group-row"
                style={{ ["--tone" as string]: t.tone }}
              >
                <span className="aro-glyph">
                  <t.Art size={19} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="aro-group-title block truncate">{t.label}</span>
                  <span className="aro-group-sub block truncate">{t.detail}</span>
                </span>
                <span className={`aro-pill ${t.alert ? "aro-alert" : ""}`}>{t.count}</span>
                <ChevronRight size={15} className="shrink-0 text-ink-3 opacity-60" />
              </Link>
            ))
          )}
        </div>

        {/* ================= Record =================
            Three readings on one row, where there were two and a lot of air.
            The card is the same height; it simply says more per millimetre,
            which is the only honest way to make a screen denser on a phone.

            ALL TIME · LAST 30 · PRIOR 30, as three raw figures rather than one
            figure and a percentage. The percentage is still there when it can
            be computed, but it cannot be when the prior window is empty — and
            a dashboard whose comparison silently disappears is worse than one
            that always shows both numbers and lets the officer make the
            comparison themselves. */}

        <div className="aro-card aro-record mt-2.5">
          <Stat
            Icon={Clock3}
            tone="#4338ca"
            value={<CountUp value={totals.totalCaptures} />}
            label="All time"
          />
          <Stat
            Icon={CalendarDays}
            tone="#1d4ed8"
            value={
              <>
                {totals.capturesLast30}
                {trendPct !== null && (
                  <span
                    className="aro-record-trend"
                    // The tokens, not a pair of hand-picked hexes — these were
                    // a Tailwind emerald and a Tailwind red, neither of which
                    // belonged to the jade/garnet ladder the rest of the app is
                    // built on.
                    style={{ color: trendPct >= 0 ? "var(--ok-ink)" : "var(--bad-ink)" }}
                  >
                    {trendPct >= 0 ? "+" : ""}
                    {trendPct}%
                  </span>
                )}
              </>
            }
            label="Last 30"
          />
          <Stat
            Icon={History}
            tone="#0f766e"
            value={totals.capturesPrior30}
            label="Prior 30"
            quiet
          />
        </div>

        {/* ================= Start something ================= */}

        {/* No "capture" tile. A capture is not something an officer starts —
            it is what an approved request becomes. The request tile IS the
            start of a capture, which is why it leads. */}

        <div className="aro-group-header">
          <span>Start something</span>
        </div>

        {/* THREE ACROSS, not two.
            Two columns left the third tile alone on its own row beside an
            empty half — the most visible piece of dead space on the screen,
            and the sort of thing that makes a product look unfinished however
            good the card beside it is. Three equal chips fill the row, end the
            section on a straight edge, and cost about 40px less height.

            The layout turns the corner to do it: at three across there is no
            room for a plate BESIDE two lines of text, so the plate goes above
            them and the sub-line is dropped. That loses a little — "Ask for
            approval" told a new officer what a capture request is — and it is
            the right trade on the one row of this screen where all three
            labels already say exactly what they do. Below 340px they stack
            back into full-width rows and the sub-line comes back with them. */}

        <div className="aro-rise aro-starts">
          <Start
            href="/intake/request"
            Art={RequestArt}
            tone="#6d28d9"
            title="Capture request"
            sub="Ask for approval"
          />
          <Start
            href="/intake/accident"
            Art={CrashArt}
            tone="#475569"
            title="Accident"
            sub="Damaged, off-road"
          />
          <Start
            href="/intake/thana"
            Art={PoliceArt}
            tone="#0e7490"
            title="Thana"
            sub="In custody"
          />
        </div>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** One figure inside the summary block. */

function Cell({
  value,
  label,
  apart,
}: {
  value: number;
  label: string;
  /** Resale stock: a different kind of number from the three beside it. */
  apart?: boolean;
}) {

  return (
    <div className={`aro-cell ${apart ? "aro-cell--apart" : ""}`}>
      <div className="aro-cell-figure leading-none">
        <CountUp value={value} />
      </div>
      {/* Wraps rather than truncates. Four cells across a 320px phone leaves
          ~46px each, which cuts "Thana / PS" — and a clipped label on a figure
          is a figure nobody can name. A second line costs 11px once. */}
      <div className="aro-cell-label break-words">{label}</div>
    </div>
  );
}

/**
 * One reading in the record strip.
 *
 * A plate per figure rather than one plate for the card. The single truck
 * plate labelled the CARD — "this row is about captures" — which is something
 * the three labels under the figures already say; a mark on each reading says
 * what KIND of reading it is, which is the part that was missing, and it is
 * what makes three numbers in a row scan as three measurements instead of as a
 * sum somebody forgot to add up.
 */
function Stat({
  Icon,
  tone,
  value,
  label,
  quiet,
}: {
  /* A lucide icon, which is a forwardRef component and so does not fit the
     `Art` signature the illustration plates use — the two icon families on
     this screen are genuinely different types and sharing one alias for them
     only moves the error. */
  Icon: LucideIcon;
  tone: string;
  value: React.ReactNode;
  label: string;
  /** The prior window: context for the figure beside it, not a result. */
  quiet?: boolean;
}) {
  return (
    <div className="aro-record-stat" style={{ ["--tone" as string]: tone }}>
      <span className="aro-plate aro-record-plate">
        <Icon size={15} />
      </span>
      <span className="min-w-0">
        <span className={`aro-record-figure ${quiet ? "aro-record-quiet" : ""}`}>{value}</span>
        <span className="aro-record-label">{label}</span>
      </span>
    </div>
  );
}

function Start({
  href,
  Art,
  tone,
  title,
  sub,
}: {
  href: string;
  Art: Art;
  tone: string;
  title: string;
  sub: string;
}) {

  return (
    // No chevron. Two of these sit side by side on a 375px screen, and the
    // 16px it costs was the difference between "Capture request" and
    // "Capture re…". A whole card that lights up on press is affordance
    // enough; the arrow was decoration paid for in truncated words.
    <Link
      href={href}
      className="aro-card aro-start aro-press"
      style={{ ["--tone" as string]: tone }}
    >
      <span className="aro-plate aro-start-plate">
        <Art size={19} />
      </span>
      <span className="aro-start-text">
        <span className="aro-start-title">
          {title}
          {/* The affordance the two-column version could not afford: at three
              across the title sits on its own line, so the chevron costs the
              width of a glyph rather than the end of a word. */}
          <ChevronRight size={12} className="aro-start-chev" />
        </span>
        {/* Only rendered in the stacked layout — see `.aro-starts` in
            13-aro-slab.css. Kept in the markup rather than behind a breakpoint
            hook so the two layouts cannot describe the same tile differently. */}
        <span className="aro-start-sub">{sub}</span>
      </span>
    </Link>
  );
}
