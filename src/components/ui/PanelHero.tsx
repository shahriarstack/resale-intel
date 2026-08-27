"use client";

/**
 * The gradient hero that opens a role's panel.
 *
 * Two artwork variants keep the surfaces related without being identical:
 * `field` (a map, a route, a pin) for the recovery panel, and `desk` (stacked
 * files moving through an approval) for the eight approving desks.
 */
export function PanelHero({
  eyebrow,
  title,
  subtitle,
  art = "desk",
}: {
  eyebrow: string;
  title: string;
  subtitle: string;
  art?: "desk" | "field";
}) {
  return (
    <section className="hero px-4 py-4" style={{ animation: "fadeIn 0.3s var(--ease-standard)" }}>
      <div className="relative z-10 max-w-[66%]">
        <div className="eyebrow" style={{ color: "var(--accent)" }}>
          {eyebrow}
        </div>
        <h1 className="page-title mt-1 text-[25px]">{title}</h1>
        <p className="mt-1 text-[12.5px] leading-snug text-ink-2">{subtitle}</p>
      </div>
      {art === "desk" ? <DeskArt /> : null}
    </section>
  );
}

/** Stacked files crossing an approval gate — abstract, no literal iconography. */
function DeskArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 150"
      className="pointer-events-none absolute -right-2 top-1/2 h-[128%] -translate-y-1/2"
      fill="none"
    >
      {/* back sheets, fanned */}
      <g opacity="0.9">
        <rect
          x="58" y="44" width="76" height="96" rx="10"
          fill="rgba(255,255,255,0.5)"
          transform="rotate(-11 96 92)"
        />
        <rect
          x="66" y="40" width="76" height="96" rx="10"
          fill="rgba(255,255,255,0.7)"
          transform="rotate(-5 104 88)"
        />
      </g>

      {/* front sheet with content rules */}
      <g>
        <rect x="74" y="36" width="78" height="98" rx="11" fill="rgba(255,255,255,0.94)" />
        <g stroke="rgba(14,80,84,0.16)" strokeWidth="2.5" strokeLinecap="round">
          <path d="M86 56h42M86 68h54M86 80h34M86 92h48" />
        </g>
        {/* the figure being approved */}
        <rect x="86" y="104" width="34" height="9" rx="4.5" fill="var(--accent)" opacity="0.22" />
      </g>

      {/* approval badge */}
      <g transform="translate(140 88)">
        <circle cx="20" cy="20" r="20" fill="var(--accent)" />
        <path
          d="M12 20.5l5.5 5.5L28 15.5"
          stroke="#fff"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* flow arc into the badge */}
      <path
        d="M150 58c14 4 18 14 12 24"
        stroke="var(--accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray="5 6"
        opacity="0.55"
      />
    </svg>
  );
}
