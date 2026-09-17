"use client";

import { useState } from "react";
import { CalendarRange, LayoutGrid, LineChart } from "lucide-react";

/**
 * The Service Manager's analytics tabs.
 *
 * Three blocks used to sit stacked below the approval queue, which meant the
 * newest of them — the monthly scorecard — would have been roughly two screens
 * of scrolling from the top and would simply never be found. Stacking also
 * implied a reading order that does not exist: workload, scorecard and desk
 * insight answer three different questions and are read one at a time.
 *
 * Tabs, so each is one click, and so adding a fourth later costs no vertical
 * space at all. The default stays on Workload — that is the block the head was
 * already using, and a redesign that moves someone's landing surface without
 * being asked is a redesign they have to undo every morning.
 *
 * The panels arrive as rendered nodes rather than as a list of components,
 * because the labels and icons have to be declared on this side of the client
 * boundary; a component reference cannot be passed in from the server page.
 */
const TABS = [
  {
    key: "workload",
    label: "Workload",
    icon: LayoutGrid,
    hint: "Where every file sits right now, by engineer",
  },
  {
    key: "scorecard",
    label: "Monthly scorecard",
    icon: CalendarRange,
    hint: "Jobs assigned, completed and how long each took, month by month",
  },
  {
    key: "insight",
    label: "Desk insight",
    icon: LineChart,
    hint: "Approval and cost readings for this desk",
  },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export function HeadInsightTabs({
  workload,
  scorecard,
  insight,
}: {
  workload: React.ReactNode;
  scorecard: React.ReactNode;
  insight: React.ReactNode;
}) {
  const [active, setActive] = useState<TabKey>("workload");
  const panels: Record<TabKey, React.ReactNode> = { workload, scorecard, insight };

  return (
    <section className="mt-5" aria-label="Service Manager analytics">
      <nav className="head-tabs" aria-label="Analytics sections">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <button
              key={t.key}
              type="button"
              className="head-tab"
              data-on={on}
              aria-pressed={on}
              onClick={() => setActive(t.key)}
              title={t.hint}
            >
              <t.icon size={13} strokeWidth={on ? 2.3 : 1.9} />
              <span>{t.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Only the selected panel is mounted. The scorecard re-fetches on every
          month change, and three live panels would have it doing that against
          a surface nobody is looking at. */}
      <div className="head-tab-panel">{panels[active]}</div>
    </section>
  );
}
