// Optional demo data — a closed resale book, so the P&L tab has a history to
// analyse.
//
//   npx tsx prisma/demo-sales-history.ts          seed ~18 months of sales
//   npx tsx prisma/demo-sales-history.ts --clear  remove them again
//
// Separate from demo-vehicles.ts and using its own DEMO-SALE- prefix, so the
// two clear independently and neither can delete the other's rows.
//
// The figures are not random noise. A P&L dashboard read against uniform data
// says nothing — every month looks the same and every territory looks the
// same, so nothing on screen can be judged. These rows carry deliberate
// structure for the reader to find:
//
//   - a seasonal volume dip mid-year, and a strong final quarter
//   - one territory (Sylhet) that consistently sells below its asking price
//   - as-is units, which cost less and sell for less but turn faster
//   - two badly under-realised months, where units closed far below the
//     approved asking price, because a dashboard that has never rendered a
//     negative number is a dashboard nobody has tested

import { PrismaClient, type VehicleStatus } from "@prisma/client";

const prisma = new PrismaClient();

const PREFIX = "DEMO-SALE-";
const DAY = 86_400_000;

// The four load classes ACI Motors finances, with the price band each sits in.
const CLASSES: { model: string; base: number; spread: number }[] = [
  { model: "1 TON TM", base: 1_180_000, spread: 160_000 },
  { model: "1.2 TON TM", base: 1_420_000, spread: 180_000 },
  { model: "1.5 TON AUMARK E", base: 1_850_000, spread: 220_000 },
  { model: "3 TON AUMARK E", base: 2_480_000, spread: 300_000 },
];

const CUSTOMERS = [
  "Rahim Transport",
  "Jashore Carriers",
  "Meghna Logistics",
  "Padma Freight",
  "Bengal Movers",
  "Surma Haulage",
  "Karnaphuli Cargo",
  "Rupsha Traders",
  "Titas Distribution",
  "Shitalakshya Lines",
];

/**
 * Per-territory character.
 *
 * `realisation` is how the territory sells against the asking price: 0.98 means
 * it typically closes two percent under. `weight` is its share of volume. These
 * are what make the territory table worth reading — without them every row
 * would rank the same and the sort control would be decoration.
 */
const TERRITORY_PROFILE: Record<string, { weight: number; realisation: number }> = {
  "Dhaka North": { weight: 4, realisation: 1.005 },
  "Dhaka South": { weight: 4, realisation: 0.995 },
  Chittagong: { weight: 3, realisation: 1.01 },
  Khulna: { weight: 2, realisation: 0.985 },
  Sylhet: { weight: 2, realisation: 0.955 }, // the underperformer
  Rajshahi: { weight: 2, realisation: 0.99 },
};

/** Volume by calendar month (1-12) — a mid-year dip, a strong Q4. */
const SEASON: Record<number, number> = {
  1: 4, 2: 4, 3: 5, 4: 3, 5: 3, 6: 2,
  7: 3, 8: 4, 9: 5, 10: 6, 11: 6, 12: 5,
};

