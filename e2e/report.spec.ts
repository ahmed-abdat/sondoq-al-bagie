import { expect, test, type Page } from "@playwright/test";

// /report: the fund's printable report. Needs a production build (the SW is off in dev); the
// share tests read fictional data: SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 pnpm start.

type Win = { __opened: string[]; __printed: number; __shared: SharedFile[] };
type SharedFile = { name: string; type: string; size: number; w: number; h: number };

const heading = (page: Page) => page.getByRole("heading", { level: 1, name: /تقرير صندوق/ });

async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) =>
        navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), {
          once: true,
        }),
      );
    }
  });
}

test("opens, and opens offline after a visit", async ({ page, context }) => {
  await page.goto("/report");
  await expect(heading(page)).toBeVisible();
  await waitForServiceWorker(page);
  await page.reload(); // now through the SW, so it is stored
  await expect(heading(page)).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(heading(page)).toBeVisible();
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toHaveCount(0);
  await context.setOffline(false);
});

test("«حفظ PDF» opens the print dialog", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__printed = 0;
    window.print = () => void w.__printed++;
  });
  await page.goto("/report");
  await page.getByRole("button", { name: "حفظ PDF" }).click();
  expect(await page.evaluate(() => (window as unknown as Win).__printed)).toBe(1);
});

test("summary image falls back to WhatsApp text with the /report link", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    const w = window as unknown as Win;
    w.__opened = [];
    window.open = ((url: string) => {
      w.__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });
  await page.goto("/report");
  await page.getByRole("button", { name: "صورة الملخص" }).click();

  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__opened)).toHaveLength(1);
  const [url] = await page.evaluate(() => (window as unknown as Win).__opened);
  expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  const text = decodeURIComponent(url.split("text=")[1]);
  expect(text).toContain("ملخص صندوق الشباب");
  expect(text).toMatch(/في الصندوق الآن: .+ أوقية/);
  expect(text).toMatch(/\d+ من \d+ دفعوا رسوم \S+/);
  expect(text).toContain(`التفاصيل: ${new URL("/report", page.url()).href}`);
});

test("«مشاركة في واتساب» links to wa.me with the report text", async ({ page }) => {
  await page.goto("/report");
  const link = page.getByRole("link", { name: "مشاركة في واتساب" });
  await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/\?text=/, { timeout: 3000 });
  const text = decodeURIComponent((await link.getAttribute("href"))!.split("text=")[1]);
  expect(text).toContain(`التفاصيل: ${new URL("/report", page.url()).href}`);
});

test("summary image goes to the share sheet as a 1080×1350 PNG", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__shared = [];
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d: ShareData) => {
        for (const f of d.files ?? []) {
          const img = await createImageBitmap(f);
          w.__shared.push({
            name: f.name,
            type: f.type,
            size: f.size,
            w: img.width,
            h: img.height,
          });
        }
      },
    });
  });
  await page.goto("/report");
  await page.getByRole("button", { name: "صورة الملخص" }).click();

  await expect.poll(() => page.evaluate(() => (window as unknown as Win).__shared)).toHaveLength(1);
  const [file] = await page.evaluate(() => (window as unknown as Win).__shared);
  expect(file).toMatchObject({ type: "image/png", w: 1080, h: 1350 });
  expect(file.name).toMatch(/^ملخص-صندوق-الشباب-\d{4}-\d{2}\.png$/);
  expect(file.size).toBeGreaterThan(30_000);
});
