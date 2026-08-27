import { PrismaClient, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Demo roster — one account per role so the whole chain can be walked in dev.
// Passwords are hashed; the plaintext here is for first sign-in only and should
// be changed. Super Admin is the only account that must exist in production.
const DEMO_PASSWORD = "changeme123";

const users: { staffId: string; name: string; designation: string; role: Role }[] = [
  { staffId: "ADMIN-01", name: "System Administrator", designation: "—", role: "SUPER_ADMIN" },
  { staffId: "ARO-01", name: "Rakib Hasan", designation: "Sr. ARO", role: "RECOVERY_TEAM" },
  { staffId: "DM-01", name: "Nasir Uddin", designation: "DM", role: "RECOVERY_MANAGER" },
  { staffId: "SE-01", name: "Tanvir Ahmed", designation: "Sr. SE", role: "SERVICE_ENGINEER" },
  { staffId: "SH-01", name: "Kamrul Islam", designation: "HQ", role: "SERVICE_HEAD" },
  { staffId: "LO-01", name: "Sabbir Rahman", designation: "Sr. LO", role: "REGISTRATION_TEAM" },
  { staffId: "EX-01", name: "Md. Tarin", designation: "Sr. Ex", role: "SR_EXECUTIVE" },
  { staffId: "AGM-01", name: "Farhana Akter", designation: "AGM", role: "AGM_DGM" },
  { staffId: "GM-01", name: "Iqbal Chowdhury", designation: "GM", role: "GM_SR_GM" },
  { staffId: "MO-01", name: "Jubayer Alam", designation: "Sr. MO", role: "SALES_TEAM" },
];

// Placeholder master data. The real Sales Territory and Location lists are
// "given in the attachment" (not yet supplied) — replace these when it arrives.
const territories = ["Dhaka North", "Dhaka South", "Chittagong", "Sylhet", "Rajshahi", "Khulna"];

const locations: { name: string; type: "YARD" | "DEPOT" | "SHOWROOM" }[] = [
  { name: "Mirpur Yard", type: "YARD" },
  { name: "Tejgaon Depot", type: "DEPOT" },
  { name: "Halishahar Yard", type: "YARD" },
  { name: "Sylhet Depot", type: "DEPOT" },
  { name: "Tejgaon Showroom", type: "SHOWROOM" },
];

const questions = [
  { key: "REG_CERT", label: "Registration Certificate available?", requiresNote: false, sortOrder: 1 },
  { key: "TAX_TOKEN", label: "Tax token present?", requiresNote: false, sortOrder: 2 },
  { key: "FITNESS", label: "Fitness certificate present?", requiresNote: false, sortOrder: 3 },
  { key: "KEYS", label: "Vehicle keys handed over?", requiresNote: true, sortOrder: 4 },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  for (const u of users) {
    await prisma.user.upsert({
      where: { staffId: u.staffId },
      update: { name: u.name, designation: u.designation, role: u.role },
      create: {
        staffId: u.staffId,
        name: u.name,
        designation: u.designation,
        role: u.role,
        passwordHash,
      },
    });
  }
  console.log(`✓ ${users.length} users`);

  for (const name of territories) {
    await prisma.territory.upsert({ where: { name }, update: {}, create: { name } });
  }
  console.log(`✓ ${territories.length} territories`);

  for (const loc of locations) {
    await prisma.location.upsert({
      where: { name: loc.name },
      update: { type: loc.type },
      create: loc,
    });
  }
  console.log(`✓ ${locations.length} locations`);

  for (const q of questions) {
    await prisma.documentQuestion.upsert({
      where: { key: q.key },
      update: { label: q.label, requiresNote: q.requiresNote, sortOrder: q.sortOrder },
      create: q,
    });
  }
  console.log(`✓ ${questions.length} document questions`);

  console.log(`\nSeed complete. Sign in with any Staff ID above · password: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
