import { expect, test, type Page } from "@playwright/test";

// Every public page is saved for offline after the first visit, not only the visited ones
// (src/lib/offline/warm.ts). Needs a fixtures production build (the worker is off in dev).
// Fixture balance: 294 000 (never in a saved page: money privacy).
const BALANCE = /294[\s  ]?000/;
const OTHERS = ["/members", "/accounts", "/donations", "/report"];

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller)
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
  });
}

/** The round is done when it wrote down its time (the real signal, not a delay). */
async function waitForWarm(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(async () => !!(await (await caches.open("warm-meta")).match("/__warmed-at"))),
      { timeout: 15_000 },
    )
    .toBe(true);
}

const savedPaths = (page: Page) =>
  page.evaluate(async () =>
    (await (await caches.open("pages-v2")).keys()).map((r) => new URL(r.url).pathname).sort(),
  );

test("only the home visited: members, accounts, donations and the report open offline", async ({
  page,
  context,
}) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await waitForWarm(page);
  await context.setOffline(true);
  for (const path of OTHERS) {
    await page.goto(path);
    await expect(page.getByText("لا يوجد اتصال بالإنترنت"), path).toHaveCount(0);
    await expect(page.getByText(/غير متصل/).first(), path).toBeVisible();
  }
  // and by a tap on the app's own links
  await page.goto("/");
  await page.locator('a[href="/accounts"]:visible').first().click();
  await page.waitForURL("**/accounts");
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1, name: "الحسابات" })).toBeVisible();
  await context.setOffline(false);
});

test("a stranger's saved pages hold no amount", async ({ page }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await waitForWarm(page);
  const bodies = await page.evaluate(async () => {
    const c = await caches.open("pages-v2");
    return Promise.all(
      (await c.keys()).map(async (k) => [k.url, (await (await c.match(k))?.text()) ?? ""]),
    );
  });
  expect(bodies.map(([u]) => new URL(u).pathname).sort()).toEqual(["/", ...OTHERS].sort());
  for (const [url, body] of bodies) expect(body, url).not.toMatch(BALANCE);
});

test("Save-Data: only the home and the members list are saved", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true, effectiveType: "4g", addEventListener() {} },
    }),
  );
  await page.goto("/");
  await waitForServiceWorker(page);
  await waitForWarm(page);
  expect(await savedPaths(page)).toEqual(["/", "/members"]);
});

test("back online: the saved pages are refreshed", async ({ page, context }) => {
  await page.goto("/");
  await waitForServiceWorker(page);
  await waitForWarm(page);
  // an old phone's gap: the report's saved copy is gone
  await page.evaluate(async () => (await caches.open("pages-v2")).delete("/report"));
  expect(await savedPaths(page)).not.toContain("/report");
  await context.setOffline(true);
  await context.setOffline(false); // the connection comes back
  await expect.poll(() => savedPaths(page), { timeout: 15_000 }).toContain("/report");
});
