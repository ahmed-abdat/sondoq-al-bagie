import type { FullConfig } from "@playwright/test";

/**
 * The specs expect the fictional fixtures (names, pending payments, the demo committee). Fail
 * fast, with the fix, when the server under test is a normal build.
 */
export default async function globalSetup(config: FullConfig) {
  const base = config.projects[0].use.baseURL!;
  const html = await (await fetch(base)).text();
  if (!html.includes('class="bq-demo"')) {
    throw new Error(
      `e2e needs a fixtures build at ${base} (no fixtures banner found). Run:\n` +
        "  SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 PORT=3410 pnpm test:e2e\n" +
        "and stop any other server on that port first.",
    );
  }
}
