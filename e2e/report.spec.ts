import { expect, test, type Page } from "@playwright/test";

// /report: the fund's report and its share sheet. Needs a production build (the SW is off in
// dev); fictional data: SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 pnpm start.

type SharedFile = { name: string; type: string; size: number; w: number; h: number; head: string };
type Win = { __opened: string[]; __printed: number; __shared: SharedFile[]; __text: string };

const heading = (page: Page) => page.getByRole("heading", { level: 1, name: /تقرير صندوق/ });
const win = <K extends keyof Win>(page: Page, k: K): Promise<Win[K]> =>
  page.evaluate((key) => (window as unknown as Win)[key], k) as Promise<Win[K]>;

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

/** A phone that shares files: record what reaches the share sheet. */
async function shareSheet(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__shared = [];
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d: ShareData) => {
        // publish the files in one go: a poll must never see a half-read share
        const out: SharedFile[] = [];
        for (const f of d.files ?? []) {
          const head = new TextDecoder().decode(await f.slice(0, 5).arrayBuffer());
          let size = { width: 0, height: 0 };
          if (f.type.startsWith("image/")) size = await createImageBitmap(f);
          out.push({
            name: f.name,
            type: f.type,
            size: f.size,
            w: size.width,
            h: size.height,
            head,
          });
        }
        w.__text = d.text ?? "";
        w.__shared = out;
      },
    });
  });
}

/** An old phone: no Web Share API; capture window.open instead of leaving the app. */
async function noShare(page: Page) {
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
}

async function openSheet(page: Page) {
  await page.goto("/report");
  await page.getByRole("button", { name: "مشاركة التقرير" }).click();
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

test("«طباعة» opens the print dialog", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Win;
    w.__printed = 0;
    window.print = () => void w.__printed++;
  });
  await page.goto("/report");
  await page.getByRole("button", { name: "طباعة" }).click();
  expect(await win(page, "__printed")).toBe(1);
});

test("report images: every page as a 1080×1350 PNG in one share", async ({ page }) => {
  await shareSheet(page);
  await openSheet(page);
  await page.getByRole("button", { name: /صور التقرير/ }).click();

  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).not.toHaveLength(0);
  const files = await win(page, "__shared");
  expect(files.length).toBeGreaterThanOrEqual(4); // cover, members, money
  files.forEach((f, i) => {
    expect(f).toMatchObject({ type: "image/png", w: 1080, h: 1350 });
    expect(f.name).toMatch(new RegExp(`^تقرير-صندوق-الرابطة-\\d{4}-\\d{2}-\\d{2}-${i + 1}\\.png$`));
  });
  expect(await win(page, "__text")).toMatch(/التفاصيل: https:\/\/\S+\/report/);
  await expect(page.getByRole("status")).toHaveText(/أُرسل التقرير/);
});

test("PDF: one A4 file to the share sheet", async ({ page }) => {
  await shareSheet(page);
  await openSheet(page);
  await page.getByRole("button", { name: /ملف PDF/ }).click();

  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).toHaveLength(1);
  const [f] = await win(page, "__shared");
  expect(f.type).toBe("application/pdf");
  expect(f.head).toBe("%PDF-");
  expect(f.name).toMatch(/^تقرير-صندوق-الرابطة-\d{4}-\d{2}-\d{2}\.pdf$/);
  expect(f.size).toBeLessThan(1_500_000);
});

test("PDF without a share sheet is downloaded", async ({ page }) => {
  await noShare(page);
  await openSheet(page);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /ملف PDF/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^تقرير-صندوق-الرابطة-.+\.pdf$/);
  await expect(page.getByRole("status")).toHaveText(/حفظ الملف في التنزيلات/);
});

test("report images without a share sheet fall back to WhatsApp text with the link", async ({
  page,
}) => {
  await noShare(page);
  await openSheet(page);
  await page.getByRole("button", { name: /صور التقرير/ }).click();

  await expect.poll(() => win(page, "__opened")).toHaveLength(1);
  const [url] = await win(page, "__opened");
  expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  const text = decodeURIComponent(url.split("text=")[1]);
  expect(text).toContain("ملخص صندوق الرابطة");
  expect(text).toMatch(/في الصندوق الآن: .+ أوقية/);
  expect(text).toMatch(/\d+ من \d+ دفعوا رسوم \S+/);
  expect(text).toMatch(/التفاصيل: https:\/\/\S+\/report$/);
  expect(text).not.toContain("localhost");
});

test("summary image alone goes to the share sheet as a 1080×1350 PNG", async ({ page }) => {
  await shareSheet(page);
  await openSheet(page);
  await page.getByRole("button", { name: /صورة الملخص فقط/ }).click();

  await expect.poll(() => win(page, "__shared")).toHaveLength(1);
  const [f] = await win(page, "__shared");
  expect(f).toMatchObject({ type: "image/png", w: 1080, h: 1350 });
  expect(f.name).toMatch(/^ملخص-صندوق-الرابطة-\d{4}-\d{2}\.png$/);
  expect(f.size).toBeGreaterThan(30_000);
});

test("members grid: ● / ○ legend and a ✓ «paid up to now», no status text", async ({ page }) => {
  await page.goto("/report");
  const legend = page.locator(".rp-legend");
  await expect(legend).toContainText("غير مدفوع");
  await expect(legend).toContainText(/دفع حتى \S+/);
  await expect(legend).not.toContainText("متأخر");
  const rows = page.locator(".rp-members li");
  await expect(rows.first().locator(".rp-dots .rp-d")).toHaveCount(12);
  for (const list of await page.locator(".rp-members").all())
    await expect(list).not.toContainText(/منتظم|متأخر/);
  expect(await page.locator(".rp-ok svg").count()).toBeGreaterThan(0);
});

test("«✓ يعني» in the share sheet: default up to now, the choice is kept, images follow it", async ({
  page,
}) => {
  await shareSheet(page);
  await openSheet(page);
  const now = page.getByRole("radio", { name: "دفع حتى الآن" });
  const year = page.getByRole("radio", { name: "دفع السنة كاملة" });
  await expect(now).toHaveAttribute("aria-checked", "true");
  await year.click();
  await expect(year).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".rp-check-k")).toContainText("✓ دفع السنة كاملة");

  await page.getByRole("button", { name: /صور التقرير/ }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).not.toHaveLength(0);

  await page.reload();
  await page.getByRole("button", { name: "مشاركة التقرير" }).click();
  await expect(page.getByRole("radio", { name: "دفع السنة كاملة" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
