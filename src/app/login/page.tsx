"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, AlertCircle, Loader2, ShieldCheck, Smartphone, Monitor } from "lucide-react";
import type { Role } from "@prisma/client";
import { ResaleBadge, AciMotorsMark } from "@/components/brand/BrandMark";
import { useIsClient } from "@/lib/useIsClient";
import { LoginDots } from "@/components/login/LoginDots";
import { ROLE_META, ALL_ROLES } from "@/lib/rbac";

/**
 * The roles, split the way the product splits them.
 *
 * Grouped by SURFACE rather than listed flat, because that is the one thing a
 * person signing in already knows about themselves before they know what we
 * call their desk: whether they work from a phone in a yard or a screen at a
 * desk. Eleven names in one list is a list to be read; two short lists under
 * the right heading is a name to be found.
 *
 * Built from ROLE_META, so a role added to the product appears here without
 * anyone remembering to add it.
 */
const FIELD_ROLES = ALL_ROLES.filter((r) => ROLE_META[r].surface === "mobile");
const DESK_ROLES = ALL_ROLES.filter((r) => ROLE_META[r].surface === "desktop");

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="login-stage" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [role, setRole] = useState<Role | "">("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Entrance animations are applied only in the browser, so the server pass
  // renders the panel in its final position rather than mid-animation.
  const mounted = useIsClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      role,
      password: password.trim(),
      redirect: false,
    });

    if (res?.error) {
      // One message for every way this can fail — wrong passcode, wrong role
      // for the passcode, or a deactivated account. Naming which would tell
      // someone holding a passcode which desk it belongs to, and telling them
      // an account exists is telling them something.
      setError("That role and passcode do not match an active account.");
      setLoading(false);
    } else {
      const callback = params.get("callbackUrl");
      router.replace(callback || "/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="login-stage">
      {/* The moving ground. Three brand-coloured masses drifting on long,
          mismatched cycles, plus a static lattice over them so the soft areas
          do not read as a blurred photograph. Both inert and hidden from the
          accessibility tree — they are the room, not the content. */}
      <div className="login-aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="login-weave" aria-hidden="true" />
      {/* The layer that answers back. Painted over the lattice and under the
          content: the pointer sweeps a network out of the field and it closes
          again behind you. Static on a touch screen, and it keeps the
          brightening but drops the movement under reduced motion. */}
      <LoginDots />

      {/* Two columns again: what the product is on the left, the way in on
          the right. The centred column that sat here for a while stacked the
          same content, and on a wide monitor it left the brand floating above
          a form in a lot of empty colour. Below `lg` this still stacks —
          there is no room for a spread on a phone. */}
      <div
        className="login-split"
        style={mounted ? { animation: "fadeIn 0.4s var(--ease-standard)" } : undefined}
      >
        <section className="login-intro">
          {/* The mark, once. An older split rendered it twice — on the brand
              panel and again above the form, because the panel was hidden
              below lg. This one stacks instead of hiding, so one will do. */}
          <div className="login-brand">
            <span className="login-brand-row">
              <ResaleBadge size={38} />
              {/* Size lives in CSS, not here: it differs between the spread
                  and the stacked layout, and a utility would pin it. */}
              <span className="brand-grad login-wordmark font-display font-bold leading-none tracking-tight">
                Resale Intel
              </span>
            </span>
            {/* The parent mark alone. The words that used to sit beside it
                said what the mark already says, and the image carries "ACI
                Motors" as its alt text, so nothing is lost to a screen
                reader by dropping them. */}
            <span className="login-brand-sub">
              <AciMotorsMark height={17} />
            </span>
          </div>

          {/* The positioning line, and the only place the product says outright
              what it covers. Both halves are named — the resale pipeline and the
              off-road book — because a sign-in page that describes half of what
              is behind it sets the wrong expectation before anyone has typed a
              password.

              "Resale & Offroad" carries the wordmark's own blue → purple →
              green ramp. Painting those two words rather than the whole line
              makes the headline read as branding instead of as large body copy;
              the rest of the sentence stays plain white on the deep ground. */}
          {/* The lines arrive in the order they are read.
              The block used to slide up as one object, which is the cheapest
              entrance and reads as a panel being placed. Staggering the
              headline and the sentence by 90ms reads as a page composing
              itself — the same money, spent on sequence instead of distance.
              Each still travels only 12px; the restraint is the point. */}
          <div className="login-lede">
            <h1
              className="login-headline text-balance"
              style={mounted ? { animation: "loginRise 0.62s var(--ease-out-quart) 0.10s both" } : undefined}
            >
              Intelligence Platform for{" "}
              <span className="login-headline-mark">Resale &amp; Offroad</span> Vehicles
            </h1>
            <p style={mounted ? { animation: "loginRise 0.62s var(--ease-out-quart) 0.19s both" } : undefined}>
              Recovery, refurbishment and pricing for repossessed commercial
              vehicles — and every vehicle off the road for any other reason.
              Every step accountable, every cost recorded.
            </p>
          </div>

          <div
            className="login-foot"
            style={mounted ? { animation: "loginRise 0.62s var(--ease-out-quart) 0.28s both" } : undefined}
          >
            <ShieldCheck size={13} />
            <span className="login-foot-rule" />
            AUTHORISED ACCESS ONLY
          </div>
        </section>

        <main className="login-panel">
          <div
            className="login-card"
            style={mounted ? { animation: "loginRise 0.62s var(--ease-out-quart) 0.34s both" } : undefined}
          >
            <div className="mb-6">
              <h2 className="font-display text-[26px] font-bold tracking-tight text-ink">
                Sign in
              </h2>
              <p className="mt-1 text-[13px] text-ink-2">
                Choose your role, then enter your passcode to continue.
              </p>
            </div>

            {error && (
              <div
                className="mb-5 flex items-start gap-2.5 rounded-xl border border-bad/25 bg-bad-soft px-4 py-3 text-bad-ink"
                style={{ animation: "scaleIn 0.15s var(--ease-spring)" }}
              >
                <AlertCircle size={17} className="mt-0.5 shrink-0" />
                <span className="text-sm font-medium">{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="role" className="label">
                  Role
                </label>
                <select
                  id="role"
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role | "")}
                  required
                  autoFocus
                  className="field login-role"
                  data-chosen={role ? "" : undefined}
                >
                  <option value="">Select your role…</option>
                  <optgroup label="In the field">
                    {FIELD_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </optgroup>
                  <optgroup label="Head office">
                    {DESK_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Where this takes you.
                  A dropdown of eleven desk names is a form to be filled in;
                  the same dropdown answering back is the page confirming it
                  understood you before you commit to a passcode. It names the
                  designations that role covers — somebody who knows they are a
                  "Sr. ARO" may not know we file them under Recovery Team — and
                  the surface they will land on, which is the difference
                  between a phone in a yard and a console at a desk.

                  Everything here comes from ROLE_META, so it cannot describe a
                  role differently from the rest of the product. */}
              {role && (
                <div className="login-role-card" key={role}>
                  <span className="login-role-glyph">
                    {ROLE_META[role].surface === "mobile" ? (
                      <Smartphone size={15} />
                    ) : (
                      <Monitor size={15} />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="login-role-name">{ROLE_META[role].label}</div>
                    <div className="login-role-sub">
                      {ROLE_META[role].designations !== "—" && (
                        <>{ROLE_META[role].designations} · </>
                      )}
                      {ROLE_META[role].surface === "mobile"
                        ? "Phone app"
                        : "Desk console"}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label htmlFor="password" className="label">
                  Passcode
                </label>
                {/* Deliberately says nothing about what the passcode is. The
                    administrator tells a new officer theirs; the sign-in page
                    is not the place to publish the rule. */}
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  className="field"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !role}
                className="btn btn-primary btn-block mt-1 py-3"
              >
                {loading ? (
                  <>
                    <Loader2 size={18} className="animate-spin" /> Signing in...
                  </>
                ) : (
                  <>
                    Sign in <ArrowRight size={18} />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-xs text-ink-3">
              Forgotten your passcode? Contact your administrator.
            </p>

            {/* The maker's signature, in the same form it takes at the foot
                of every page in the app: one quiet mono line with the name
                carrying the brand ramp. Reusing `app-foot-who` rather than
                inventing a second definition of it — it is the same mark
                doing the same job. */}
            <p className="login-sign">
              crafted by <span className="app-foot-who">Shahriar</span>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
