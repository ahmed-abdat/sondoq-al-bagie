import { expect, test, type Page, type Worker } from "@playwright/test";

// Web Push reaches the service worker and becomes an Arabic notification.
// Needs a production build (the SW is off in dev). Runs on full Chromium: the headless shell has
// no notification support.
test.use({ channel: "chromium", permissions: ["notifications"] });

async function worker(page: Page): Promise<Worker> {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  const ctx = page.context();
  return ctx.serviceWorkers()[0] ?? (await ctx.waitForEvent("serviceworker"));
}

/**
 * A push message as the browser hands it to the worker; waits for the handler's work
 * (event.waitUntil) and returns what is then on screen, read inside the worker.
 */
const push = (sw: Worker, data: string) =>
  sw.evaluate(async (data) => {
    const g = self as unknown as ServiceWorkerGlobalScope;
    const e = new PushEvent("push", { data });
    let work: Promise<unknown> = Promise.resolve();
    Object.defineProperty(e, "waitUntil", { value: (p: Promise<unknown>) => (work = p) });
    g.dispatchEvent(e);
    const err = await work.then(
      () => null,
      (x: unknown) => String(x),
    );
    if (err) throw new Error(`${err} (permission ${Notification.permission})`);
    // headless Chrome lists a notification only once it is on screen; asking earlier returns
    // an empty list from then on, so wait first
    await new Promise((r) => setTimeout(r, 800));
    const list = await g.registration.getNotifications();
    return list.map((n) => ({
      title: n.title,
      body: n.body,
      tag: n.tag,
      dir: n.dir,
      lang: n.lang,
      icon: new URL(n.icon).pathname,
      badge: new URL(n.badge).pathname,
      url: (n.data as { url: string }).url,
    }));
  }, data);

test("a push message shows the committee notification", async ({ page }) => {
  const sw = await worker(page);

  const shown = await push(
    sw,
    JSON.stringify({
      title: "دفعة تنتظر التأكيد",
      body: "محمد ولد أحمد: 1 500 أوقية",
      url: "/committee",
      tag: "pending-42",
    }),
  );
  expect(shown.find((n) => n.tag === "pending-42")).toEqual({
    title: "دفعة تنتظر التأكيد",
    body: "محمد ولد أحمد: 1 500 أوقية",
    tag: "pending-42",
    dir: "rtl",
    lang: "ar",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    url: "/committee",
  });
});

test("a link to another site is never followed", async ({ page }) => {
  const sw = await worker(page);
  const shown = await push(
    sw,
    JSON.stringify({ title: "x", url: "https://evil.example/", tag: "other" }),
  );
  expect(shown.find((n) => n.tag === "other")?.url).toBe("/committee");
});

test("the app icon shows the pending count sent with the push", async ({ page }) => {
  const sw = await worker(page);
  // record what the worker asks of the Badging API
  await sw.evaluate(() => {
    const g = self as unknown as { __badges: (number | "clear")[] };
    g.__badges = [];
    Object.defineProperty(self.navigator, "setAppBadge", {
      configurable: true,
      value: async (n?: number) => void g.__badges.push(n ?? 0),
    });
    Object.defineProperty(self.navigator, "clearAppBadge", {
      configurable: true,
      value: async () => void g.__badges.push("clear"),
    });
  });
  const badges = () =>
    sw.evaluate(() => (self as unknown as { __badges: (number | "clear")[] }).__badges);

  await push(sw, JSON.stringify({ title: "a", tag: "pending-1", badgeCount: 3 }));
  await push(sw, JSON.stringify({ title: "b", tag: "pending-2" })); // no count: unchanged
  await push(sw, JSON.stringify({ title: "c", tag: "done", badgeCount: 0 }));
  expect(await badges()).toEqual([3, "clear"]);
});

test("the notification badge is a small PNG", async ({ request }) => {
  const r = await request.get("/icons/badge-96.png");
  expect(r.headers()["content-type"]).toBe("image/png");
});
