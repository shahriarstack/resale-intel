import type { LucideIcon } from "lucide-react";

/**
 * The frame every HQ console page sits in.
 *
 * Full-bleed, deliberately. These pages are dense tables and wide rows, and
 * the previous `max-w-[1400px] mx-auto` was throwing away 300–500px of usable
 * width on the office monitors this is actually read on — every column then
 * had to be narrower than it wanted to be, which is the opposite of what a
 * data-dense console needs. A reading-width cap is right for prose; it is
 * wrong for a table.
 *
 * The gutter still grows with the viewport, so content is never flush against
 * the chrome on a very wide screen.
 */
export function ConsolePage({
  eyebrow,
  title,
  intro,
  icon: Icon,
  actions,
  filter,
  children,
}: {
  eyebrow: string;
  title: string;
  intro?: string;
  icon?: LucideIcon;
  /** Top-right controls — a date range, an export, a primary action. */
  actions?: React.ReactNode;
  /**
   * The page's scope control, given its own place on the masthead.
   *
   * Separate from `actions` on purpose: an action is something you do to the
   * page, and this decides what the page IS. Every figure below it means
   * something different depending on where it is set, so it sits with the
   * title rather than among the buttons.
   */
  filter?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="w-full px-5 py-6 xl:px-8 2xl:px-10">
      {/* Two things left, one thing right.
          The masthead used to stack three: label, title, and a line of
          orientation that ran the width of the page under both. That third
          line is what made every screen open with three rows of chrome before
          any work — and it is the least of the three, so it was buying the
          most height for the least reading.

          It moves right, into the space the action buttons were already
          leaving empty, set as a margin note against a hairline. The header
          loses a row, the sentence keeps its full width, and the eye still
          starts where it should: on the title. */}
      <header className="console-head mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {Icon && (
              <span className="eyebrow-mark grid place-items-center">
                <Icon size={13} />
              </span>
            )}
            <div className="eyebrow">{eyebrow}</div>
          </div>
          <h1 className="page-title mt-1 text-[30px] leading-tight">{title}</h1>
          {filter && <div className="mt-2.5">{filter}</div>}
        </div>

        {(intro || actions) && (
          <div className="console-head-aside">
            {intro && <p className="console-intro">{intro}</p>}
            {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
          </div>
        )}
      </header>
      {children}
    </div>
  );
}

/** A labelled block inside a console page. */
export function ConsoleSection({
  title,
  hint,
  actions,
  children,
  className = "",
}: {
  title: string;
  hint?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`mt-6 first:mt-0 ${className}`}>
      <div className="mb-2.5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-[17px] font-bold leading-tight text-ink">{title}</h2>
          {hint && <p className="mt-0.5 text-[12px] text-ink-3">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** The wrapper a list of `*ListRow` components goes in. */
export function ListShell({ children }: { children: React.ReactNode }) {
  return <div className="card overflow-x-auto">{children}</div>;
}

export function ListEmpty({
  icon: Icon,
  message,
}: {
  icon: LucideIcon;
  message: string;
}) {
  return (
    <div className="grid place-items-center gap-2 px-6 py-14 text-center">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-3">
        <Icon size={19} strokeWidth={1.7} />
      </span>
      <p className="text-[13px] font-medium text-ink-2">{message}</p>
    </div>
  );
}
