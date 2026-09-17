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
