import type { ReactNode } from "react";

/**
 * The masthead that opens a panel.
 *
 * Editorial, not decorative — a rule, an eyebrow, the title, and orientation.
 * What it replaced was a gradient panel carrying an SVG of stacked files
 * crossing an approval gate: filler that said nothing about the page it
 * topped and was identical on every one of them.
 *
 * The one structural change since: it is now a SPLIT. Type on the left, the
 * page's own numbers on the right.
 *
 * That split exists because of what the subtitle had become. "14 in flight ·
 * 1 live for resale · 18 records in total" is not a sentence — it is three
 * readings wearing a sentence's clothes, set in the muted grey reserved for
 * things you may skip, and punctuated with interpuncts because there was
 * nowhere else to put them. Given a column of their own, each one gets a
 * figure sized like a figure and a label sized like a label, and the eye can
 * take all three without reading left to right.
 *
 * Callers that have prose keep passing `subtitle` and get the old single
 * column. Callers with readings pass `facts` instead. A caller with both is
 * legitimate — a sentence on the left, the numbers on the right.
 */

export interface HeroFact {
  label: string;
  value: string;
  /** Optional emphasis for the one reading that matters most on this page. */
  accent?: boolean;
}

export function PanelHero({
  eyebrow,
  title,
  subtitle,
  facts,
  aside,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** The page's headline numbers, set as a right-hand rail. */
  facts?: HeroFact[];
  /** Anything else the page wants in that corner — a control, a chip. */
  aside?: ReactNode;
  /** Retained so existing callsites keep compiling; the art is gone. */
  art?: "desk" | "field";
}) {
  const hasRight = (facts && facts.length > 0) || !!aside;

  return (
    <header className="hero pt-3">
      <div className="hero-split">
        <div className="min-w-0">
          <div className="eyebrow text-accent">{eyebrow}</div>
          <h1 className="page-title mt-1.5">{title}</h1>
          {subtitle && (
            <p className="mt-1.5 max-w-2xl text-[13px] leading-snug text-ink-2">{subtitle}</p>
          )}
        </div>

        {hasRight && (
          <div className="hero-rail">
            {facts?.map((f) => (
              <div key={f.label} className="hero-fact" data-accent={f.accent || undefined}>
                <span className="hero-fact-value">{f.value}</span>
                <span className="hero-fact-label">{f.label}</span>
              </div>
            ))}
            {aside}
          </div>
        )}
      </div>
    </header>
  );
}
