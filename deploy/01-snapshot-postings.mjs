/**
 * Copy `User.territoryId` somewhere the migration cannot destroy it.
 *
 * THIS RUNS BEFORE `prisma db push`, AND THE ORDER IS THE WHOLE POINT.
 *
 * The schema in this release has no `territoryId` column — an officer's
 * territories are `TerritoryPosting` rows now, because one column could not
 * say that somebody is covering a vacant patch next door. `prisma db push`
 * therefore does two things in one pass: it creates the new table and it drops
 * the old column, with everything in it. There is no moment in between, so a
 * backfill that runs afterwards has nothing left to read and every officer
 * silently loses their patch — no error, no empty result, just a coverage
 * board that reports an unstaffed country.
 *
 * So the column is copied out first, into a side table the push does not know
 * about and will not touch. `02-backfill-postings.mjs` reads it afterwards.
 *
 * Idempotent, and safe to run on a database that has already been migrated:
 * if the column is gone it says so and writes nothing.
 *
 *   node deploy/01-snapshot-postings.mjs
 */
import { loadEnv } from "./env.mjs";
import { PrismaClient } from "@prisma/client";

loadEnv();
const prisma = new PrismaClient();

async function main() {
  const [{ n }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'User' AND column_name = 'territoryId'`,
  );

  if (Number(n) === 0) {
    console.log("User.territoryId is already gone — nothing to snapshot.");
    console.log("If the postings are also empty, the snapshot from an earlier run is the only");
    console.log("copy left; check _posting_snapshot before pushing anything else.");
    return;
  }

  // THE SNAPSHOT MUST CARRY THE SAME COLLATION AS THE TABLES IT WILL BE JOINED
  // BACK TO. A bare `DEFAULT CHARSET=utf8mb4` takes the server's own default —
  // `utf8mb4_general_ci` on MariaDB 11, where Prisma writes
  // `utf8mb4_unicode_ci` — and MySQL refuses to compare two VARCHARs of
  // different collations at all: the backfill dies on
  // "Illegal mix of collations", halfway through a migration, with the old
  // column already dropped. Read it off `User.id` rather than naming one, so
  // this holds on whatever the host happens to be configured with.
  const [idCol] = await prisma.$queryRawUnsafe(
    `SELECT COLLATION_NAME AS c FROM information_schema.columns
      WHERE table_schema = DATABASE() AND table_name = 'User' AND column_name = 'id'`,
  );
  const collation = idCol?.c ?? "utf8mb4_unicode_ci";
  const charset = collation.split("_")[0];
  console.log(`Matching the snapshot to User.id: ${collation}`);

  // Deliberately NOT a Prisma model. It exists for the length of one migration
  // and a model would have to be added and then removed again, which is two
  // more pushes against a production database for a table nobody queries.
  await prisma.$executeRawUnsafe(
    `CREATE TABLE IF NOT EXISTS _posting_snapshot (
       userId      VARCHAR(191) NOT NULL PRIMARY KEY,
       staffId     VARCHAR(191) NOT NULL,
       territoryId VARCHAR(191) NOT NULL,
       takenAt     DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
     ) ENGINE=InnoDB DEFAULT CHARSET=${charset} COLLATE=${collation}`,
  );

  // A snapshot left behind by an earlier run of a version that did not do the
  // above. Converting is free when it already matches.
  await prisma.$executeRawUnsafe(
    `ALTER TABLE _posting_snapshot CONVERT TO CHARACTER SET ${charset} COLLATE ${collation}`,
  );

  // INSERT IGNORE rather than REPLACE: if this is a second run, the first
  // snapshot is the one taken before anybody started changing things.
  const written = await prisma.$executeRawUnsafe(
    `INSERT IGNORE INTO _posting_snapshot (userId, staffId, territoryId)
       SELECT id, staffId, territoryId FROM \`User\` WHERE territoryId IS NOT NULL`,
  );

  const [{ total }] = await prisma.$queryRawUnsafe(
    `SELECT COUNT(*) AS total FROM _posting_snapshot`,
  );

  console.log(`${written} row(s) written; ${total} officer posting(s) held in _posting_snapshot.`);
  console.log("Safe to run `npx prisma db push` now.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
