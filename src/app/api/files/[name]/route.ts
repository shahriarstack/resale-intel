import fs from "node:fs/promises";
import { fail } from "@/lib/api";
import { getSessionUser } from "@/lib/session";
import { resolveStoredPath, contentTypeForName } from "@/lib/storage";

export const runtime = "nodejs";

// Serve an uploaded image to authenticated users only. Capture and assessment
// photos are internal evidence, not public assets.
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
        "Cache-Control": "private, max-age=86400",
      },
    });
  } catch {
    return fail("Not found", 404);
  }
}
