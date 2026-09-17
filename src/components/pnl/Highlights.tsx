"use client";

import { AlertTriangle, ArrowDownRight, ArrowUpRight, Scissors, Trophy } from "lucide-react";
import { millions } from "@/lib/format";
import type { Bucket } from "@/lib/resalePnl";

/**
 * What the charts below say, in sentences.
 *
 * A dashboard that only draws is a dashboard that has to be interpreted, and
 * the reader who has to interpret it will read it once and stop opening it.
 * This strip does the interpreting: it names the strongest territory, the one
 * discounting hardest, and the cost line eating the most margin — the three
 * findings a reader would otherwise have to derive by sorting the table three
 * different ways.
 *
 * Every sentence is DERIVED, never written. If the data cannot support a
 * finding — one territory only, nothing priced, no costs recorded — the card
 * is dropped rather than padded with a hedge, because a dashboard that always
 * shows three insights teaches the reader that the insights are decoration.
 *
 * A note on "worst": it is the territory selling furthest BELOW its approved
 * asking price, not the one with the thinnest profit. Thin profit is usually
 * just a cheaper mix of trucks; discounting against a price management set is
 * a decision somebody made, and it is the one worth a phone call.
 */

interface Card {
  key: string;
  icon: React.ReactNode;
  tone: "ok" | "bad" | "warn" | "neutral";
  /** The finding, in three or four words. */
  label: string;
  /** The number that carries it. */
  figure: string;
  /** The sentence a reader can repeat in a meeting. */
  say: string;
}

export function Highlights({
  now,
  territories,
}: {
  now: Bucket;
  /** Already rolled up by territory. */
  territories: Bucket[];
}) {
  const cards: Card[] = [];

  // --- Who is carrying the book -------------------------------------------
  // Ranked on profit, not sales: a territory can move a lot of metal at a
  // discount and top a sales ranking while earning less than a quieter one.
  const byProfit = [...territories].filter((t) => t.units > 0).sort((a, b) => b.margin - a.margin);
  const best = byProfit[0];
  if (best && territories.length > 1) {
    const share = now.margin > 0 ? Math.round((best.margin / now.margin) * 100) : null;
    cards.push({
      key: "best",
      icon: <Trophy size={15} />,
      tone: "ok",
      label: "Strongest territory",
      figure: best.label,
      say: `${best.units} sold, ${millions(best.margin)} profit${
        share !== null ? ` — ${share}% of the total` : ""
      }.`,
    });
  }

  // --- Who is discounting --------------------------------------------------
  const priced = territories.filter((t) => t.realisation !== null && t.units > 0);
  // Ranked on the gap as a SHARE of what was asked, so a big territory does
  // not look like the worst discounter purely for being big.
  const byDiscount = [...priced].sort(
    (a, b) => a.realisation! / (a.approvedValue || 1) - b.realisation! / (b.approvedValue || 1),
  );
  const worst = byDiscount[0];
  if (worst && worst.realisation! < 0 && priced.length > 1) {
    const pct = worst.approvedValue
      ? Math.abs((worst.realisation! / worst.approvedValue) * 100)
      : null;
    cards.push({
      key: "worst",
      icon: <ArrowDownRight size={15} />,
      tone: "bad",
      label: "Discounting hardest",
      figure: worst.label,
      say: `Closing ${millions(Math.abs(worst.realisation!))} under the approved price${
        pct !== null ? ` — ${pct.toFixed(1)}% below asking` : ""
      } on ${worst.units} truck${worst.units === 1 ? "" : "s"}.`,
    });
  } else if (priced.length > 0 && now.realisation !== null && now.realisation >= 0) {
    // Nothing to flag is itself worth saying — silence reads as missing data.
    cards.push({
      key: "onprice",
      icon: <ArrowUpRight size={15} />,
      tone: "ok",
      label: "Pricing holding",
      figure: `+${millions(now.realisation)}`,
      say: "Every territory closed at or above the approved asking price.",
    });
  }

  // --- The cost this desk can actually move --------------------------------
  // SOP rather than "whichever line is biggest". Registration and service are
  // roughly fixed per truck and land within a few tens of thousands of each
  // other, so naming one of them the biggest is a fact nobody can act on. SOP
  // is holding cost: it is set here, and it grows for every extra day a truck
  // sits unsold — which is why the sentence carries the days alongside it.
  if (now.sop > 0 && now.cost > 0) {
    const shareOfCost = Math.round((now.sop / now.cost) * 100);
    const days = now.avgDaysHeld === null ? null : Math.round(now.avgDaysHeld);
    cards.push({
      key: "sop",
      icon: <Scissors size={15} />,
      tone: "warn",
      label: "Holding cost (SOP)",
      figure: millions(now.sop),
      say: `${shareOfCost}% of all costs${
        days !== null ? `, on trucks sitting ${days} days on average` : ""
      }. Every extra month unsold adds to it.`,
    });
  }

  // --- Anything sold below cost -------------------------------------------
  // Last, and only when it happened. This is the one card that should make
  // somebody stop and look at individual files.
  if (now.lossUnits > 0) {
    cards.push({
      key: "loss",
      icon: <AlertTriangle size={15} />,
      tone: "bad",
      label: "Sold below cost",
      figure: `${now.lossUnits} truck${now.lossUnits === 1 ? "" : "s"}`,
      say: `${millions(now.lossValue)} lost on trucks that fetched less than they cost. Worth opening the files.`,
    });
  }

  if (cards.length === 0) return null;

  return (
    <div className="pnl-highlights">
      {cards.map((c) => (
        <div key={c.key} className="pnl-hl" data-tone={c.tone}>
          <span className="pnl-hl-icon">{c.icon}</span>
          <div className="pnl-hl-body">
            <span className="pnl-hl-label">{c.label}</span>
            <span className="pnl-hl-figure">{c.figure}</span>
            <span className="pnl-hl-say">{c.say}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
