/**
 * Point every account's stored credential at its own Staff ID.
 *
 * WITHOUT THIS, NOBODY CAN SIGN IN. Sign-in moved from "Staff ID + a chosen
 * password" to "role + the Staff ID as the passcode", and every account minted
 * under the old rule carries a hash of a password nobody will ever type again.
 * The login route checks the hash rather than trusting the lookup — on purpose
 * — so an account whose hash does not match its Staff ID is simply refused,
 * with the same message as a wrong passcode.
 *
 * The same rule as `src/lib/credential.ts`, repeated here in plain .mjs so it
 * runs on the server with no toolchain. Two details in it are load-bearing and
 * must not drift from that file:
 *
 *   TRIMMED    a Staff ID stored with stray whitespace is untypeable.
 *   UPPERCASED bcrypt is case-sensitive and the `staffId` column is
 *              `utf8mb4_unicode_ci`, so the database finds `DM-01` when
 *              somebody types `dm-01` and bcrypt then refuses it. Folding the
 *              case here makes the credential agree with the lookup in front
 *              of it.
 *
 * Safe to re-run: it asserts the rule over every row rather than tracking a
 * version. Worth running again after any bulk change that touched Staff IDs.
 *
 *   node deploy/03-align-credentials.mjs
 */
import { loadEnv } from "./env.mjs";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

loadEnv();
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { staffId: "asc" },
    select: { id: true, staffId: true, name: true, isActive: true },
  });

  let changed = 0;
  for (const u of users) {
    const staffId = u.staffId.trim();
    await prisma.user.update({
      where: { id: u.id },
      data: {
        // Re-hashed rather than compared: bcrypt salts every hash, so there is
        // no cheap way to ask "is this already the hash of that string", and
        // writing it again costs one row.
        passwordHash: await bcrypt.hash(staffId.toUpperCase(), 10),
        ...(staffId !== u.staffId ? { staffId } : {}),
      },
    });
    changed += 1;
    console.log(`  ${staffId.padEnd(14)} ${u.name}${u.isActive ? "" : "  (inactive)"}`);
  }

  console.log(`\n${changed} account${changed === 1 ? "" : "s"} now sign in with their Staff ID.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
