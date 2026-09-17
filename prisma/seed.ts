import { PrismaClient, type LocationType, type RecoveryPart, type Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Demo roster — one account per role so the whole chain can be walked in dev.
// Passwords are hashed; the plaintext here is for first sign-in only and should
// be changed. Super Admin is the only account that must exist in production.
const DEMO_PASSWORD = "12345";

const users: { staffId: string; name: string; designation: string; role: Role; territory?: string }[] = [
  { staffId: "ADMIN-01", name: "System Administrator", designation: "—", role: "SUPER_ADMIN" },
  { staffId: "ARO-01", name: "Rakib Hasan", designation: "Sr. ARO", role: "RECOVERY_TEAM", territory: "Dhaka North" },
  // A desk account rather than a person: recovery approvals are signed by the
  // role, not by whoever is sitting at it this quarter.
  { staffId: "DM-01", name: "Recovery Manager", designation: "Recovery Manager", role: "RECOVERY_MANAGER" },
  { staffId: "SE-01", name: "Tanvir Ahmed", designation: "Sr. SE", role: "SERVICE_ENGINEER" },
  { staffId: "SH-01", name: "Mohammad Elias", designation: "Service Manager", role: "SERVICE_HEAD" },
  { staffId: "LO-01", name: "Sabbir Rahman", designation: "Sr. LO", role: "REGISTRATION_TEAM" },
  { staffId: "EX-01", name: "Md. Tarin", designation: "Sr. Ex", role: "SR_EXECUTIVE" },
  { staffId: "AGM-01", name: "Ibnul Arabi", designation: "DGM", role: "AGM_DGM" },
  { staffId: "GM-01", name: "Arifur Rahman", designation: "BM", role: "GM_SR_GM" },
  { staffId: "MO-01", name: "Jubayer Alam", designation: "Sr. MO", role: "SALES_TEAM" },
];

// Territories, split across the two recovery parts. An ARO is dedicated to one
// territory, so this list is also the shape of the field roster.
const territories: { name: string; part: RecoveryPart }[] = [
  { name: "Dhaka North", part: "A" },
  { name: "Dhaka South", part: "A" },
  { name: "Chittagong", part: "A" },
  { name: "Sylhet", part: "B" },
  { name: "Rajshahi", part: "B" },
  { name: "Khulna", part: "B" },
];

const locations: { name: string; type: LocationType }[] = [
  { name: "Mirpur Yard", type: "YARD" },
  { name: "Tejgaon Depot", type: "DEPOT" },
  { name: "Halishahar Yard", type: "YARD" },
  { name: "Sylhet Depot", type: "DEPOT" },
  { name: "Tejgaon Showroom", type: "SHOWROOM" },
  // Not a place we own. Selected when the vehicle has not been moved to a
  // yard and is still sitting with the customer.
  { name: "With customer", type: "CUSTOMER" },
];

// Brands and the models under each. This is the pick list the capture form
// offers; an admin maintains it from Master data.
//
// One brand, because ACI Motors sells one: Foton. The list used to carry Tata,
// Ashok Leyland, Eicher and Mahindra as well, which put four makes on the
// capture form that this company does not finance and therefore never
// repossesses — every one of them a way for an officer to file a vehicle that
// cannot be reconciled against the book.
//
// The models are the load classes rather than trim names, which is how the
// fleet is actually spoken about in the yard: what a unit can carry is the
// thing that decides its price, its buyer and its repair bill.
const brands: { name: string; models: string[] }[] = [
  {
    name: "Foton",
    models: ["1 TON TM", "1.2 TON TM", "1.5 TON AUMARK E", "3 TON AUMARK E"],
  },
];

// The documentation checklist, in the order it is asked at the roadside: the
// three papers that prove the vehicle is legal, then insurance, then the case
// slip (a first-class field, slotted in at CASE_SLIP_ORDER by the form), then
// the keys — which is the last thing that changes hands.
const questions = [
  { key: "REG_CERT", label: "Registration Certificate available?", requiresNote: false, sortOrder: 1 },
  { key: "TAX_TOKEN", label: "Tax token present?", requiresNote: false, sortOrder: 2 },
  { key: "FITNESS", label: "Fitness certificate present?", requiresNote: false, sortOrder: 3 },
  { key: "INSURANCE", label: "Is insurance available?", requiresNote: false, sortOrder: 4 },
  // 5 is the case slip.
  { key: "KEYS", label: "Vehicle keys handed over?", requiresNote: true, sortOrder: 6 },
];

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  // Territories first — a user row may reference one.
  for (const t of territories) {
    await prisma.territory.upsert({
      where: { name: t.name },
      update: { part: t.part },
      create: { name: t.name, part: t.part },
    });
  }
  console.log(`✓ ${territories.length} territories`);

  for (const u of users) {
    const territoryId = u.territory
      ? (await prisma.territory.findUnique({ where: { name: u.territory }, select: { id: true } }))?.id
      : undefined;
    const person = await prisma.user.upsert({
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

    // The posting is a row now, not a column — see the TerritoryPosting model.
    // Upserted rather than created so re-seeding does not fail on the unique
    // pair, and so an officer who has since picked up a cover keeps it.
    if (territoryId) {
      await prisma.territoryPosting.upsert({
        where: { userId_territoryId: { userId: person.id, territoryId } },
        update: { kind: "BASE" },
        create: { userId: person.id, territoryId, kind: "BASE" },
      });
    }
  }
  console.log(`✓ ${users.length} users`);

  for (const loc of locations) {
    await prisma.location.upsert({
      where: { name: loc.name },
      update: { type: loc.type },
      create: loc,
    });
  }
  console.log(`✓ ${locations.length} locations`);

  let modelCount = 0;
  for (const [i, b] of brands.entries()) {
    const brand = await prisma.brand.upsert({
      where: { name: b.name },
      update: { sortOrder: i },
      create: { name: b.name, sortOrder: i },
    });
    for (const [j, name] of b.models.entries()) {
      await prisma.vehicleModel.upsert({
        // Unique on the pair, so re-seeding never duplicates a model and
        // never collides with the same name under a different brand.
        where: { brandId_name: { brandId: brand.id, name } },
        update: { sortOrder: j },
        create: { brandId: brand.id, name, sortOrder: j },
      });
      modelCount++;
    }
    // Models this brand no longer offers. Deleted rather than deactivated:
    // an inactive model is one an admin can switch back on, and these are not
    // trims that were withdrawn — they are names that should never have been
    // on the list.
    await prisma.vehicleModel.deleteMany({
      where: { brandId: brand.id, name: { notIn: b.models } },
    });
  }
  // The list above is the whole pick list, not a set of additions to it.
  // Without this, re-seeding after a brand is dropped leaves the old one in
  // the database and on the capture form for ever — which is exactly how the
  // form ended up offering four makes this company does not sell. Models go
  // with the brand by cascade.
  const dropped = await prisma.brand.deleteMany({
    where: { name: { notIn: brands.map((b) => b.name) } },
  });
  console.log(
    `✓ ${brands.length} brand${brands.length === 1 ? "" : "s"} · ${modelCount} models` +
      (dropped.count ? ` · ${dropped.count} obsolete brand(s) removed` : ""),
  );

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
