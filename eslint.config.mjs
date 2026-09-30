import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  // Import boundaries (docs/ARCHITECTURE-AUDIT.md, plan 7): server actions only through the demo
  // seam (act.tsx), fixtures only through source.ts, the secret-key client only on the server.
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/**", "src/app/api/**", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/lib/data/actions"],
              message: "Committee actions go through useAct() in src/components/app/act.tsx.",
            },
            {
              group: ["@/components/app/fixtures", "./fixtures", "../fixtures"],
              message: "Fixtures are read only by src/components/app/source.ts.",
            },
            {
              group: ["@/lib/supabase/admin"],
              message: "The secret-key client is for src/lib/** and src/app/api/** only.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "src/components/app/act.tsx",
      "src/components/app/source.ts",
      "src/components/app/admin-demo.ts",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Other sessions' worktrees.
    ".claude/**",
    // Generated service worker.
    "public/sw.js",
    // OCR files copied from node_modules (scripts/ocr-assets.mts).
    "public/ocr/**",
    "public/swe-worker-*.js",
    "playwright-report/**",
    "test-results/**",
    // Research scripts and design prototypes, not app code.
    "docs/**",
  ]),
]);

export default eslintConfig;
