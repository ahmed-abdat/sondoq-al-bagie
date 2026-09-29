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

/** Share is committee only: from the hub (demo committee) to /report#share, the sheet opens. */
async function openSheet(page: Page) {
  await page.goto("/committee");
  // hub tabs (r31): «الأعمال» → «المزيد»
  await page.getByRole("button", { name: "الأعمال" }).click();
  await page.getByText("المزيد").click();
  await page.getByRole("link", { name: /مشاركة التقرير/ }).click();
  await expect(page.getByRole("dialog", { name: "مشاركة التقرير" })).toBeVisible();
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
  await page.getByRole("button", { name: /صور لواتساب/ }).click();

  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).not.toHaveLength(0);
  const files = await win(page, "__shared");
  expect(files.length).toBeGreaterThanOrEqual(4); // cover, members, money
  files.forEach((f, i) => {
    expect(f).toMatchObject({ type: "image/png", w: 1080, h: 1350 });
    expect(f.name).toMatch(new RegExp(`^تقرير-صندوق-الرابطة-\\d{4}-\\d{2}-\\d{2}-${i + 1}\\.png$`));
  });
  expect(await win(page, "__text")).toMatch(/التفاصيل: https:\/\/\S+\/report/);
  // the share sheet opened; nothing is claimed about delivery (QA pass 5)
  await expect(page.getByText(/أُرسل التقرير/)).toHaveCount(0);
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
  await expect(page.getByRole("status")).toHaveText(/حُفظ الملف في التنزيلات/);
});

test("report images without a share sheet fall back to WhatsApp text with the link", async ({
  page,
}) => {
  await noShare(page);
  await openSheet(page);
  await page.getByRole("button", { name: /صور لواتساب/ }).click();

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

test("members grid: one bordered table, a plain ✓ in each paid month, empty cells otherwise", async ({
  page,
}) => {
  await page.goto("/report");
  const legend = page.locator(".rp-legend");
  await expect(legend).toContainText("مدفوع");
  await expect(legend).toContainText("12 = ديسمبر");
  // r22: like the paper sheet, an unpaid month is an empty white cell (no tint, no words)
  await expect(legend).toContainText("خانة فارغة: لم يُدفع");
  await expect(legend).not.toContainText(/غير مدفوع|متأخر|دفع حتى/);
  await expect(page.locator(".is-unpaid, .rp-swatch")).toHaveCount(0);
  // r25: the ✓ is a plain green check, never a filled disc
  await expect(page.locator(".rp-legend svg circle, .rp-mt svg circle")).toHaveCount(0);
  // «المجموع: … أوقية» under each group
  await expect(page.locator(".rp-gtotal")).toHaveCount(await page.locator(".rp-mt-narrow").count());
  // a stranger: the total is hidden (money privacy)
  await expect(page.locator(".rp-gtotal").first()).toHaveText(/^المجموع:\s+أوقية$/);
  await expect(page.locator(".rp-gtotal").first().locator(".bq-dots")).toHaveCount(1);
  // r25: no «الرقم» column
  for (const t of await page.locator(".rp-mt").all()) await expect(t).not.toContainText("الرقم");
  const narrow = page.locator(".rp-mt-narrow").first();
  await expect(narrow.locator("thead th")).toHaveCount(12);
  await expect(narrow.locator("tbody").first().locator(".rp-mt-c")).toHaveCount(12);
  const marks = await page.locator(".rp-mt-narrow .rp-mt-c svg").count();
  expect(marks).toBeGreaterThan(0);
  await expect(page.locator(".rp-mt-narrow .rp-mt-c:empty").first()).toBeAttached();
  for (const t of await page.locator(".rp-mt-narrow").all())
    await expect(t).not.toContainText(/منتظم|متأخر/);
  // on a 390px phone the narrow table shows, without overflow (group «أ» opened)
  await page.locator(".rp-coll-h", { hasText: "المجموعة أ" }).first().click();
  await expect(page.locator(".rp-mt-wide").first()).toBeHidden();
  await expect(narrow).toBeVisible();
  const box = await narrow.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  // ≥600px: one line per member, «الاسم | 1 … 12»
  await page.setViewportSize({ width: 1280, height: 900 });
  const wide = page.locator(".rp-mt-wide").first();
  await expect(wide).toBeVisible();
  await expect(narrow).toBeHidden();
  await expect(wide.locator("thead th")).toHaveText([
    "الاسم",
    ...Array.from({ length: 12 }, (_, i) => String(i + 1)),
  ]);
  await expect(wide.locator("tbody tr").first().locator("td")).toHaveCount(13);
  await page.setViewportSize({ width: 390, height: 844 });
});

test("«مشاركة التقرير» is for the committee only: a visitor reads, #share opens nothing", async ({
  page,
}) => {
  await page.goto("/report#share");
  await expect(heading(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "طباعة" })).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("button", { name: "مشاركة التقرير" })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/accounts");
  await expect(page.getByRole("link", { name: /مشاركة التقرير/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /التقرير كاملًا/ })).toBeVisible();
});

test("committee (demo): the hub opens the share sheet on the report", async ({ page }) => {
  await openSheet(page);
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("dialog")).not.toContainText("✓ يعني");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "مشاركة التقرير" })).toBeVisible();
});

test("copy link: «نُسخ» only after the clipboard said yes, else the link to copy by hand (QA pass 5)", async ({
  page,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: () => Promise.reject(new Error("denied")) },
    });
  });
  await openSheet(page);
  await page.getByRole("button", { name: /نسخ الرابط/ }).click();
  const field = page.getByRole("textbox", { name: "انسخ الرابط يدويًا" });
  await expect(field).toHaveValue(/\/report$/);
  await expect(page.getByText(/نُسخ الرابط/)).toHaveCount(0);
});

test("copy link: a real clipboard write says «نُسخ الرابط»", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: (t: string) => {
          (window as unknown as { __copied: string }).__copied = t;
          return Promise.resolve();
        },
      },
    });
  });
  await openSheet(page);
  await page.getByRole("button", { name: /نسخ الرابط/ }).click();
  await expect(page.getByRole("status")).toHaveText(/نُسخ الرابط/);
  expect(await page.evaluate(() => (window as unknown as { __copied: string }).__copied)).toMatch(
    /\/report$/,
  );
});
