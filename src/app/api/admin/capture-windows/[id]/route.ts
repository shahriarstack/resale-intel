import { ok, fail, withGuard } from "@/lib/api";
import { requireRole } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { captureWindowCloseSchema } from "@/lib/validation";

/**
 * Revoke a window before its own expiry.
 *
 * A PATCH rather than a DELETE, and there is no DELETE at all: the window is
 * the authorisation for every vehicle that came through it, and deleting it
 * would leave those records pointing at nothing with no way to answer who let
 * them in. Shutting it is the only ending it gets.
 */
export const PATCH = withGuard(
  async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
    const user = await requireRole("SUPER_ADMIN");
    const { id } = await params;
    const data = captureWindowCloseSchema.parse(await request.json());

    const existing = await prisma.captureWindow.findUnique({
      where: { id },
      select: { id: true, closedAt: true },
    });
    if (!existing) return fail("That window no longer exists", 404);
    // Closing an already-closed window would overwrite who closed it and why,
    // which is the one thing on this record worth protecting.
    if (existing.closedAt) return fail("That window is already closed", 409);

    await prisma.captureWindow.update({
      where: { id },
      data: {
        closedAt: new Date(),
        closedById: user.id,
        closeNote: data.closeNote,
      },
    });

    return ok({ id });
  },
);
