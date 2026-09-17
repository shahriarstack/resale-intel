import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { vehicleModelSchema } from "@/lib/validation";

// Add a model under a brand. There is no GET here — models are only ever read
// nested under their brand, via /api/admin/brands.
export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const data = vehicleModelSchema.parse(await request.json());

  // Checked explicitly so a bad brandId reads as "that brand is gone" rather
  // than surfacing as a raw foreign-key violation.
  const brand = await prisma.brand.findUnique({
    where: { id: data.brandId },
    select: { id: true },
  });
  if (!brand) return fail("That brand no longer exists", 404);

  const row = await prisma.vehicleModel.create({
    data: { brandId: data.brandId, name: data.name, sortOrder: data.sortOrder ?? 0 },
  });
  return ok(row, 201);
});
