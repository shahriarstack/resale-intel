import path from "node:path";
import fs from "node:fs/promises";

// Uploads live OUTSIDE the deployment directory so a release never destroys
// captured evidence. Configure UPLOAD_DIR in production to a persistent path
// (e.g. /home/<acct>/resale-uploads). In dev it defaults to ./uploads.
export function getUploadDir(): string {
  return process.env.UPLOAD_DIR
    ? path.resolve(process.env.UPLOAD_DIR)
    : path.join(process.cwd(), "uploads");
}

export const ALLOWED_IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * What a DOCUMENT upload may be.
 *
 * A repair estimate arrives as whatever the workshop produced: a photograph of
 * a written sheet, or a PDF from whoever quoted it. Both are the same evidence
 * and refusing one of them just means it gets photographed off a screen.
 *
 * Deliberately a separate set from the image types. Photo slots — capture
 * angles, handover shots — must stay images-only: they are rendered in
 * galleries and a PDF in a carousel is a broken tile.
 */
export const ALLOWED_DOC_TYPES: Record<string, string> = {
  ...ALLOWED_IMAGE_TYPES,
  "application/pdf": "pdf",
};

// `isPdfName` / `isPdfUrl` deliberately live in lib/photos.ts, not here. They
// are pure string checks that client components need, and this module imports
// node:fs — importing it from a "use client" file drags the Node filesystem
// into the browser bundle and the build falls over.

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

/** A stored filename is a uuid + known extension. Reject anything else so the
 *  file-serving route can never be talked into path traversal. */
const SAFE_NAME = /^[a-f0-9-]{36}\.(jpg|png|webp|pdf)$/;

export function isSafeStoredName(name: string): boolean {
  return SAFE_NAME.test(name);
}

export async function ensureUploadDir(): Promise<string> {
  const dir = getUploadDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/** Resolve a stored name to an absolute path, guarding against traversal. */
export function resolveStoredPath(name: string): string | null {
  if (!isSafeStoredName(name)) return null;
  const dir = getUploadDir();
  const full = path.join(dir, name);
  // Belt and braces: ensure the resolved path is still inside the dir.
  if (!full.startsWith(dir + path.sep) && full !== path.join(dir, name)) return null;
  return full;
}

export function contentTypeForName(name: string): string {
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".pdf")) return "application/pdf";
  return "image/jpeg";
}
