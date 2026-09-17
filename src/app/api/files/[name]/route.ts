import fs from "node:fs/promises";
import { fail } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { resolveStoredPath, contentTypeForName } from "@/lib/storage";

export const runtime = "nodejs";

// Serve an uploaded image to authenticated users only. Capture and assessment
// photos are internal evidence, not public assets.
//
// The Content-Type is derived from the stored extension, which was chosen from
// an allowlist against a MIME the *client* declared at upload — so it is a
// claim about the bytes, not a reading of them. `nosniff` is what closes the
// gap: without it a browser may disregard the declared type, sniff the body,
// and render an HTML payload stored as .jpg as a document on this origin.
// With it the same file is simply a broken image.
//
// Deliberately still served inline. A PDF estimate sheet is opened in a new
// tab and read; forcing it to download would trade a risk `nosniff` has
// already removed for a worse way to do the job.
export async function GET(
  _request: Request,
  context: { params: Promise<{ name: string }> },
) {
  const user = await getSessionUser();
  if (!user) return fail("Sign in required", 401);

  // A PORTAL VIEWER IS NOT STAFF.
  //
  // Every other role here is somebody employed to move vehicles through the
  // eight desks, and the product lets all of them read any vehicle record —
  // that is deliberate and documented in api/vehicles/[id], where what gets
  // withheld is the cost basis, not the file. Serving an evidence photograph
  // to a desk is consistent with that.
  //
  // A portal member is an outsider on a named lens: a board observer, an
  // auditor, a finance reader. The Portal model promises they "sign in to
  // exactly that and nothing else", and the transition table already makes
  // that true for actions — PORTAL_VIEWER appears in no row, so they can move
  // nothing. It was NOT true for reads. This route authenticated and then
  // served, so a portal member holding any filename got the bytes.
  //
  // Nothing is lost by refusing. The widest photograph grant a portal can
  // carry is `showPhotos`, and even switched on it yields a COUNT — see
  // portalDesk.ts, `photoCount: grant.showPhotos ? v._count.photos : null`,
  // and the lens's own `redactedAs: "Photo counts only"`. No portal surface
  // has ever linked to this route, so no portal screen can break.
  //
  // 404 rather than 403, matching the response for a name that does not
  // resolve: a refusal that distinguishes "exists but forbidden" from "no such
  // file" hands an enumerator the one bit they were missing.
  if (user.role === "PORTAL_VIEWER") return fail("Not found", 404);

  const { name } = await context.params;
  const full = resolveStoredPath(name);
  if (!full) return fail("Not found", 404);

  try {
    const data = await fs.readFile(/*turbopackIgnore: true*/ full);
    return new Response(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": contentTypeForName(name),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return fail("Not found", 404);
  }
}
