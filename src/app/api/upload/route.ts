import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  ensureUploadDir,
  ALLOWED_IMAGE_TYPES,
  ALLOWED_DOC_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

export const runtime = "nodejs";

// Authenticated upload. Type and size validated; the stored name is a fresh
// uuid plus an extension taken from an allowlist, never from the client
// filename. Returns that name; the file is served back through
// /api/files/[name].
//
// `file.type` is the browser's declared Content-Type for the form part, not a
// sniff of the bytes — a caller can set it to anything. The allowlist is what
// makes that safe to use: it can only ever select one of four extensions we
// chose, so the worst a lie achieves is a file stored under the wrong one of
// them. The serving route pairs this with `nosniff`, so a mislabelled body is
// never re-interpreted as something executable on the way back out.
//
// `kind=document` widens the accepted set to include PDF — used by the repair
// estimate sheet. Everything else stays images-only, because photo slots are
// rendered in galleries and a PDF in a carousel is a broken tile.
export const POST = withGuard(async (request: Request) => {
  await requireUser();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("No file provided", 400);

  const asDocument = form.get("kind") === "document";
  const allowed = asDocument ? ALLOWED_DOC_TYPES : ALLOWED_IMAGE_TYPES;
  const ext = allowed[file.type];
  if (!ext) {
    return fail(
      asDocument
        ? "Upload a PDF, or a JPEG, PNG or WebP image"
        : "Only JPEG, PNG or WebP images are allowed",
      415,
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) return fail("Image exceeds the 8 MB limit", 413);
  if (file.size === 0) return fail("Image is empty", 400);

  const dir = await ensureUploadDir();
  const name = `${randomUUID()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  // Uploads live outside the project; opt this write out of build tracing so
  // Turbopack doesn't bundle the whole source tree into the server output.
  await fs.writeFile(path.join(/*turbopackIgnore: true*/ dir, name), buffer);

  return ok({ name, url: `/api/files/${name}` }, 201);
});
