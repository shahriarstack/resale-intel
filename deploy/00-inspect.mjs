/**
 * What state is this database in?
 *
 * Run this FIRST on the server, before anything else and again after each
 * step. It changes nothing; it answers the four questions that decide which of
 * the other scripts still need to run, and it answers them from the database
 * rather than from anybody's memory of what was deployed in August.
 *
 * Plain .mjs on purpose. It needs only `@prisma/client`, which ships inside
 * the release, so it runs on a cPanel account with no toolchain, no tsx and no
 * dev dependencies:
 *
 *   node deploy/00-inspect.mjs
 */
import { loadEnv } from "./env.mjs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

loadEnv();
const prisma = new PrismaClient();

const exists = async (table, column = null) => {
  const rows = column
    ? await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        table,
        column,
      )
    : await prisma.$queryRawUnsafe(
        `SELECT COUNT(*) AS n FROM information_schema.tables
          WHERE table_schema = DATABASE() AND table_name = ?`,
        table,
      );
  return Number(rows[0].n) > 0;
};

const count = async (table) => {
  try {
    const rows = await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS n FROM \`${table}\``);
    return Number(rows[0].n);
  } catch {
    return null;
  }
};

async function main() {
  const [db] = await prisma.$queryRawUnsafe(`SELECT DATABASE() AS db, VERSION() AS v`);
  console.log(`\nDatabase : ${db.db}`);
  console.log(`Server   : ${db.v}\n`);

  const oldColumn = await exists("User", "territoryId");
  const blocker = await exists("Vehicle", "repairBlocker");
  const postings = await exists("TerritoryPosting");
  const snapshot = await exists("_posting_snapshot");
  const portal = await exists("Portal");

  const line = (label, ok, note) =>
    console.log(`  ${ok ? "yes" : "no "}  ${label.padEnd(34)}${note ?? ""}`);

  console.log("SCHEMA");
  line("User.territoryId (the old column)", oldColumn, oldColumn ? "— not yet migrated" : "");
  line("TerritoryPosting", postings, postings ? `— ${await count("TerritoryPosting")} row(s)` : "");
  line("Portal", portal, portal ? `— ${await count("Portal")} row(s)` : "");
  line("_posting_snapshot (this migration's)", snapshot, snapshot ? `— ${await count("_posting_snapshot")} row(s)` : "");
  // Additive and safe — `db push` adds it without touching a row — but a
  // release whose code expects it and whose database has not got it fails on
  // the engineer's bench, which is not where anybody looks first.
  line("Vehicle.repairBlocker", blocker, blocker ? "" : "— needs a push");

  // Sign-in. Every account's passcode is its own Staff ID; an account whose
  // stored hash says otherwise is an account that cannot sign in, and there is
  // no screen anywhere that would report it.
  console.log("\nSIGN-IN");
  let users = [];
  try {
    users = await prisma.$queryRawUnsafe(
      `SELECT staffId, passwordHash, isActive FROM \`User\` ORDER BY staffId`,
    );
  } catch (e) {
    console.log("  could not read User:", e.message);
  }

  let aligned = 0;
  const broken = [];
  for (const u of users) {
    const ok = await bcrypt.compare(String(u.staffId).trim().toUpperCase(), u.passwordHash ?? "");
    if (ok) aligned += 1;
    else broken.push(u.staffId);
  }
  console.log(`  ${aligned}/${users.length} account(s) sign in with their Staff ID`);
  if (broken.length) {
    console.log(`  cannot sign in: ${broken.slice(0, 12).join(", ")}${broken.length > 12 ? " …" : ""}`);
    console.log(`  → run deploy/03-align-credentials.mjs`);
  }

  console.log("\nWHAT TO RUN");
  if (oldColumn && !snapshot) {
    console.log("  1. node deploy/01-snapshot-postings.mjs   ← BEFORE any prisma db push");
    console.log("  2. npx prisma db push");
    console.log("  3. node deploy/02-backfill-postings.mjs");
  } else if (oldColumn && snapshot) {
    console.log("  1. npx prisma db push");
    console.log("  2. node deploy/02-backfill-postings.mjs");
  } else if (!postings) {
    console.log("  ! The old column is gone and TerritoryPosting does not exist.");
    console.log("    Push the schema, then check whether _posting_snapshot survived.");
  } else if (snapshot && (await count("TerritoryPosting")) === 0) {
    console.log("  1. node deploy/02-backfill-postings.mjs");
  } else if (!blocker) {
    console.log("  1. npx prisma db push   ← adds Vehicle.repairBlocker (additive, safe)");
  } else {
    console.log("  Schema is current.");
  }
  if (broken.length) console.log("  + node deploy/03-align-credentials.mjs");
  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
