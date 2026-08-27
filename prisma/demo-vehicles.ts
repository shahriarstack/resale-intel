// Optional demo data — vehicles spread across every desk so the Super Admin
// dashboard, registers and inboxes have something to show while testing.
//
//   npx tsx prisma/demo-vehicles.ts          seed demo vehicles
//   npx tsx prisma/demo-vehicles.ts --clear  remove them again
//
// Every demo vehicle uses the DEMO- registration prefix, so --clear only ever
// touches rows this script created.

import fs from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import {
  PrismaClient,
  type PhotoSlot,
  type VehicleStatus,
  type LetterStage,
  type VehicleGrade,
} from "@prisma/client";
import { gradientPng, huePair } from "./placeholder-png";

const prisma = new PrismaClient();

const PREFIX = "DEMO-";
const DAY = 1000 * 60 * 60 * 24;

// Mirrors getUploadDir() in src/lib/storage.ts.
const UPLOAD_DIR = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), "uploads");

const PHOTO_SLOTS: PhotoSlot[] = ["FRONT", "LEFT", "RIGHT", "BACK", "CABIN"];

interface Spec {
  reg: string;
  customer: string;
  make: string;
  model: string;
  year: number;
  mileage: string;
  status: VehicleStatus;
  letter: LetterStage;
  locked?: boolean;
  grade?: VehicleGrade;
  repair: [string, number][];
  registration: [string, number][];
  transport: number;
  other: number;
  sop: number;
  price?: number;
  /** Days ago the file last moved — drives the "stalled" tracker. */
  idleDays: number;
  /** Repair deadline offset in days; negative is overdue. */
  deadlineIn?: number;
}

