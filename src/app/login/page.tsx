"use client";

import { Suspense, useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import { ArrowRight, AlertCircle, Loader2, ShieldCheck } from "lucide-react";
import { AciLockup } from "@/components/brand/BrandMark";

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [staffId, setStaffId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const res = await signIn("credentials", {
      staffId: staffId.trim(),
      password,
      redirect: false,
    });

    if (res?.error) {
      setError("Staff ID or password is incorrect.");
      setLoading(false);
    } else {
      const callback = params.get("callbackUrl");
      router.replace(callback || "/dashboard");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen w-full grid lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel — desktop only */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-ink px-14 py-12 text-white">
        {/* The supplied vehicle render, used as the panel's hero.
            Anchored bottom-right and masked into the panel so the truck reads
            as emerging from the dark rather than as a photo pasted on it. The
            headline sits over the darkest part of the frame. */}
        <Image
          src="/brand/login-hero.jpg"
          alt=""
          aria-hidden
          fill
          priority
          sizes="55vw"
          className="pointer-events-none select-none object-cover object-right-bottom"
          style={{
            opacity: 0.92,
            // Feathered into the panel from the bottom-right corner it already
            // occupies in the source art, so the vehicle emerges from the dark
            // instead of sitting in a visible rectangle.
            maskImage:
              "radial-gradient(135% 118% at 88% 92%, #000 24%, rgba(0,0,0,0.55) 55%, transparent 84%)",
            WebkitMaskImage:
              "radial-gradient(135% 118% at 88% 92%, #000 24%, rgba(0,0,0,0.55) 55%, transparent 84%)",
          }}
        />
        {/* Ink wash. Heavy down the left where the headline sits, clearing to
            almost nothing on the right so the vehicle keeps its contrast. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "linear-gradient(96deg, rgba(9,9,19,0.97) 14%, rgba(9,9,19,0.86) 38%, rgba(9,9,19,0.42) 68%, rgba(9,9,19,0.1) 100%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 h-[560px] w-[560px] rounded-full opacity-25 blur-3xl"
          style={{ background: "radial-gradient(circle, #5546e0, transparent 70%)" }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 bottom-[-120px] h-[380px] w-[380px] rounded-full opacity-20 blur-3xl"
          style={{ background: "radial-gradient(circle, #3d8ce0, transparent 70%)" }}
        />
        <div className="relative z-10" style={mounted ? { animation: "fadeIn 0.4s ease" } : undefined}>
          {/* The badge keeps its own green on the dark panel; the wordmark is
              set in the app face so it can be white here. */}
          <AciLockup size={34} className="text-white" />
          <div className="mt-5 flex items-center gap-3">
            <span className="h-px w-8 bg-white/25" />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/45">
              Resale Intel
            </span>
          </div>
        </div>

        <div className="relative z-10 max-w-md" style={mounted ? { animation: "slideUp 0.5s ease 0.1s both" } : undefined}>
          <h1 className="font-display text-[42px] font-bold leading-[1.02] tracking-tight text-balance">
            From field capture to resale-ready — one file, eight desks.
          </h1>
          <p className="mt-5 text-[15px] leading-relaxed text-white/60">
            The recovery, refurbishment and pricing pipeline for repossessed
            commercial vehicles. Every step accountable, every cost recorded.
          </p>
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-white/40">
            <ShieldCheck size={14} />
            <span className="h-px w-6 bg-white/25" />
            AUTHORISED ACCESS ONLY
          </div>
        </div>
      </aside>

      {/* Form panel */}
      <main className="flex items-center justify-center bg-paper px-6 py-12 sm:px-12">
        <div className="w-full max-w-sm" style={mounted ? { animation: "fadeIn 0.3s ease" } : undefined}>
          {/* Below lg the brand panel is hidden, so the mark has to appear
              here instead — otherwise the phone sign-in is unbranded. */}
          <div className="mb-9 lg:hidden">
            <AciLockup size={30} className="text-ink" />
            <div className="mt-3 flex items-center gap-2.5">
              <span className="h-px w-6 bg-rule-strong" />
              <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-3">
                Resale Intel
              </span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="font-display text-3xl font-bold tracking-tight text-ink">
              Sign in
            </h2>
            <p className="mt-1.5 text-sm text-ink-2">
              Enter your Staff ID and password to continue.
            </p>
          </div>

          {error && (
            <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-bad/25 bg-bad-soft px-4 py-3 text-bad" style={{ animation: "scaleIn 0.15s ease" }}>
              <AlertCircle size={17} className="mt-0.5 shrink-0" />
              <span className="text-sm font-medium">{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label htmlFor="staffId" className="label">
                Staff ID
              </label>
              <input
                id="staffId"
                type="text"
                autoComplete="username"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                placeholder="e.g. ARO-014"
                required
                autoFocus
                className="field font-mono"
              />
            </div>

            <div>
              <label htmlFor="password" className="label">
                Password
              </label>
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

            <button type="submit" disabled={loading} className="btn btn-primary btn-block mt-1 py-3">
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

          <p className="mt-8 text-center text-xs text-ink-3">
            Forgot your password? Contact your administrator.
          </p>

          <p className="mt-3 text-center font-mono text-[11px] tracking-wide text-ink-3">
            Resale Intel v1.0
          </p>
        </div>
      </main>
    </div>
  );
}
