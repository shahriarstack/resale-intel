import { prisma } from "@/lib/prisma";

/**
 * Turn a chosen brand/model pair of ids into the names that get STORED.
 *
 * Lifted out of the capture route once a second and third intake — capture
 * requests and off-road cases — needed the same resolution. It was never a
 * detail of capturing a vehicle; it is the rule that makes the master list
 * enforced rather than merely offered, and three copies of it would have been
 * three chances for one of them to trust the client.
 *
 * The model is verified to belong to the brand, so a crafted request cannot
 * pair "Tata" with a Foton model. Inactive entries are refused by name, which
 * is the only error message that tells the user what to do about it.
 *
 * Returns nulls when nothing was chosen: brand and model are required on the
 * capture form but optional on a capture request, and the caller's schema is
 * what decides that — not this.
 */
export async function resolveBrandModel(
  brandId: string | undefined | null,
  modelId: string | undefined | null,
): Promise<{ make: string | null; model: string | null } | { error: string }> {
  if (!brandId) return { make: null, model: null };

  const brand = await prisma.brand.findUnique({
    where: { id: brandId },
    select: { name: true, isActive: true },
  });
  if (!brand) return { error: "That brand no longer exists" };
  if (!brand.isActive) return { error: `${brand.name} is no longer available` };

  if (!modelId) return { make: brand.name, model: null };

  const model = await prisma.vehicleModel.findUnique({
    where: { id: modelId },
    select: { name: true, brandId: true, isActive: true },
  });
  if (!model || model.brandId !== brandId) {
    return { error: "That model does not belong to the chosen brand" };
  }
  if (!model.isActive) return { error: `${model.name} is no longer available` };

  return { make: brand.name, model: model.name };
}

/** Blank strings are how an HTML form says "nothing"; the database says null. */
export function emptyToNull(v: string | undefined | null): string | null {
  if (v === undefined || v === null) return null;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Turn typed territory names into territory rows, creating what is new.
 *
 * THE TERRITORY LIST IS NOT A THING ANYBODY MAINTAINS SEPARATELY. It is
 * whatever the field force is posted to. An administrator adding an ARO types
 * the patch that officer works; if it is the first officer there, the patch
 * comes into existence at that moment. Nobody visits a second screen first,
 * and there is no list that can drift from the roster it describes.
 *
 * This deliberately does NOT remove the Territory table, which would be the
 * obvious reading of "no need for territories in master data". Four things
 * hold a territory id and none of them could be rebuilt from text scattered
 * across user rows:
 *
 *   coverage       a territory with NO officer is the single most important
 *                  row on that board. Derive the list from postings and an
 *                  unstaffed patch becomes unrepresentable — exactly the
 *                  condition the board exists to show
 *   part A / B     lives on the territory, and drives the Recovery Manager's
 *                  filter across the whole dashboard
 *   portals        scope by territory; a lens over "Chittagong" has to mean a
 *                  row, not a spelling
 *   captures       `territoryDenied` compares an officer's postings to the
 *                  vehicle's territory. Free text would make that a string
 *                  comparison, and "CTG-North" vs "CTG North" would silently
 *                  become two patches
 *
 * So the row stays and the SCREEN goes: territories are born from the users
 * console, and master data keeps them only to set Part A/B and retire the ones
 * nobody works any more.
 *
 * Matching is by name and case-insensitive, because the column's collation is
 * utf8mb4_unicode_ci — "Dhaka South" and "dhaka south" are already the same
 * row to the database, and the API must agree with that rather than create a
 * duplicate the unique index would then refuse.
 */
export async function resolveTerritoryNames(
  names: string[],
): Promise<{ ids: string[]; idByName: Map<string, string> } | { error: string }> {
  const wanted = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (wanted.length === 0) return { ids: [], idByName: new Map() };

  for (const n of wanted) {
    if (n.length > 80) return { error: `Territory name is too long: ${n.slice(0, 40)}…` };
  }

  const existing = await prisma.territory.findMany({
    where: { name: { in: wanted } },
    select: { id: true, name: true },
  });

  // Keyed lower-case so the lookup folds case the same way the column does.
  const idByName = new Map<string, string>();
  for (const t of existing) idByName.set(t.name.toLowerCase(), t.id);

  for (const name of wanted) {
    if (idByName.has(name.toLowerCase())) continue;
    try {
      const made = await prisma.territory.create({
        data: { name },
        select: { id: true, name: true },
      });
      idByName.set(made.name.toLowerCase(), made.id);
    } catch {
      // Two administrators adding officers to the same new patch at once. The
      // unique index refused the second create, which means the row now exists
      // — so read it rather than failing a user creation over a race.
      const found = await prisma.territory.findFirst({
        where: { name },
        select: { id: true },
      });
      if (!found) return { error: `Could not create territory "${name}"` };
      idByName.set(name.toLowerCase(), found.id);
    }
  }

  return {
    ids: wanted.map((n) => idByName.get(n.toLowerCase())!).filter(Boolean),
    idByName,
  };
}
