"use client";

// Thin client wrapper over the API envelope. Throws Error(message) on failure
// so callers can try/catch and surface a clean message.

interface Envelope<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function parse<T>(res: Response): Promise<T> {
  let body: Envelope<T> | null = null;
  try {
    body = (await res.json()) as Envelope<T>;
  } catch {
    /* non-JSON response */
  }
  if (!res.ok || !body?.success) {
    throw new Error(body?.error || `Request failed (${res.status})`);
  }
  return body.data as T;
}

export async function getJSON<T>(url: string): Promise<T> {
  return parse<T>(await fetch(url, { cache: "no-store" }));
}

export async function sendJSON<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse<T>(res);
}

export async function uploadImage(file: File): Promise<{ name: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: form });
  return parse<{ name: string; url: string }>(res);
}

/** Same endpoint, widened to accept a PDF. For the repair estimate sheet. */
export async function uploadDocument(file: File): Promise<{ name: string; url: string }> {
  const form = new FormData();
  form.append("file", file);
  form.append("kind", "document");
  const res = await fetch("/api/upload", { method: "POST", body: form });
  return parse<{ name: string; url: string }>(res);
}
