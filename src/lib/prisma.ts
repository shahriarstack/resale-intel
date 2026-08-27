import { PrismaClient } from "@prisma/client";

// A single client across the process. In dev, Next.js hot-reload re-evaluates
// modules; caching on globalThis stops a new pool being opened on every reload
// and exhausting the (shared cPanel) MySQL connection limit.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
