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
