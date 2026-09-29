import path from "node:path";
import { expect, test } from "@playwright/test";

// Donations step 4 on a fixtures build (owner, r33): the photo really reaches the committee.
const SHOT = path.join(process.cwd(), "public/logo.jpg");

test("member with a link: the photo and the amount join the committee queue", async ({ page }) => {
  await page.goto("/m/demo");
  await page.goto("/donations");
  const title = (await page.locator("#bq-camp-h").textContent())!.trim();
  await expect(page.getByText("اختر صورة التحويل")).toBeVisible();
  await page.getByRole("radio", { name: "1 000" }).click();
  await page.locator(".bq-give-proof input[type=file]").setInputFiles(SHOT);
  const send = page.getByRole("button", { name: /^أرسل 1\s000 أوقية إلى اللجنة$/ });
  await expect(send).toBeEnabled();
  await send.click();
  await expect(page.getByText("وصلتنا الصورة. اللجنة تراجعها.")).toBeVisible();

  // the demo committee sees it in its queue: newest first, open, as a contribution
  // (demo writes live in this tab: move there in the app, not by reloading)
  await page.locator("nav").getByRole("link", { name: "اللجنة" }).first().click();
  // the exact campaign, not a generic «حملة تبرعات» (QA pass 5)
  await expect(page.locator("article.bq-slip").first()).toContainText(`مساهمة في: ${title}`);
});

test("stranger: the image itself goes to the share sheet when the phone can share files", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared?: unknown };
    Object.assign(navigator, {
      canShare: (d?: { files?: File[] }) => !!d?.files?.length,
      share: async (d: { files?: File[]; text?: string }) => {
        w.__shared = { file: d.files?.[0] instanceof File, type: d.files?.[0]?.type, text: d.text };
      },
    });
  });
  await page.goto("/donations");
  await page.locator(".bq-give-proof input[type=file]").setInputFiles(SHOT);
  await page.getByRole("button", { name: /^شارك الصورة$/ }).click();
  const shared = await page.evaluate(() => (window as unknown as { __shared?: unknown }).__shared);
  expect(shared).toMatchObject({ file: true, type: "image/jpeg" });
  // intent/present tense: nothing claims it was sent (QA pass 5)
  expect((shared as { text: string }).text).toContain("هذه صورة تحويل مساهمتي في");
  expect((shared as { text: string }).text).not.toContain("أرسلت");
});

test("stranger without file sharing: WhatsApp opens with the text and the page says to attach", async ({
  page,
}) => {
  await page.addInitScript(() => Object.assign(navigator, { canShare: undefined }));
  await page.goto("/donations");
  await page.locator(".bq-give-proof input[type=file]").setInputFiles(SHOT);
  await expect(page.getByRole("link", { name: /افتح واتساب/ })).toHaveAttribute("href", /wa\.me/);
  await expect(page.getByText("أرفقها في واتساب ثم أرسل الرسالة.", { exact: false })).toBeVisible();
});
