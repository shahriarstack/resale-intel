/**
 * Make `DATABASE_URL` available to a bare `node` process.
 *
 * The app gets its environment from Next, which reads `.env` for it. These
 * scripts do not: `@prisma/client` reads `process.env.DATABASE_URL` and loads
 * nothing itself, so run from a cPanel shell — where the Node app's variables
 * belong to Passenger and not to your login session — they would connect to
 * undefined and fail with an error that does not say why.
 *
 * So: use the real environment if it has one, otherwise read `.env` out of the
 * application directory. Hand-rolled rather than pulling in dotenv, because
 * these scripts are meant to run against a release that contains only what the
 * app itself needs.
 */
import fs from "node:fs";
import path from "node:path";

export function loadEnv() {
  if (process.env.DATABASE_URL) return "environment";

  // The release root, whether this is run from there or from deploy/.
  const candidates = [
    path.join(process.cwd(), ".env"),
    path.join(process.cwd(), "..", ".env"),
  ];

  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip one layer of matching quotes — a MySQL password with a ')' in it
      // has to be quoted in the file and must not arrive with the quotes on.
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) process.env[key] = value;
    }
    if (process.env.DATABASE_URL) return file;
  }

  console.error("No DATABASE_URL, and no .env found beside the application.");
  console.error("Run this from the application directory, or export DATABASE_URL first.");
  process.exit(1);
}
