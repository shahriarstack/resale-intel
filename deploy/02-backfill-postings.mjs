/**
 * Turn the snapshot into BASE postings.
 *
 * Runs AFTER `prisma db push`, and reads `_posting_snapshot` rather than
 * `User.territoryId` — by this point the column is gone, which is exactly why
 * `01-snapshot-postings.mjs` had to run before the push.
 *
 * Every posting written here is BASE: it is where that officer works. COVER —
 * a vacant neighbouring patch somebody has picked up — is a decision an admin
 * makes in the users console, and nothing in the old single-column data could
 * have distinguished the two.
 *
 * Idempotent, and deliberately conservative: an officer who already has a
 * posting for that territory is left exactly as they are, including its kind,
 * so re-running this can never demote a COVER back to BASE.
 *
 *   node deploy/02-backfill-postings.mjs
 */
import { loadEnv } from "./env.mjs";
import { PrismaClient } from "@prisma/client";

loadEnv();
const prisma = new PrismaClient();

async function main() {
  const [{ n }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM information_schema.tables
      WHERE table_schema = DATABASE() AND table_name = '_posting_snapshot'`,
  );
  if (Number(n) === 0) {
    console.error("_posting_snapshot does not exist.");
    console.error("Either 01-snapshot-postings.mjs was never run, or it ran after the push —");
    console.error("in which case the territories are gone and have to be re-entered by hand.");
    process.exit(1);
  }

  const rows = await prisma.$queryRawUnsafe(
    `SELECT s.userId, s.staffId, s.territoryId
       FROM _posting_snapshot s
       JOIN \`User\` u ON u.id = s.userId
       JOIN Territory t ON t.id = s.territoryId
      ORDER BY s.staffId`,
  );

  // Anything the join dropped: an officer deleted since the snapshot, or a
  // territory that no longer exists. Reported rather than skipped silently —
  // a posting that cannot be restored is somebody's patch going missing.
  const [{ taken }] = await prisma.$queryRawUnsafe(
    // `all` is reserved — aliasing to it is a syntax error, and it is one that
    // only shows up against a real server, halfway through a migration.
    `SELECT COUNT(*) AS taken FROM _posting_snapshot`,
  );
  const orphaned = Number(taken) - rows.length;

  let made = 0;
  for (const r of rows) {
    const existing = await prisma.territoryPosting.findUnique({
      where: { userId_territoryId: { userId: r.userId, territoryId: r.territoryId } },
      select: { kind: true },
    });
    if (existing) {
      console.log(`  ${String(r.staffId).padEnd(14)} already posted (${existing.kind})`);
      continue;
    }
    await prisma.territoryPosting.create({
      data: { userId: r.userId, territoryId: r.territoryId, kind: "BASE" },
    });
    made += 1;
    console.log(`  ${String(r.staffId).padEnd(14)} BASE posting created`);
  }

  const total = await prisma.territoryPosting.count();
  console.log(`\n${made} posting(s) created; ${total} in total.`);
  if (orphaned > 0) {
    console.log(
      `${orphaned} snapshot row(s) could not be restored — the officer or the territory no ` +
        `longer exists. Those people have no patch until one is set in the admin console.`,
    );
  }
  console.log(
    "\n_posting_snapshot is left in place on purpose: it is the only record of what the " +
      "old column held. Drop it once the coverage board looks right.",
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
