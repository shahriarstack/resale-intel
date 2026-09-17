"use client";

import { millions } from "@/lib/format";
import type { Bucket } from "@/lib/resalePnl";

/**
 * Where the sale money went, one line at a time.
 *
 *   profit = sales − (SOP + additional costs)
 *
 * That is the formula the business states its margin in, and this is that
 * formula drawn to scale. The top bar is everything the buyers paid; each step
 * below takes one cost line out of it; the last bar is what survived. Nobody
 * has to hold five figures in their head to see which line is eating the
 * margin — the longest bar is the answer.
 *
 * Horizontal rather than a column waterfall for two reasons: the labels are
 * words, not dates, and words want a left edge to sit against; and it makes
 * this panel read differently from the month chart above it, which is a
 * different question and should not look like the same one.
 *
 * TWO cost lines, not five. Registration and service both land around twenty
 * to sixty thousand on a typical vehicle — close enough to each other, and
 * small enough against the sale, that splitting them out gave the reader three
 * near-identical hairlines to compare and no decision to make from them. What
 * is worth separating is SOP, because it is the one cost this desk sets and
 * can move; everything else is what it takes to make a truck sellable. The
 * per-line detail is still on the vehicle record for anyone auditing a file.
 *
 * Both cost steps wear the SAME hue. They are both cost — the reader tells
 * them apart by the label at the start of the row, not by colour. Bar LENGTH
 * is the encoding here; hue only separates revenue, cost and what is left.
 */

interface Step {
  key: string;
  label: string;
  hint: string;
  amount: number;
}

export function CostWaterfall({ bucket }: { bucket: Bucket }) {
  const steps: Step[] = [
    {
      key: "sop",
      label: "SOP",
      hint: "Holding cost while the vehicle waited for a buyer — the one cost this desk sets",
      amount: bucket.sop,
    },
    {
      key: "additional",
      label: "Additional costs",
      hint: "Registration, service, transport and dealer commission — what it took to make the truck sellable",
      amount: bucket.registration + bucket.service + bucket.other + bucket.commission,
    },
  ];

  const sold = bucket.soldValue;
  if (sold <= 0) {
    return <p className="py-8 text-center text-[13px] text-ink-3">Nothing sold in this range.</p>;
  }

  // The scale is the sold value, so every bar is literally its share of the
  // sale. A scale fitted to the largest bar would make the biggest cost look
  // like the whole of it.
  const pct = (n: number) => (n / sold) * 100;

  // Running left edge: each cost step starts where the previous one ended,
  // counting down from the full sale — which is what makes it a waterfall
  // rather than five bars that happen to be stacked.
  let cursor = 0;

  return (
    <div className="wf">
      <Row
        label="Sales"
        hint="What the buyers actually paid"
        amount={sold}
        left={0}
        width={100}
        tone="value"
        emphasis
      />

      {steps.map((s) => {
        const w = pct(s.amount);
        const left = cursor;
        cursor += w;
        return (
          <Row
            key={s.key}
            label={s.label}
            hint={s.hint}
            amount={-s.amount}
            left={left}
            width={w}
            tone="cost"
            share={pct(s.amount)}
          />
        );
      })}

      <Row
        label="Profit"
        hint="What is left after the costs above"
        amount={bucket.margin}
        left={0}
        width={Math.abs(pct(bucket.margin))}
        tone={bucket.margin < 0 ? "loss" : "margin"}
        emphasis
        share={pct(bucket.margin)}
      />

      <p className="wf-foot">
        Every bar is drawn against sales, so its length is its share of the money taken.
        {bucket.multiple !== null && (
          <>
            {" "}
            The book brought back <strong>{bucket.multiple.toFixed(2)}x</strong> what it spent.
          </>
        )}
      </p>
    </div>
  );
}

function Row({
  label,
  hint,
  amount,
  left,
  width,
  tone,
  emphasis,
  share,
}: {
  label: string;
  hint: string;
  amount: number;
  left: number;
  width: number;
  tone: "value" | "cost" | "margin" | "loss";
  emphasis?: boolean;
  share?: number;
}) {
  const bg =
    tone === "value"
      ? "var(--chart-value)"
      : tone === "cost"
        ? "var(--chart-cost)"
        : tone === "loss"
          ? "var(--bad)"
          : "var(--ok)";

  return (
    <div className="wf-row" data-emphasis={emphasis || undefined} title={hint}>
      <span className="wf-label">{label}</span>
      <span className="wf-track">
        <span
          className="wf-bar"
          style={{
            left: `${left}%`,
            // A hairline minimum, so a cost line of almost nothing is still
            // visibly a line rather than reading as absent.
            width: `max(2px, ${width}%)`,
            background: bg,
          }}
        />
      </span>
      <span className="wf-amount" data-sign={amount < 0 ? "minus" : undefined}>
        {amount < 0 ? "−" : ""}
        {millions(Math.abs(amount))}
      </span>
      <span className="wf-share">{share === undefined ? "" : `${share.toFixed(1)}%`}</span>
    </div>
  );
}
