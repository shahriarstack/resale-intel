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