/** Deterministic PRNG, so re-running produces the same book. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

async function clear() {
  const doomed = await prisma.vehicle.findMany({
    where: { registrationNo: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = doomed.map((v) => v.id);
  if (ids.length === 0) {
    console.log("Nothing to clear.");
    return;
  }
  // Bids and costing cascade from Vehicle; regLines and events do too.
  await prisma.vehicle.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${ids.length} demo sales.`);
}

async function seed() {
  const [territories, sales, aro] = await Promise.all([
    prisma.territory.findMany({ select: { id: true, name: true } }),
    prisma.user.findMany({ where: { role: "SALES_TEAM" }, select: { id: true, name: true } }),
    prisma.user.findFirst({ where: { role: "RECOVERY_TEAM" }, select: { id: true } }),
  ]);

  if (!sales.length || !aro) {
    console.error("Need at least one sales user and one recovery officer. Run the seed first.");
    process.exitCode = 1;
    return;
  }

  const usable = territories.filter((t) => TERRITORY_PROFILE[t.name]);
  if (!usable.length) {
    console.error("No known territories found. Run the seed first.");
    process.exitCode = 1;
    return;
  }

  // A weighted bag drawn from, so volume splits by territory character.
  const bag: typeof usable = [];
  for (const t of usable) {
    for (let i = 0; i < TERRITORY_PROFILE[t.name].weight; i++) bag.push(t);
  }

  const existing = await prisma.vehicle.count({
    where: { registrationNo: { startsWith: PREFIX } },
  });
  if (existing > 0) {
    console.log(`${existing} demo sales already present — clearing them first.`);
    await clear();
  }

  const rand = rng(20260903);
  const now = new Date();
  let made = 0;

  // 18 closed months, ending with the month before the current one: the
  // current month is still open and half a month of sales would read as a
  // collapse in volume on every chart.
  for (let back = 18; back >= 1; back--) {
    const anchor = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const year = anchor.getFullYear();
    const month = anchor.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Two engineered bad months, 14 and 5 months back: a batch that sat too
    // long and closed well under the asking price. Note this dents REALISATION,
    // not margin — with no acquisition cost on the vehicle record, cost is
    // refurbishment only and a discount of this size cannot drive it negative.
    const lossMonth = back === 14 || back === 5;
    let count = SEASON[month + 1] ?? 4;
    if (lossMonth) count = Math.max(2, count - 1);

    for (let i = 0; i < count; i++) {
      const terr = bag[Math.floor(rand() * bag.length)];
      const profile = TERRITORY_PROFILE[terr.name];
      const cls = CLASSES[Math.floor(rand() * CLASSES.length)];
      const asIs = rand() < 0.22;

      // ---- Cost basis -----------------------------------------------------
      // An as-is unit skips the repair entirely, which is the whole point of
      // the decision; computeBreakdown drops it from the basis on read, but
      // the quoted figure is still stored as the disclosed fault list.
      const quotedRepair = Math.round((40_000 + rand() * 150_000) / 500) * 500;
      const transport = Math.round((5_000 + rand() * 9_000) / 100) * 100;
      const other = Math.round((1_000 + rand() * 4_000) / 100) * 100;
      const registration = Math.round((12_000 + rand() * 22_000) / 500) * 500;
      const monthsHeld = 1 + Math.floor(rand() * 3);
      const sop = Math.round((14_000 * monthsHeld + rand() * 20_000) / 500) * 500;
      const commission = rand() < 0.6 ? Math.round((8_000 + rand() * 22_000) / 500) * 500 : 0;

      const cost =
        (asIs ? 0 : quotedRepair) + transport + other + registration + sop + commission;

      // ---- Price ----------------------------------------------------------
      const book = cls.base + (rand() - 0.5) * cls.spread;
      // An as-is unit is discounted for the buyer's own repair risk.
      const approved = Math.round((book * (asIs ? 0.9 : 1) + cost * 0.35) / 1000) * 1000;
      let factor = profile.realisation + (rand() - 0.5) * 0.05;
      if (lossMonth) factor -= 0.11 + rand() * 0.05;
      const soldPrice = Math.round((approved * factor) / 1000) * 1000;

      // ---- Dates ----------------------------------------------------------
      const soldDay = 1 + Math.floor(rand() * daysInMonth);
      const soldAt = new Date(year, month, soldDay, 10 + Math.floor(rand() * 8));
      // As-is units turn faster — nothing is waiting on a workshop.
      const held = (asIs ? 35 : 70) + Math.floor(rand() * (asIs ? 45 : 110));
      const captureDate = new Date(soldAt.getTime() - held * DAY);

      const officer = sales[Math.floor(rand() * sales.length)];
      const customer = `${CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)]}, ${terr.name}`;
      const seq = String(made + 1).padStart(3, "0");

      const vehicle = await prisma.vehicle.create({
        data: {
          registrationNo: `${PREFIX}${seq}`,
          customerName: customer,
          customerCode: `CUS-${9000 + made}`,
          make: "Foton", // matches the Brand row exactly; a casing mismatch splits the model grouping in two
          model: cls.model,
          year: 2018 + Math.floor(rand() * 6),
          mileage: `${Math.round((60_000 + rand() * 180_000) / 1000)},000`,
          status: "SOLD" as VehicleStatus,
          letterStage: "WRITTEN",
          isLocked: true,
          asIs,
          territoryId: terr.id,
          captureDate,
          capturedById: aro.id,
          soldAt,
          costing: {
            create: {
              repairCost: quotedRepair,
              repairNote: asIs ? "Sold as-is — faults disclosed to buyer." : "Workshop estimate.",
              transportCost: transport,
              otherCost: other,
              sopCost: sop,
              dealerCommission: commission,
              approvedPrice: approved,
              priceSetAt: new Date(soldAt.getTime() - 20 * DAY),
            },
          },
          regLines: {
            create: [
              { description: "Registration & fitness", amount: registration, createdById: aro.id },
            ],
          },
        },
        select: { id: true },
      });

      // The winning offer, plus a couple of losing ones so the record looks
      // like a real auction rather than a single take-it-or-leave-it price.
      const winner = await prisma.bid.create({
        data: {
          vehicleId: vehicle.id,
          bidderId: officer.id,
          salesOfficerId: officer.id,
          customerName: customer,
          amount: soldPrice,
          note: "Demo — awarded.",
          createdAt: new Date(soldAt.getTime() - 2 * DAY),
        },
        select: { id: true },
      });
      await prisma.bid.createMany({
        data: [0.94, 0.89].map((f) => ({
          vehicleId: vehicle.id,
          bidderId: officer.id,
          salesOfficerId: officer.id,
          customerName: `${CUSTOMERS[Math.floor(rand() * CUSTOMERS.length)]}`,
          amount: Math.round((soldPrice * f) / 1000) * 1000,
          note: "Demo — not awarded.",
          createdAt: new Date(soldAt.getTime() - 5 * DAY),
        })),
      });

      await prisma.vehicle.update({
        where: { id: vehicle.id },
        data: { winningBidId: winner.id },
      });

      made++;
    }
  }

  console.log(`Seeded ${made} demo sales across 18 months.`);
}

async function main() {
  if (process.argv.includes("--clear")) await clear();
  else await seed();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
