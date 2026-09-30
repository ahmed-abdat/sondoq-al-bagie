import { expect, test, type Page } from "@playwright/test";

// /committee/reports: the catalog, one report's real pages and «صور لواتساب» · «PDF» · «نص»
// (Lane B renderers). Needs a production build; fictional data: SONDOQ_FIXTURES=1.

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
type Win = { __opened: string[]; __printed: number; __shared: SharedFile[]; __text: string };

const win = <K extends keyof Win>(page: Page, k: K): Promise<Win[K]> =>
  page.evaluate((key) => (window as unknown as Win)[key], k) as Promise<Win[K]>;

const heading = (page: Page) => page.getByRole("heading", { level: 1, name: "التقارير" });

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

/** The catalog, then one report; its pages are drawn before sharing. */
async function openReport(page: Page, name: RegExp) {
  await page.goto("/committee/reports");
  await page.getByRole("button", { name }).click();
  await expect(page.locator(".pa-doc img").first()).toBeVisible({ timeout: 20_000 });
}

test("opens; offline it is the offline page (committee-only: nothing kept)", async ({
  page,
  context,
}) => {
  await page.goto("/committee/reports");
  await expect(heading(page)).toBeVisible();
  await waitForServiceWorker(page);
  await page.reload();
  await expect(heading(page)).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText("لا يوجد اتصال بالإنترنت")).toBeVisible();
  await context.setOffline(false);
});

test("the catalog: «للمجموعة» with «الإحصاءات», and «للجنة»", async ({ page }) => {
  await page.goto("/committee/reports");
  await expect(page.getByRole("heading", { name: "للمجموعة" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "للجنة" })).toBeVisible();
  await expect(page.getByRole("link", { name: /الإحصاءات/ })).toHaveAttribute(
    "href",
    "/committee/stats",
  );
});

test("report images: every page as a 1080×1350 PNG in one share", async ({ page }) => {
  await shareSheet(page);
  await openReport(page, /التقرير السنوي الكامل/);
  await page.getByRole("button", { name: /صور لواتساب/ }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).not.toHaveLength(0);
  const files = await win(page, "__shared");
  files.forEach((f, i) => {
    expect(f).toMatchObject({ type: "image/png", w: 1080, h: 1350 });
    expect(f.name).toMatch(new RegExp(`^التقرير-السنوي-\\d{4}-${i + 1}\\.png$`));
  });
  // the share sheet opened; nothing is claimed about delivery
  await expect(page.getByText(/أُرسل التقرير/)).toHaveCount(0);
});

test("PDF: one A4 file to the share sheet", async ({ page }) => {
  await shareSheet(page);
  await openReport(page, /الملخص/);
  await page.getByRole("button", { name: /^PDF$/ }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).toHaveLength(1);
  const [f] = await win(page, "__shared");
  expect(f).toMatchObject({ type: "application/pdf", head: "%PDF-" });
  expect(f.name).toMatch(/^الملخص-.+\.pdf$/);
  expect(f.size).toBeLessThan(1_500_000);
});

test("«المتأخرات»: names and months, no money", async ({ page }) => {
  await shareSheet(page);
  await openReport(page, /المتأخرات/);
  await page.getByRole("button", { name: /صور لواتساب/ }).click();
  await expect.poll(() => win(page, "__shared"), { timeout: 20_000 }).not.toHaveLength(0);
  const files = await win(page, "__shared");
  files.forEach((f, i) => {
    expect(f).toMatchObject({ type: "image/png", w: 1080, h: 1350 });
    expect(f.name).toMatch(new RegExp(`^المتأخرات-\\d{4}-${i + 1}\\.png$`));
  });
});

test("PDF without a share sheet is downloaded", async ({ page }) => {
  await noShare(page);
  await openReport(page, /الملخص/);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /^PDF$/ }).click();
  expect((await download).suggestedFilename()).toMatch(/^الملخص-.+\.pdf$/);
  await expect(page.getByText("حُفظ الملف في التنزيلات.")).toBeVisible();
});

test("report images without a share sheet open WhatsApp with the report as text", async ({
  page,
}) => {
  await noShare(page);
  await openReport(page, /الملخص/);
  await page.getByRole("button", { name: /صور لواتساب/ }).click();
  await expect.poll(() => win(page, "__opened")).toHaveLength(1);
  const [url] = await win(page, "__opened");
  expect(url).toMatch(/^https:\/\/wa\.me\/\?text=/);
  expect(decodeURIComponent(url.split("text=")[1])).toContain("الملخص");
  await expect(page.getByText(/فُتح واتساب بنص التقرير/)).toBeVisible();
});

test("a period: the year sheet with 12 months and «السنة كلها»", async ({ page }) => {
  await page.goto("/committee/reports");
  await page.getByRole("button", { name: /الملخص/ }).click();
  await page.getByRole("button", { name: /الفترة: سنة \d{4}/ }).click();
  const sheet = page.getByRole("dialog", { name: "أي فترة؟" });
  await expect(sheet.getByRole("button", { name: /السنة كلها/ })).toBeVisible();
  await sheet.getByRole("button", { name: "مارس" }).click();
  await expect(page.getByRole("button", { name: /الفترة: مارس \d{4}/ })).toBeVisible();
});
