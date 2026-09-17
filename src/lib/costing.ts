// Total cost = repair + transport + other + registration (sum of lines) + SOP
// + dealer commission. Every component counts — transport and other are not
// dropped.
//
// Repair is one figure now, quoted by the engineer against an uploaded
// estimate sheet, rather than a sum over line items. Registration stays
// itemised: that desk is entering fees it looks up one at a time, which is a
// different job from transcribing a quotation somebody else already wrote.
//
// The one exception is an as-is vehicle. Its repair lines survive as the
// disclosed fault list, but the Service Manager decided not to spend them, so
// counting them would price the vehicle against money that will never leave
// the business — inflating cost, understating margin, and making the whole
// point of an as-is sale invisible in the numbers.

export interface CostBreakdown {
  repair: number;
  transport: number;
  other: number;
  registration: number;
  sop: number;
  dealerCommission: number;
  total: number;
  approvedPrice: number | null;
  margin: number | null;
  marginPct: number | null;
  asIs: boolean;
  /** The estimate an as-is decision took out of the cost basis. */
  repairAvoided: number;
}

interface CostingInput {
  /** The engineer's quoted repair total. */
  repairCost?: number;
  transportCost: number;
  otherCost: number;
  sopCost: number;
  // Optional so callers that select a narrower slice of Costing still compile;
  // absent is treated as zero, which is what an un-migrated row holds anyway.
  dealerCommission?: number;
  approvedPrice: number | null;
}

export function computeBreakdown(
  costing: CostingInput | null | undefined,
  regLines: { amount: number }[],
  /** The vehicle sells in the condition it arrived in — no repair was spent. */
  asIs = false,
): CostBreakdown {
  const quoted = costing?.repairCost ?? 0;
  const repair = asIs ? 0 : quoted;
  const registration = sum(regLines);
  const transport = costing?.transportCost ?? 0;
  const other = costing?.otherCost ?? 0;
  const sop = costing?.sopCost ?? 0;
  const dealerCommission = costing?.dealerCommission ?? 0;
  const total = repair + transport + other + registration + sop + dealerCommission;

  const approvedPrice = costing?.approvedPrice ?? null;
  const margin = approvedPrice === null ? null : approvedPrice - total;
  const marginPct =
    approvedPrice === null || approvedPrice === 0
      ? null
      : ((approvedPrice - total) / approvedPrice) * 100;

  return {
    repair,
    transport,
    other,
    registration,
    sop,
    dealerCommission,
    total,
    approvedPrice,
    margin,
    marginPct,
    asIs,
    /** What the as-is decision saved. Zero on a repaired vehicle. */
    repairAvoided: asIs ? quoted : 0,
  };
}

function sum(lines: { amount: number }[]): number {
  return lines.reduce((acc, l) => acc + (l.amount || 0), 0);
}
