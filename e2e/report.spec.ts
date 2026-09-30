import { expect, test, type Page } from "@playwright/test";

// /committee/reports: the reports catalog (plan §9): each report opens as its pages and goes out as
// images, a PDF or text (src/lib/reports). Needs a production build with fictional data:
// SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 pnpm start.

type SharedFile = {
  name: string;
  type: string;
  size: number;
  w: number;
  h: number;
  head: string;
  /** a PDF's page count */
  pages: number;
};
type Win = { __opened: string[]; __shared: SharedFile[]; __text: string };

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
          const pages =
            f.type === "application/pdf"
              ? (new TextDecoder("latin1").decode(await f.arrayBuffer()).match(/\/Type \/Page\b/g)
                  ?.length ?? 0)
              : 0;
          out.push({
            pages,
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

/** «التقارير» tab → a report from the catalog; waits until its pages are drawn. */
async function openReport(page: Page, name: RegExp) {
  await page.goto("/committee");
  await page
    .getByRole("navigation", { name: "التنقل" })
    .getByRole("link", { name: "التقارير" })
    .click();
  await page.waitForURL("**/committee/reports");
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("img", { name: /صفحة 1 من \d+/ })).toBeVisible({ timeout: 20_000 });
}

const Y = new Date().getFullYear();
const noSpaces = (t: string) => t.replace(/[   ⁦-⁩]/g, " ");

test("the catalog: reports for the group, reports for the committee, «الإحصاءات»", async ({
  page,
}) => {
  await page.goto("/committee/reports");
  await expect(page.getByRole("heading", { name: "التقارير", level: 1 })).toBeVisible();
  const group = page.getByRole("region", { name: "للمجموعة" });
  for (const name of ["التقرير السنوي الكامل", "الملخص", "جدول الأشهر", "المتأخرات", "المصاريف"])
    await expect(group.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  const committee = page.getByRole("region", { name: "للجنة" });
  for (const name of ["تقرير التسليم", "المبالغ حسب المحفظة", "عمل اللجنة"])
    await expect(committee.getByRole("button", { name: new RegExp(`^${name}`) })).toBeVisible();
  await group.getByRole("link", { name: /^الإحصاءات/ }).click();
  await expect(page).toHaveURL(/\/committee\/stats$/);
});

test("annual report: every page as a 1080×1350 PNG in one share", async ({ page }) => {
  await shareSheet(page);
  await openReport(page, /^التقرير السنوي الكامل/);
  const shown = await page.getByRole("img", { name: /^التقرير السنوي الكامل، صفحة/ }).count();
  await page.getByRole("button", { name: "صور لواتساب" }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).toHaveLength(shown);
  const files = await win(page, "__shared");
  files.forEach((f, i) => {
    expect(f).toMatchObject({ type: "image/png", w: 1080, h: 1350 });
    expect(f.name).toBe(`التقرير-السنوي-${Y}-${i + 1}.png`);
    expect(f.size).toBeGreaterThan(20_000);
  });
  expect(await win(page, "__text")).toContain("التقرير السنوي الكامل");
  // the share sheet opened; nothing is claimed about delivery
  await expect(page.getByText(/أُرسل/)).toHaveCount(0);
});

test("PDF: one A4 file to the share sheet", async ({ page }) => {
  await shareSheet(page);
  await openReport(page, /^التقرير السنوي الكامل/);
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).toHaveLength(1);
  const [f] = await win(page, "__shared");
  expect(f).toMatchObject({ type: "application/pdf", head: "%PDF-" });
  expect(f.name).toBe(`التقرير-السنوي-${Y}.pdf`);
  expect(f.pages).toBeGreaterThanOrEqual(1);
  expect(f.size).toBeLessThan(1_500_000);
});

test("PDF without a share sheet is downloaded", async ({ page }) => {
  await noShare(page);
  await openReport(page, /^التقرير السنوي الكامل/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  expect((await download).suggestedFilename()).toBe(`التقرير-السنوي-${Y}.pdf`);
  await expect(
    page.getByRole("status").filter({ hasText: "حُفظ الملف في التنزيلات." }),
  ).toBeVisible();
});

test("images without a share sheet: WhatsApp opens with the report as text, no link", async ({
  page,
}) => {
  await noShare(page);
  await openReport(page, /^الملخص/);
  await page.getByRole("button", { name: "صور لواتساب" }).click();
  await expect.poll(() => win(page, "__opened")).toHaveLength(1);
  const [url] = await win(page, "__opened");
  expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  const text = noSpaces(decodeURIComponent(url.split("text=")[1]));
  expect(text).toContain("*الملخص*");
  expect(text).toMatch(/\d+ \d{3}/); // amounts
  expect(text).not.toMatch(/https?:\/\//);
  await expect(page.getByRole("status")).toHaveText(/فُتح واتساب بنص التقرير/);
});

test("«نص»: the report as text, copied for WhatsApp", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openReport(page, /^المصاريف/);
  await page.getByRole("button", { name: "نص", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("نُسخ نص التقرير. الصقه في واتساب.");
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("*المصاريف*");
  expect(text).toContain("المبالغ بالأوقية القديمة");
});

test("«المتأخرات»: names and months only, no amounts, in the images, PDF and text", async ({
  page,
  context,
}) => {
  await shareSheet(page);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openReport(page, /^المتأخرات/);
  await page.getByRole("button", { name: "صور لواتساب" }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).not.toHaveLength(0);
  for (const [i, f] of (await win(page, "__shared")).entries())
    expect(f.name).toBe(`المتأخرات-${Y}-${i + 1}.png`);
  await page.evaluate(() => ((window as unknown as Win).__shared = []));
  await page.getByRole("button", { name: "PDF", exact: true }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).toHaveLength(1);
  expect((await win(page, "__shared"))[0].name).toBe(`المتأخرات-${Y}.pdf`);
  await page.getByRole("button", { name: "نص", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(/نُسخ نص التقرير/);
  const text = await page.evaluate(() => navigator.clipboard.readText());
  expect(text).toContain("*المتأخرات*");
  expect(text).not.toContain("أوقية");
  expect(noSpaces(text)).not.toMatch(/\d+ \d{3}/);
});

test("«الإحصاءات»: counts and percentages only, shared as the same pages", async ({ page }) => {
  await shareSheet(page);
  await page.goto("/committee/stats");
  await expect(page.getByRole("heading", { name: "الإحصاءات", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "شارك الإحصاءات في المجموعة" }).click();
  const sheet = page.getByRole("dialog", { name: "شارك الإحصاءات" });
  await expect(sheet.getByRole("img", { name: /صفحة 1 من \d+/ })).toBeVisible({ timeout: 20_000 });
  await sheet.getByRole("button", { name: "صور لواتساب" }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).not.toHaveLength(0);
  for (const [i, f] of (await win(page, "__shared")).entries()) {
    expect(f).toMatchObject({ type: "image/png", w: 1080, h: 1350 });
    expect(f.name).toBe(`الإحصاءات-${Y}-${i + 1}.png`);
  }
});

test("offline, a report page is the offline page (committee-only: nothing kept)", async ({
  page,
  context,
}) => {
  await page.goto("/committee/reports");
  await expect(page.getByRole("heading", { name: "التقارير", level: 1 })).toBeVisible();
  await waitForServiceWorker(page);
  await page.reload();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
  await context.setOffline(false);
});
