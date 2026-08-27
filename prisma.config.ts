import path from "node:path";
import { defineConfig } from "prisma/config";

// Prisma's config file disables automatic .env loading, so load it ourselves
// for CLI commands (db push / migrate / seed). Node 20.12+ / 24 has this built
// in — no dotenv dependency needed.
try {
  process.loadEnvFile(path.join(process.cwd(), ".env"));
} catch {
  // .env may be absent in CI where vars are set another way; ignore.
}

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
