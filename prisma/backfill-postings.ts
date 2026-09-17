import { PrismaClient } from "@prisma/client";

/**
 * Turn every existing `User.territoryId` into a BASE posting.
 *
 * Run ONCE, between adding `TerritoryPosting` to the schema and dropping the
 * old column — that order is the whole point. `prisma db push` drops a removed
 * column and everything in it, so a backfill that runs afterwards has nothing
 * left to read and every officer silently loses their patch.
 *
 * Idempotent: the (userId, territoryId) pair is unique, and an existing
 * posting is left exactly as it is — including its kind, so re-running this
 * cannot demote a COVER back to BASE.
 *
 *   npx tsx prisma/backfill-postings.ts
 */
const prisma = new PrismaClient();

async function main() {
  // `territoryId` is gone from the Prisma schema by the time anyone reads this,
  // so it is read with raw SQL. The column still exists in the database at the
  // moment this runs; that is exactly the window this script lives in.
  const rows = await prisma.$queryRawUnsafe<{ id: string; staffId: string; territoryId: string }[]>(
    `SELECT id, staffId, territoryId FROM user WHERE territoryId IS NOT NULL`,
  );

  let made = 0;
  for (const r of rows) {
    const existing = await prisma.territoryPosting.findUnique({
      where: { userId_territoryId: { userId: r.id, territoryId: r.territoryId } },
      select: { id: true, kind: true },
    });
    if (existing) {
      console.log(`  ${r.staffId.padEnd(12)} already posted (${existing.kind})`);
      continue;
    }
    await prisma.territoryPosting.create({
      data: { userId: r.id, territoryId: r.territoryId, kind: "BASE" },
    });
    made += 1;
    console.log(`  ${r.staffId.padEnd(12)} BASE posting created`);
  }

  const total = await prisma.territoryPosting.count();
  console.log(`\n${made} posting(s) created; ${total} in total.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
