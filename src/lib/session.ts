import { getServerSession } from "next-auth";
import type { Role } from "@prisma/client";
import { authOptions } from "./auth";

export interface SessionUser {
  id: string;
  name: string;
  role: Role;
  staffId: string;
  territoryId: string | null;
}

/** The current user, or null. Use in pages/layouts that handle redirects. */
export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  const u = session.user;
  return {
    id: u.id,
    name: u.name ?? "",
    role: u.role,
    staffId: u.staffId,
    territoryId: u.territoryId ?? null,
  };
}

/** Thrown by the API guards; caught by withGuard into a 401/403 JSON body. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Require an authenticated user in an API route, or throw 401. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) throw new HttpError(401, "Sign in required");
  return user;
}

/** Require one of the given roles in an API route, or throw 401/403. */
export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role === "SUPER_ADMIN") return user;
  if (!roles.includes(user.role)) {
    throw new HttpError(403, "You do not have access to this action");
  }
  return user;
}
