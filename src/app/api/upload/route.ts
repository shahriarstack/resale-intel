import { randomUUID } from "node:crypto";
import path from "node:path";
import fs from "node:fs/promises";
import { ok, fail, withGuard } from "@/lib/api";
import { requireUser } from "@/lib/session";
import {
  ensureUploadDir,
  ALLOWED_IMAGE_TYPES,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage";

export const runtime = "nodejs";

// Authenticated image upload. Type and size validated; extension derived from
// the sniffed MIME, never the client filename. Returns a stored name; the file
// is served back through /api/files/[name].
export const POST = withGuard(async (request: Request) => {
  await requireUser();

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return fail("No file provided", 400);

  const ext = ALLOWED_IMAGE_TYPES[file.type];
  if (!ext) return fail("Only JPEG, PNG or WebP images are allowed", 415);
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
