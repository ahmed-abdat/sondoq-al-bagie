import { defineConfig, devices } from "@playwright/test";
import { e2eEnv } from "./supabase/tests/e2e/helpers";

// Two-person flows against a LOCAL Supabase (Docker), real data layer, never fixtures and never
// the production project. Run with `pnpm test:flows` (scripts/e2e-flows.sh): starts and resets the
// local stack, builds the app with its env, then runs this config. Port 3420 (Lane B).
// baseURL must be localhost (not 127.0.0.1): the app's redirects use localhost, so cookies set
// on 127.0.0.1 would be lost (supabase/tests/e2e/README.md).
const PORT = 3420;

export default defineConfig({
  testDir: "./e2e/flows",
  globalSetup: "./e2e/flows/global-setup.ts",
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ar",
    timezoneId: "Africa/Nouakchott",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "flows",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    // the local stack's env wins over .env.local; SONDOQ_FIXTURES stays unset (checked)
    env: { ...e2eEnv(), SONDOQ_FIXTURES: "" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
