import { credentialHash, normaliseStaffId } from "@/lib/credential";
import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { portalPairingError } from "@/lib/portals";
import { resolveTerritoryNames } from "@/lib/masterData";
import { partError, postingError } from "@/lib/postings";
import { userCreateSchema } from "@/lib/validation";

// Never returns passwordHash.
const publicSelect = {
  id: true,
  name: true,
  staffId: true,
  designation: true,
  role: true,
  isActive: true,
  // Every territory this person works, base first. Replaces the single
  // `territoryId`/`territory` pair — see the TerritoryPosting model.
  postings: {
    orderBy: { kind: "asc" },
    select: {
      kind: true,
      territoryId: true,
      territory: { select: { name: true, part: true } },
    },
  },
  salesTerritory: true,
  portalId: true,
  portal: { select: { id: true, name: true, accent: true, glyph: true, isActive: true } },
  createdAt: true,
} as const;

export const GET = withGuard(async () => {
  await requireRole("SUPER_ADMIN");
  const users = await prisma.user.findMany({
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    select: publicSelect,
  });
  return ok(users);
});

export const POST = withGuard(async (request: Request) => {
  await requireRole("SUPER_ADMIN");
  const data = userCreateSchema.parse(await request.json());

  const mismatch = portalPairingError(data.role, data.portalId);
  if (mismatch) return fail(mismatch, 422);

  // Typed patches become rows here, before anything is validated against
  // them. The territory list is whatever the field force is posted to — see
  // resolveTerritoryNames — so an administrator naming a patch no officer has
  // worked before brings it into existence by doing so.
  let territoryIds = data.territoryIds;
  let baseTerritoryId = data.baseTerritoryId;
  if (data.territoryNames) {
    const partMap = new Map(
      (data.territoryParts ?? []).map((t) => [t.name.toLowerCase(), t.part]),
    );
    const resolved = await resolveTerritoryNames(data.territoryNames, partMap);
  const missingPart = partError(
    data.role,
    data.territoryNames,
    partMap,
  );
  if (missingPart) return fail(missingPart, 422);
    if ("error" in resolved) return fail(resolved.error, 422);
    territoryIds = resolved.ids;
    const baseName = data.baseTerritoryName?.trim();
    baseTerritoryId = baseName
      ? (resolved.idByName.get(baseName.toLowerCase()) ?? null)
      : null;
  }

  const posting = postingError(data.role, territoryIds, baseTerritoryId);
  if (posting) return fail(posting, 422);

  // The Staff ID is the credential — see lib/credential.ts. Derived from the
  // Staff ID being stored rather than taken from the request, so the two are
  // written from one value and cannot disagree.
  const staffId = normaliseStaffId(data.staffId);
  const passwordHash = await credentialHash(staffId);

  const user = await prisma.user.create({
    data: {
      name: data.name,
      staffId,
      designation: data.designation?.trim() || null,
      role: data.role,
      salesTerritory: data.salesTerritory?.trim() || null,
      portalId: data.portalId,
      passwordHash,
      // The postings go in with the account, in one write. The base is the
      // patch they belong to; everything else they hold is cover.
      postings: {
        create: territoryIds.map((territoryId) => ({
          territoryId,
          kind: territoryId === baseTerritoryId ? ("BASE" as const) : ("COVER" as const),
        })),
      },
    },
    select: publicSelect,
  });
  return ok(user, 201);
});
