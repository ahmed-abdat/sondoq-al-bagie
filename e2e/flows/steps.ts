// Shared steps for the two-person flows: a member's phone and a committee member's phone, each
// its own browser context (own cookies), against the local Supabase only.
import { randomBytes } from "node:crypto";
import zlib from "node:zlib";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { COMMITTEE, memberLink, type Who } from "../../supabase/tests/e2e/helpers";

/**
 * A transfer screenshot: any picture works (OCR reading nothing is fine: the member picks the
 * wallet). Each call is a new picture with its own pixels: the app refuses a picture already
 * sent (it compares the compressed image), as it would a member resending the same photo.
 */
export function shot() {
  const w = 96;
  const h = 96;
  const rows = Buffer.alloc((w * 3 + 1) * h);
  const px = randomBytes(w * h * 3);
  for (let y = 0; y < h; y++) px.copy(rows, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.concat([Buffer.from(type), data]);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(t) >>> 0);
    return Buffer.concat([len, t, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  return { name: "transfer.png", mimeType: "image/png", buffer: png };
}

export type Phone = { ctx: BrowserContext; page: Page };

async function phone(browser: Browser, baseURL: string): Promise<Phone> {
  const ctx = await browser.newContext({ baseURL, locale: "ar", timezoneId: "Africa/Nouakchott" });
  return { ctx, page: await ctx.newPage() };
}

/** The member's phone, opened with a fresh personal link: home shows their «أنت» card. */
export async function memberPhone(browser: Browser, baseURL: string, ref: string) {
  const p = await phone(browser, baseURL);
  await p.page.goto(await memberLink(ref));
  await expect(youCard(p.page)).toBeVisible();
  return p;
}

/** A committee member's phone, signed in on /login. */
export async function committeePhone(browser: Browser, baseURL: string, who: Who = "treasurer") {
  const p = await phone(browser, baseURL);
  await p.page.goto("/login");
  await p.page.locator('input[name="login"]').fill(COMMITTEE[who].login);
  await p.page.locator('input[name="password"]').fill(COMMITTEE[who].password);
  await p.page.locator('button[type="submit"]').click();
  await p.page.waitForURL("**/committee**");
  return p;
}

/** A stranger: no link, no session. */
export const strangerPhone = phone;

export const youCard = (page: Page) => page.locator("section.bq-you");

/**
 * From the proof sheet («أرسل صورة التحويل»): attach the picture, pick the wallet if asked, send.
 * Returns once the member's card says it arrived.
 */
export async function sendProof(page: Page, wallet = "بنكيلي") {
  const sheet = page.getByRole("dialog", { name: "أرسل صورة التحويل" });
  await expect(sheet).toBeVisible();
  const btn = sheet.locator(".bq-rec-foot").getByRole("button");
  await sheet.locator('input[type="file"]').setInputFiles(shot());
  await expect(btn).not.toHaveText("أرفق صورة التحويل");
  if ((await btn.textContent())?.includes("كيف")) {
    await btn.click();
    await sheet.getByRole("radio", { name: wallet }).click();
  }
  await expect(btn).toHaveText("أرسل إلى اللجنة");
  await btn.click();
  await expect(sheet).toHaveCount(0);
}

/** The member's own «ادفع الآن» → «دفعت؟ أرسل صورة التحويل» → send. */
export async function payOwnFees(page: Page) {
  await youCard(page).getByRole("button", { name: "ادفع الآن" }).click();
  await page
    .getByRole("dialog", { name: "ادفع الآن" })
    .getByRole("button", { name: /دفعت؟ أرسل صورة التحويل/ })
    .click();
  await sendProof(page);
}

/**
 * The committee hub's slip for this payer: the queue opens one at a time, the others are rows;
 * a row opens with a tap.
 */
export async function openSlip(page: Page, payer: string) {
  await page.goto("/committee");
  const slip = page.getByRole("article", { name: `دفعة ${payer}` });
  const row = page.locator("button.bq-rev-row").filter({ hasText: payer }).first();
  await expect(slip.or(row)).toBeVisible();
  if (!(await slip.isVisible())) await row.click();
  await expect(slip).toBeVisible();
  return slip;
}