const SPECS: Spec[] = [
  { reg: "DEMO-DHA-11-2201", customer: "Rahim Traders", make: "Foton", model: "Aumark S", year: 2021, mileage: "48000", status: "CAPTURED", letter: "NONE", repair: [], registration: [], transport: 0, other: 0, sop: 0, idleDays: 1 },
  { reg: "DEMO-DHA-11-2202", customer: "Karim Logistics", make: "Tata", model: "LPT 709", year: 2019, mileage: "92000", status: "CAPTURED", letter: "LETTER_1", repair: [], registration: [], transport: 0, other: 0, sop: 0, idleDays: 12 },
  { reg: "DEMO-CTG-12-3303", customer: "Meghna Movers", make: "Ashok Leyland", model: "Dost", year: 2020, mileage: "61000", status: "CAPTURED", letter: "LETTER_2", repair: [], registration: [], transport: 0, other: 0, sop: 0, idleDays: 3 },

  { reg: "DEMO-DHA-13-4404", customer: "Padma Distribution", make: "Foton", model: "Ollin", year: 2018, mileage: "120000", status: "CN_REQUESTED", letter: "LETTER_3", locked: true, repair: [], registration: [], transport: 8000, other: 2500, sop: 0, idleDays: 9 },
  { reg: "DEMO-SYL-14-5505", customer: "Surma Carriers", make: "Tata", model: "Ultra 1014", year: 2022, mileage: "31000", status: "CN_REQUESTED", letter: "LETTER_1", repair: [], registration: [], transport: 6500, other: 1200, sop: 0, idleDays: 2 },

  { reg: "DEMO-DHA-15-6606", customer: "Jamuna Freight", make: "Foton", model: "Aumark S", year: 2020, mileage: "74000", status: "CN_APPROVED", letter: "WRITTEN", locked: true, repair: [], registration: [], transport: 9000, other: 3000, sop: 0, idleDays: 5 },

  { reg: "DEMO-RAJ-16-7707", customer: "Barind Agro", make: "Ashok Leyland", model: "Boss", year: 2019, mileage: "88000", status: "COST_SUBMITTED", letter: "LETTER_2", repair: [["Engine overhaul", 145000], ["Clutch assembly", 38000], ["Tyres (6)", 96000]], registration: [], transport: 12000, other: 4500, sop: 0, idleDays: 11 },
  { reg: "DEMO-KHU-17-8808", customer: "Rupsha Transport", make: "Tata", model: "LPT 1109", year: 2017, mileage: "156000", status: "COST_SUBMITTED", letter: "LETTER_3", locked: true, repair: [["Gearbox rebuild", 118000], ["Body panel work", 52000]], registration: [], transport: 15000, other: 6000, sop: 0, idleDays: 4 },

  { reg: "DEMO-DHA-18-9909", customer: "Turag Haulage", make: "Foton", model: "Ollin", year: 2021, mileage: "42000", status: "REPAIR_APPROVED", letter: "LETTER_1", repair: [["Suspension kit", 64000], ["Paint & finish", 41000]], registration: [], transport: 7500, other: 2200, sop: 0, idleDays: 16, deadlineIn: -6 },
  { reg: "DEMO-CTG-19-1010", customer: "Karnaphuli Cargo", make: "Tata", model: "Ultra 1014", year: 2020, mileage: "67000", status: "REPAIR_APPROVED", letter: "NONE", repair: [["Brake system", 34000], ["AC & electricals", 27500]], registration: [], transport: 8800, other: 1900, sop: 0, idleDays: 3, deadlineIn: 9 },

  { reg: "DEMO-DHA-20-1111", customer: "Buriganga Lines", make: "Ashok Leyland", model: "Dost", year: 2019, mileage: "95000", status: "REGISTRATION_DONE", letter: "LETTER_2", repair: [["Full service", 58000]], registration: [["Fitness renewal", 14500], ["Tax token", 22000]], transport: 6200, other: 1500, sop: 0, idleDays: 8 },

  { reg: "DEMO-SYL-21-1212", customer: "Kushiyara Freight", make: "Foton", model: "Aumark S", year: 2022, mileage: "28000", status: "SOP_ADDED", letter: "NONE", grade: "A", repair: [["Minor touch-up", 19000]], registration: [["Fitness renewal", 14500]], transport: 5400, other: 900, sop: 35000, idleDays: 2 },

  { reg: "DEMO-DHA-22-1313", customer: "Shitalakshya Movers", make: "Tata", model: "LPT 709", year: 2020, mileage: "71000", status: "PRICE_APPROVED", letter: "LETTER_1", grade: "B", repair: [["Engine tune", 47000], ["Tyres (4)", 62000]], registration: [["Tax token", 22000]], transport: 7100, other: 2400, sop: 42000, price: 1_850_000, idleDays: 6 },

  { reg: "DEMO-DHA-23-1414", customer: "Dhaleshwari Transport", make: "Foton", model: "Ollin", year: 2021, mileage: "39000", status: "LIVE_FOR_RESALE", letter: "NONE", grade: "A", repair: [["Full detailing", 31000]], registration: [["Fitness renewal", 14500], ["Tax token", 22000]], transport: 6800, other: 1600, sop: 38000, price: 2_260_000, idleDays: 4 },
  { reg: "DEMO-CTG-24-1515", customer: "Sangu Carriers", make: "Tata", model: "Ultra 1014", year: 2020, mileage: "58000", status: "LIVE_FOR_RESALE", letter: "LETTER_1", grade: "B", repair: [["Gearbox service", 73000], ["Paint", 45000]], registration: [["Tax token", 22000]], transport: 9200, other: 3100, sop: 44000, price: 1_940_000, idleDays: 10 },
  { reg: "DEMO-RAJ-25-1616", customer: "Padma Bulk", make: "Ashok Leyland", model: "Boss", year: 2018, mileage: "134000", status: "LIVE_FOR_RESALE", letter: "LETTER_2", grade: "C", repair: [["Engine overhaul", 162000], ["Chassis repair", 88000]], registration: [["Fitness renewal", 14500]], transport: 13500, other: 5200, sop: 51000, price: 1_420_000, idleDays: 21 },

  { reg: "DEMO-KHU-26-1717", customer: "Mongla Freight", make: "Tata", model: "LPT 1109", year: 2016, mileage: "182000", status: "RELEASED", letter: "WRITTEN", locked: true, repair: [], registration: [], transport: 4200, other: 800, sop: 0, idleDays: 30 },
];

/** Write the placeholder shots for one vehicle and return their photo rows. */
async function makePhotos(index: number, uploaderId: string) {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  const rows: { slot: PhotoSlot; url: string; uploadedById: string }[] = [];

  for (const [i, slot] of PHOTO_SLOTS.entries()) {
    const [from, to] = huePair(index * PHOTO_SLOTS.length + i);
    const name = `${randomUUID()}.png`;
    await fs.writeFile(path.join(UPLOAD_DIR, name), gradientPng(960, 600, from, to));
    rows.push({ slot, url: `/api/files/${name}`, uploadedById: uploaderId });
  }
  return rows;
}

async function clear() {
  const rows = await prisma.vehicle.findMany({
    where: { registrationNo: { startsWith: PREFIX } },
    select: { id: true, photos: { select: { url: true } } },
  });
  if (rows.length === 0) {
    console.log("No demo vehicles found.");
    return;
  }

  // Photo rows cascade with the vehicle, but the files on disk do not.
  let files = 0;
  for (const v of rows) {
    for (const p of v.photos) {
      const name = p.url.split("/").pop();
      if (!name) continue;
      try {
        await fs.unlink(path.join(UPLOAD_DIR, name));
        files++;
      } catch {
        // already gone — nothing to do
      }
    }
  }

  // Cost lines, answers, photos, bids and events cascade on vehicle delete.
  await prisma.vehicle.deleteMany({ where: { registrationNo: { startsWith: PREFIX } } });
  console.log(`✓ removed ${rows.length} demo vehicles and ${files} placeholder images`);
}

