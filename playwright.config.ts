import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PORT ?? 3100);

// e2e runs against a production build with the fictional fixtures (member names, pending
// payments, the demo committee). Always:
//   SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 PORT=3410 pnpm test:e2e
// e2e/global-setup.ts stops the run early if the server is not serving fixtures.

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
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
      name: "mobile-390",
      use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 },
    },
  ],
  webServer: {
    command: `pnpm start -p ${PORT}`,
    env: { SONDOQ_FIXTURES: "1" },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
