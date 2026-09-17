"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CheckCircle2, ChevronRight, MailWarning } from "lucide-react";
import { ConsolePage, ListShell, ListEmpty } from "@/components/recovery/ConsolePage";
import { PartFilter, matchesPart, type PartChoice } from "@/components/recovery/PartFilter";
import { Chip } from "@/components/ui/Chip";
import { vehicleTitle } from "@/lib/vehicle";
import { AccountTitle } from "@/components/ui/AccountTitle";
import { shortDate } from "@/lib/format";
import type { CaptureRow } from "@/lib/recoveryDesk";

/* THE WIDTH FOLLOWED THE HEADING. Column one was sized for a load class
 * and now carries a customer code, a customer name and a registration;
 * column two was sized for a customer name and now carries the model,
 * which is the shorter of the two. The pair swapped share as well as
 * content, so nothing had to grow overall. */
const GRID = "minmax(196px,1.55fr) minmax(104px,0.72fr) minmax(110px,0.8fr) 110px 100px 110px auto";

/**
 * Captures whose notice schedule has slipped.
 *
 * A watch list, not a work queue — the desk cannot issue a letter, only the
 * officer holding the file can. So every row links out and nothing here acts.
 * It earns its own route because it is the one thing on this desk that is
 * about the CAPTURE track rather than the off-road one, and burying it as a
 * tab among the case boards made it look like a kind of case.
 */
export function LetterWatch({ rows }: { rows: CaptureRow[] }) {
  const [part, setPart] = useState<PartChoice>("all");

  const partCounts = useMemo(
    () => ({
      all: rows.length,
      A: rows.filter((v) => v.territory?.part === "A").length,
      B: rows.filter((v) => v.territory?.part === "B").length,
    }),
    [rows],
  );

  const sorted = useMemo(() => {
    const late = (v: CaptureRow) => (v.letters.next?.overdue ? -v.letters.next.daysLeft : 0);
    return rows.filter((v) => matchesPart(part, v.territory)).sort((a, b) => late(b) - late(a));
  }, [rows, part]);

  return (
    <ConsolePage
      eyebrow="Supervision"
      title="Letter watch"
      icon={MailWarning}
      intro="The escalation ladder runs on a clock: Letter 1 the day after capture, Letter 2 seven days later, Letter 3 seven days after that. A missed letter delays the Credit Note that ends up on this desk."
      filter={<PartFilter value={part} onChange={setPart} counts={partCounts} />}
    >
      <ListShell>
        {sorted.length === 0 ? (
          <ListEmpty
            icon={CheckCircle2}
            message={
              part === "all"
                ? "Every captured file is on schedule."
                : `Every captured file in part ${part} is on schedule.`
            }
          />
        ) : (
          <>
            <div
              className="grid items-center gap-x-3 border-b border-rule-strong px-3 py-2"
              style={{ gridTemplateColumns: GRID, background: "var(--surface-2)" }}
            >
              {/* Customer leads — the columns swapped ends when the account
                  became the heading. See lib/vehicle.ts. */}
              {["Customer", "Vehicle", "Territory"].map((h) => (
                <span key={h} className="label !mb-0 text-[9px]">
                  {h}
                </span>
              ))}
              <span className="label !mb-0 text-[9px]">Stage</span>
              <span className="label !mb-0 text-right text-[9px]">Owed</span>
              <span className="label !mb-0 text-right text-[9px]">Due</span>
              <span className="label !mb-0 text-right text-[9px]">Late by</span>
            </div>

            {sorted.map((v) => {
              const next = v.letters.next;
              const late = next?.overdue ? Math.abs(next.daysLeft) : 0;
              return (
                <Link
                  key={v.id}
                  href={`/vehicles/${v.id}`}
                  className="grid items-center gap-x-3 border-b border-rule px-3 py-2 transition-colors last:border-0 hover:bg-surface-2"
                  style={{ gridTemplateColumns: GRID }}
                >
                  <div className="min-w-0">
                    {/* The account leads. A letter ladder is a notice period
                        being served on a customer; the truck is what the
                        notice is about. */}
                    <AccountTitle
                      record={v}
                      as="div"
                      className="font-display text-[13.5px] font-bold leading-tight text-ink"
                    />
                    <div className="truncate font-mono text-[10.5px] text-ink-3">
                      {v.registrationNo}
                    </div>
                  </div>
                  <div className="min-w-0 truncate text-[12.5px] text-ink-2">
                    {vehicleTitle(v)}
                  </div>
                  <div className="min-w-0 truncate font-mono text-[11px] text-ink-3">
                    {v.territory?.name ?? "—"}
                  </div>
                  <div>
                    <Chip tone="neutral">{v.letterStage.replace("LETTER_", "Letter ")}</Chip>
                  </div>
                  <div className="text-right text-[12px] font-semibold text-ink-2">
                    {next?.label ?? "—"}
                  </div>
                  <div className="text-right font-mono text-[11px] text-ink-3 tnum">
                    {next ? shortDate(next.dueAt) : "—"}
                  </div>
                  <div className="flex items-center justify-end gap-1.5">
                    <span
                      className="font-mono text-[14px] font-bold tnum"
                      style={{ color: "var(--bad)" }}
                    >
                      {late}d
                    </span>
                    <ChevronRight size={15} className="text-ink-3" />
                  </div>
                </Link>
              );
            })}
          </>
        )}
      </ListShell>
    </ConsolePage>
  );
}
