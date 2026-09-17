import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CarFront, FileClock, Landmark, Truck } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { canOpenOffroadCase } from "@/lib/rbac";
import { findAuthorisingWindow, remaining, timeLeftLabel } from "@/lib/captureWindow";

export const dynamic = "force-dynamic";

/**
 * The intake chooser.
 *
 * "Add vehicle" used to mean exactly one thing, so the button went straight to
 * the capture form. It now means four, and three of them are not captures at
 * all — so the fork is made explicit rather than buried in a dropdown at the
 * top of a form the officer has already started filling in.
 *
 * There is no "capture" option here, and that is the point. A capture is not
 * something an officer starts — it is what an APPROVED request becomes once
 * the vehicle is in hand, or what an off-road case becomes when it stops being
 * returnable. Both of those open the capture form themselves, pre-filled. A
 * third door straight into it would make the approval gate optional.
 */
const OPTIONS = [
  {
    href: "/intake/request",
    icon: FileClock,
    tone: "#6a5acd",
    eyebrow: "Every capture starts here",
    title: "Capture request",
    blurb:
      "Ask Recovery Operations HQ to pre-approve a seizure. Records the account position — OD, outstanding, what you expect to happen after the capture — before the vehicle moves. Once it is approved, it opens the capture form for you.",
    cta: "Raise a request",
  },
  {
    href: "/intake/accident",
    icon: CarFront,
    tone: "var(--warn)",
    eyebrow: "Off-road",
    title: "Accident",
    blurb:
      "A customer's vehicle is damaged and off the road. Tracked on a repair countdown until it is back in service — or written off and converted to a capture.",
    cta: "Log an accident",
  },
  {
    href: "/intake/thana",
    icon: Landmark,
    tone: "var(--bad)",
    eyebrow: "Off-road",
    title: "Thana / Police station",
    blurb:
      "A vehicle is in police or legal custody. Tracked on a case countdown until it is released — to the customer, or to us.",
    cta: "Log a custody case",
  },
];

export default async function IntakePage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!canOpenOffroadCase(user.role)) redirect("/dashboard");

  // The fourth door, and only while an admin is holding it open. Resolved on
  // the server so the card is either there on first paint or never — a door
  // that appears a moment after the page settles invites the tap that lands on
  // whatever was underneath it.
  const win = await findAuthorisingWindow(prisma, user);
  const left = win ? remaining({
    opensAt: new Date(0),
    closesAt: win.closesAt,
    closedAt: null,
    maxCaptures: win.maxCaptures,
    used: win.used,
  }) : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-7 sm:px-6">
      <header className="mb-6" style={{ animation: "fadeIn 0.2s var(--ease-standard)" }}>
        <div className="eyebrow text-accent">New record</div>
        <h1 className="page-title mt-1.5 text-[30px]">What are you adding?</h1>
        <p className="mt-1.5 text-sm text-ink-2">
          {win
            ? "A capture normally begins with an approved request — but a direct-entry window is open for you right now. Accident and Thana cases are tracked off-road and never enter the resale pipeline."
            : "A capture always begins with an approved request. Accident and Thana cases are tracked off-road and never enter the resale pipeline — unless you convert one later."}
        </p>
      </header>

      <div className="flex flex-col gap-3">
        {/* Open windows come first. When one is open it is almost always what
            the officer opened this page to use — and when none is, this is
            simply not here, so the standing three keep their usual order. */}
        {win && (
          <Link
            href="/capture"
            className="intake-card intake-card-window group"
            style={{ ["--tone" as string]: "var(--warn)", animation: "slideUp 0.24s var(--ease-out-quart) both" }}
          >
            <span className="intake-wash" aria-hidden="true" />
            <span className="intake-plate">
              <Truck size={20} strokeWidth={1.7} />
            </span>
            <span className="intake-body">
              <span className="intake-window-head">
                <span className="intake-eyebrow">Temporary authorisation</span>
                <span className="intake-window-clock">{timeLeftLabel(win.closesAt)}</span>
              </span>
              <h2 className="intake-title">Capture a vehicle already in hand</h2>
              <p className="intake-blurb">
                {win.openedByName} has opened a window for entering vehicles seized before the
                approval gate existed. No capture request needed — record the vehicle with the
                date it was actually taken.
              </p>
              <span className="intake-window-reason">“{win.reason}”</span>
              <span className="intake-cta">
                Record a capture
                {left !== null && (
                  <span className="intake-window-left">{left} of {win.maxCaptures} left</span>
                )}
                <ArrowRight size={14} className="intake-arrow" />
              </span>
            </span>
          </Link>
        )}

        {OPTIONS.map((o, i) => {
          const Icon = o.icon;
          return (
            <Link
              key={o.href}
              href={o.href}
              className="intake-card group"
              style={{
                ["--tone" as string]: o.tone,
                animation: `slideUp 0.24s var(--ease-out-quart) ${0.04 * (win ? i + 1 : i)}s both`,
              }}
            >
              {/* The tone, as a wash rather than a bar. Inert and behind
                  everything — see 15-intake.css for why it replaced the
                  3px left border. */}
              <span className="intake-wash" aria-hidden="true" />

              <span className="intake-plate">
                <Icon size={20} strokeWidth={1.7} />
              </span>

              <span className="intake-body">
                <span className="intake-eyebrow">{o.eyebrow}</span>
                <h2 className="intake-title">{o.title}</h2>
                <p className="intake-blurb">{o.blurb}</p>
                <span className="intake-cta">
                  {o.cta}
                  <ArrowRight size={14} className="intake-arrow" />
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