async function seed() {
  const [aro, engineer, sales, territories] = await Promise.all([
    prisma.user.findUnique({ where: { staffId: "ARO-01" }, select: { id: true } }),
    prisma.user.findUnique({ where: { staffId: "SE-01" }, select: { id: true } }),
    prisma.user.findUnique({ where: { staffId: "MO-01" }, select: { id: true } }),
    prisma.territory.findMany({ select: { id: true, name: true } }),
  ]);

  if (!aro || !engineer) {
    throw new Error("Run `npx prisma db seed` first — ARO-01 and SE-01 must exist.");
  }
  if (territories.length === 0) {
    throw new Error("No territories found. Run `npx prisma db seed` first.");
  }

  let made = 0;
  let bids = 0;
  for (const [i, s] of SPECS.entries()) {
    const territory = territories[i % territories.length];

    const vehicle = await prisma.vehicle.upsert({
      where: { registrationNo: s.reg },
      update: {},
      create: {
        registrationNo: s.reg,
        customerName: s.customer,
        make: s.make,
        model: s.model,
        year: s.year,
        mileage: s.mileage,
        status: s.status,
        letterStage: s.letter,
        grade: s.grade ?? null,
        isLocked: s.locked ?? false,
        remarks: "Demo record — safe to delete.",
        territoryId: territory.id,
        capturedById: aro.id,
        assignedEngineerId: engineer.id,
        repairDeadline:
          s.deadlineIn === undefined ? null : new Date(Date.now() + s.deadlineIn * DAY),
        costing: {
          create: {
            transportCost: s.transport,
            otherCost: s.other,
            sopCost: s.sop,
            approvedPrice: s.price ?? null,
          },
        },
        repairLines: {
          create: s.repair.map(([description, amount]) => ({
            description,
            amount,
            createdById: engineer.id,
          })),
        },
        regLines: {
          create: s.registration.map(([description, amount]) => ({
            description,
            amount,
            createdById: engineer.id,
          })),
        },
        photos: { create: await makePhotos(i, aro.id) },
        events: {
          create: [
            { type: "CAPTURED", actorId: aro.id, toStatus: "CAPTURED" },
            ...(s.status !== "CAPTURED"
              ? [
                  {
                    type: "CN_REQUESTED" as const,
                    actorId: aro.id,
                    fromStatus: "CAPTURED" as const,
                    toStatus: "CN_REQUESTED" as const,
                  },
                ]
              : []),
            ...(s.repair.length > 0
              ? [
                  {
                    type: "ASSESSMENT_SUBMITTED" as const,
                    actorId: engineer.id,
                    fromStatus: "CN_APPROVED" as const,
                    toStatus: "COST_SUBMITTED" as const,
                  },
                ]
              : []),
            ...(s.price
              ? [
                  {
                    type: "PRICE_APPROVED" as const,
                    actorId: engineer.id,
                    fromStatus: "SOP_ADDED" as const,
                    toStatus: "PRICE_APPROVED" as const,
                    note: "Demo pricing — approved against the full cost base.",
                  },
                ]
              : []),
          ],
        },
      },
      select: { id: true },
    });

    // A sealed bid or two on live stock, so the marketplace has a bid book.
    if (s.status === "LIVE_FOR_RESALE" && s.price && sales) {
      const existing = await prisma.bid.count({ where: { vehicleId: vehicle.id } });
      if (existing === 0) {
        await prisma.bid.create({
          data: {
            vehicleId: vehicle.id,
            bidderId: sales.id,
            amount: Math.round(s.price * 0.96),
            note: "Demo bid — buyer viewing arranged.",
          },
        });
        bids++;
      }
    }

    // updatedAt is Prisma-managed, so back-date it directly to drive the
    // "stalled 7d+" tracker on the admin dashboard.
    const idleAt = new Date(Date.now() - s.idleDays * DAY);
    await prisma.$executeRaw`UPDATE Vehicle SET updatedAt = ${idleAt} WHERE id = ${vehicle.id}`;
    made++;
  }

  console.log(`✓ ${made} demo vehicles across ${new Set(SPECS.map((s) => s.status)).size} statuses`);
  console.log(`✓ ${made * PHOTO_SLOTS.length} placeholder images in ${UPLOAD_DIR}`);
  if (bids > 0) console.log(`✓ ${bids} demo bid${bids === 1 ? "" : "s"} from MO-01`);
  console.log(`\nRemove them with:  npx tsx prisma/demo-vehicles.ts --clear`);
}

const run = process.argv.includes("--clear") ? clear : seed;

run()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
