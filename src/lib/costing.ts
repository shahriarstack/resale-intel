// Total cost = repair (sum of lines) + transport + other + registration (sum of
// lines) + SOP. Every component counts — transport and other are not dropped.

export interface CostBreakdown {
  repair: number;
  transport: number;
  other: number;
  registration: number;
  sop: number;
  total: number;
  approvedPrice: number | null;
  margin: number | null;
  marginPct: number | null;
}

interface CostingInput {
  transportCost: number;
  otherCost: number;
  sopCost: number;
  approvedPrice: number | null;
}

export function computeBreakdown(
  costing: CostingInput | null | undefined,
  repairLines: { amount: number }[],
  regLines: { amount: number }[],
): CostBreakdown {
  const repair = sum(repairLines);
  const registration = sum(regLines);
  const transport = costing?.transportCost ?? 0;
  const other = costing?.otherCost ?? 0;
  const sop = costing?.sopCost ?? 0;
  const total = repair + transport + other + registration + sop;

  const approvedPrice = costing?.approvedPrice ?? null;
  const margin = approvedPrice === null ? null : approvedPrice - total;
  const marginPct =
    approvedPrice === null || approvedPrice === 0
      ? null
      : ((approvedPrice - total) / approvedPrice) * 100;

  return { repair, transport, other, registration, sop, total, approvedPrice, margin, marginPct };
}

function sum(lines: { amount: number }[]): number {
  return lines.reduce((acc, l) => acc + (l.amount || 0), 0);
}
