import { redirect } from "next/navigation";
import { Eye, Lock, MapPin } from "lucide-react";
import { getSessionUser } from "@/lib/session";
import { getGrant, getGrantForUser } from "@/lib/portalQuery";
import { getPortalView } from "@/lib/portalDesk";
import {
  ACCENT_META,
  BAND_META,
  GLYPH_META,
  LENS_ORDER,
  MODULE_ORDER,
  PORTAL_LENSES,
  PORTAL_MODULES,
  describePortal,
  moduleInertReason,
  type PortalGrant,
} from "@/lib/portals";
import { PortalPanel } from "@/components/portal/PortalPanel";

export const dynamic = "force-dynamic";

/**
 * A portal member's whole application.
 *
 * One route, and everything on it comes from the grant: the panels, the slice
 * of the fleet under them, and which columns of it resolve. There is nothing
 * else for this account to open — the nav offers this and sign-out.
 *
 * Nothing here is actionable, and that is a property of the role rather than
 * of this page: PORTAL_VIEWER appears in no row of `rbac.TRANSITIONS`, so
 * `availableActions()` is empty for them wherever it is asked. This page does
 * not need to suppress buttons it was never going to be offered.
 *
 * The role gate below is repeated from the nav on purpose — the nav decides
 * what is offered, this decides what is allowed.
 */
export default async function PortalPage({
  searchParams,
}: {
  searchParams: Promise<{ preview?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { preview } = await searchParams;

  // ---- Which lens is being rendered, and for whom -----------------------
  //
  // A Super Admin composing a portal needs to see the thing itself, not a
  // description of it, so they may render any portal by id. This is a read of
  // a workspace, not an impersonation: it runs as the admin, writes nothing,
  // and the page is read-only for everybody.
  let grant: PortalGrant;
  let previewing = false;

  if (user.role === "SUPER_ADMIN") {
    if (!preview) redirect("/admin/portals");
    const found = await getGrant(preview);
    if (!found) redirect("/admin/portals");
    grant = found;
    previewing = true;
  } else if (user.role === "PORTAL_VIEWER") {
    const result = await getGrantForUser(user.id);
    if ("denied" in result) return <Denied reason={result.denied} />;
    grant = result.grant;
  } else {
    redirect("/dashboard");
  }

  const view = await getPortalView(grant);

  const accent = ACCENT_META[grant.accent];
  const Glyph = GLYPH_META[grant.glyph].icon;
  const openLenses = LENS_ORDER.filter((k) => grant[k]);
  const closedLenses = LENS_ORDER.filter((k) => !grant[k]);

  // Rendered in the catalogue's order rather than the order they were picked,
  // so the workspace lays out the same way every time it is opened.
  const panels = MODULE_ORDER.filter((m) => grant.modules.includes(m));

  return (
    <div
      className="pt-page"
      style={
        {
          "--pt-fill": accent.fill,
          "--pt-ink": accent.ink,
          "--pt-soft": accent.soft,
        } as React.CSSProperties
      }
    >
      {previewing && (
        <div className="pt-preview-bar">
          <Eye size={14} />
          <span>
            Previewing <strong>{grant.name}</strong> — this is what its members see.
          </span>
          <a href="/admin/portals" className="pt-preview-back">
            Back to portals
          </a>
        </div>
      )}

      <header className="pt-head">
        <span className="pt-key" aria-hidden="true">
          <Glyph size={22} strokeWidth={1.9} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="eyebrow" style={{ color: "var(--pt-ink)" }}>
            {BAND_META[grant.band].label}
          </div>
          <h1 className="page-title mt-0.5 text-[27px]">{grant.name}</h1>
          <p className="pt-sentence">{grant.purpose || describePortal(grant)}</p>
        </div>
        <div className="pt-scope">
          <span className="pt-scope-n">{view.inScope}</span>
          <span className="pt-scope-label">
            vehicle{view.inScope === 1 ? "" : "s"} in view
          </span>
        </div>
      </header>

      {/* What this lens does and does not resolve, stated on the page the
          reader is using rather than left for them to infer from a masked
          column. Someone who knows a figure is withheld asks for it; someone
          who thinks it is zero does not. */}
      <div className="pt-terms">
        <span className="pt-term">
          <MapPin size={12} />
          {grant.territories.length === 0
            ? "Every territory"
            : grant.territories.map((t) => t.name).join(" · ")}
        </span>
        {openLenses.map((k) => {
          const Icon = PORTAL_LENSES[k].icon;
          return (
            <span key={k} className="pt-term pt-term-on">
              <Icon size={12} />
              {PORTAL_LENSES[k].label}
            </span>
          );
        })}
        {closedLenses.map((k) => (
          <span key={k} className="pt-term pt-term-off" title={PORTAL_LENSES[k].redactedAs}>
            <Lock size={11} />
            {PORTAL_LENSES[k].label}
          </span>
        ))}
      </div>

      <div className="pt-panels">
        {panels.map((m) => (
          <PortalPanel
            key={m}
            module={m}
            meta={PORTAL_MODULES[m]}
            inert={moduleInertReason(m, grant)}
            grant={grant}
            view={view}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * The two ways a portal account can have nothing to render.
 *
 * Both are the admin's to fix and neither is the reader's fault, so the copy
 * says who to ask rather than what went wrong. A suspended portal is named as
 * suspended — telling someone their access "failed" when it was deliberately
 * switched off sends them to the wrong person.
 */
function Denied({ reason }: { reason: "unassigned" | "suspended" }) {
  const copy =
    reason === "suspended"
      ? {
          title: "This portal is switched off",
          body: "An administrator has suspended it. Nothing has been lost — it can be switched back on, and everything in it will be where you left it.",
        }
      : {
          title: "No portal is attached to this account",
          body: "Your account is set up to read through a portal, but none is assigned to it yet. An administrator can attach one from the portals console.",
        };

  return (
    <div className="pt-page">
      <div className="pt-denied">
        <span className="pt-denied-plate">
          <Lock size={20} strokeWidth={1.8} />
        </span>
        <div>
          <h1 className="pt-denied-title">{copy.title}</h1>
          <p className="pt-denied-body">{copy.body}</p>
        </div>
      </div>
    </div>
  );
}
