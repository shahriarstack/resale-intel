import { PrismaClient } from "@prisma/client";
import { credentialHash, normaliseStaffId } from "../src/lib/credential";

/**
 * Point every account's stored credential at its own Staff ID.
 *
 * Needed once, when sign-in moved from "Staff ID + a chosen password" to
 * "role + the Staff ID as the passcode": every row minted under the old rule
 * carries a hash of a password nobody will ever type again, and an account
 * whose hash does not match its Staff ID cannot sign in at all — the login
 * route checks the hash rather than trusting the lookup, deliberately.
 *
 * Safe to re-run. It is not an incremental migration with a version to track;
 * it simply asserts the rule over every row, which is the same work whether it
 * has been done before or not. Worth running again after any bulk change that
 * touched Staff IDs outside the admin console.
 *
 *   npm run db:credentials
 */
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany({
    orderBy: { staffId: "asc" },
    select: { id: true, staffId: true, name: true, isActive: true },
  });

  let changed = 0;
  for (const u of users) {
    const staffId = normaliseStaffId(u.staffId);
    await prisma.user.update({
      where: { id: u.id },
      data: {
        // Re-hashed rather than compared: bcrypt salts every hash, so there is
        // no cheap way to ask "is this already the hash of that string", and
        // writing it again costs one row.
        passwordHash: await credentialHash(staffId),
        // A Staff ID stored with stray whitespace would be untypeable as a
        // passcode. Normalising it here is the other half of the same fix.
        ...(staffId !== u.staffId ? { staffId } : {}),
      },
    });
    changed += 1;
    const flag = u.isActive ? "" : "  (inactive)";
    console.log(`  ${staffId.padEnd(14)} ${u.name}${flag}`);
  }

  console.log(`\n${changed} account${changed === 1 ? "" : "s"} now sign in with their Staff ID.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
