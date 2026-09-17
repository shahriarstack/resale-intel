import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",

    // The cPanel/Passenger entrypoint. It is loaded by the host's Node
    // runtime rather than bundled, so it has to stay CommonJS — linting it
    // under the TypeScript rules only ever reports that it is what it must
    // be (`@typescript-eslint/no-require-imports`, three times).
    "server.js",
  ]),
]);

export default eslintConfig;
