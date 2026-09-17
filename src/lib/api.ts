import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { HttpError } from "./session";

// A uniform envelope for every API route.
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function fail(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

/** The 409 body for a desk move that lost the race. */
export const MOVED_ON =
  "This file has already been moved by someone else. Reload to see where it is now.";

/**
 * Assert that a status-guarded move actually moved something.
 *
 * Every desk action reads a vehicle, checks the transition table against the
 * status it read, and then writes. Between the read and the write another
 * request can move the same file — a double-clicked button is enough — and
 * without a guard both requests pass the check and both apply, leaving one
 * status change and two audit rows claiming to have made it.
 *
 * So the writes are `updateMany` with the authorised status in the `where`,
 * and this checks what they hit. `updateMany` is deliberate: it emits a single
 * `UPDATE ... WHERE id = ? AND status = ?` and reports the affected row count,
 * which is the whole answer. `update` was tried first and is not equivalent —
 * it resolves the row separately from the write, so concurrent callers inside
 * a transaction were each told they had succeeded, returning the status the
 * file had *before* their own write. Three simultaneous requests produced
 * three audit rows and one transition.
 *
 * A count of zero means the row is no longer in the state the caller was
 * authorised against. Thrown from inside the transaction, so the audit row
 * that would have described the move is rolled back with it.
 */
export function assertMoved(count: number, message: string = MOVED_ON): void {
  if (count === 0) throw new HttpError(409, message);
}

/**
 * Wrap an API handler so guard failures, validation errors and Prisma errors
 * become clean JSON instead of unhandled 500s. Handlers throw; this catches.
 */
export function withGuard<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>,
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      if (err instanceof HttpError) return fail(err.message, err.status);
      if (err instanceof ZodError) {
        const first = err.issues[0];
        const path = first?.path.join(".");
        return fail(path ? `${path}: ${first.message}` : first?.message ?? "Invalid input", 422);
      }
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === "P2002") {
          // meta.target is a string[] on some connectors and a string on MySQL.
          const raw = err.meta?.target;
          const target = Array.isArray(raw) ? raw.join(", ") : typeof raw === "string" ? raw : "";
          return fail(`Already exists${target ? `: ${target}` : ""}`, 409);
        }
        if (err.code === "P2025") return fail("Record not found", 404);
      }
      console.error("[api] unhandled error:", err);
      return fail("Something went wrong. Please try again.", 500);
    }
  };
}
