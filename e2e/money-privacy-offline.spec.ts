import { expect, test, type Page } from "@playwright/test";

// Money privacy on the phone (docs/MONEY-PRIVACY.md, Lane B): after browsing, no amount is kept in
// the service worker's caches or the persisted query cache, for a stranger, a member with their
// link or the committee (their figures come per request and live only in memory). A stranger's
// in-app navigation (RSC payloads) carries no amount either. Needs a fixtures production build.
// Fixture balance: 294 000.
const BALANCE = /294[\s  ]?000/;
const PAGES = ["/members", "/accounts", "/donations"];

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

/** Browse the public pages by in-app links (RSC), as a person would, then open /report. */
async function browse(page: Page) {
  await page.goto("/");
  await waitForServiceWorker(page);
  for (const path of PAGES) {
    await page.locator(`a[href="${path}"]:visible`).first().click();
    await page.waitForURL(`**${path}`);
    await expect
      .poll(() =>
        page.evaluate(async (p) => !!(await (await caches.open("pages-v2")).match(p)), path),
      )
      .toBe(true);
  }
  await page.goto("/report");
  await page.goto("/");
  // the persister writes every 2 s at most: wait for the saved copy
  await expect
    .poll(async () => (await stored(page)).persisted, { timeout: 8000 })
    .toContain("fund_stats");
}

/** Every cached response body and the persisted query cache, as text. */
async function stored(page: Page): Promise<{ caches: [string, string][]; persisted: string }> {
  return page.evaluate(async () => {
    const out: [string, string][] = [];
    for (const name of await caches.keys()) {
      const c = await caches.open(name);
      for (const req of await c.keys()) {
        const res = await c.match(req);
        const type = res?.headers.get("content-type") ?? "";
        if (res && /text|json|x-component/.test(type)) out.push([req.url, await res.text()]);
      }
    }
    const persisted = await new Promise<string>((resolve) => {
      const open = indexedDB.open("keyval-store");
      open.onerror = () => resolve("");
      open.onsuccess = () => {
        const db = open.result;
        if (!db.objectStoreNames.contains("keyval")) return resolve("");
        const get = db.transaction("keyval").objectStore("keyval").get("sondoq-query-cache");
        get.onsuccess = () => resolve(String(get.result ?? ""));
        get.onerror = () => resolve("");
      };
    });
    return { caches: out, persisted };
  });
}

async function expectNothingKept(page: Page) {
  const s = await stored(page);
  expect(s.caches.length, "the worker kept the visited pages").toBeGreaterThan(0);
  for (const [url, body] of s.caches) expect(body, url).not.toMatch(BALANCE);
  expect(s.persisted).not.toMatch(BALANCE);
  expect(s.persisted).not.toMatch(/"(?:balance|moneyIn|collectedThisYear)"/);
}

test("stranger: no amount in RSC payloads, the worker's caches or the saved query cache", async ({
  page,
}) => {
  const bodies: [string, string][] = [];
  page.on("response", async (r) => {
    const t = r.request().resourceType();
    if (t === "fetch" || t === "document" || t === "xhr")
      bodies.push([r.url(), await r.text().catch(() => "")]);
  });
  await browse(page);
  expect(
    bodies.some(([u]) => u.includes("_rsc")),
    "in-app navigation fetched RSC",
  ).toBe(true);
  for (const [url, body] of bodies) expect(body, url).not.toMatch(BALANCE);
  await expectNothingKept(page);
});

test("member (/m/demo): sees the figures, but none is kept on the phone", async ({ page }) => {
  await page.goto("/m/demo");
  await page.goto("/");
  await expect(page.locator(".bq-hero .bq-hero-n").first()).toContainText(BALANCE);
  await browse(page);
  await expectNothingKept(page);
});

test("committee (demo): sees the figures, but none is kept on the phone", async ({ page }) => {
  await page.goto("/committee");
  await expect(page.getByRole("heading", { name: "اللجنة", level: 1 })).toBeVisible();
  await page.goto("/report");
  await expect(page.locator(".rp-now")).toContainText(BALANCE);
  await browse(page);
  await expectNothingKept(page);
});
