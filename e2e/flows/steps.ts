// Shared steps for the flows: committee members' phones (each its own browser context, own
// cookies) against the local Supabase only. Committee-only app (2026-09-30): payments are
// recorded by the committee from the screenshots in the WhatsApp group, confirmed at once (m29).
import { randomBytes } from "node:crypto";
import zlib from "node:zlib";
import { expect, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { codeOf, messageFor } from "../../src/lib/data/errors";
import { COMMITTEE, signedIn, type Who } from "../../supabase/tests/e2e/helpers";

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

/** A stranger: no session. */
export const strangerPhone = phone;

/** Open a committee page and wait until it has streamed in. */
export async function openPage(page: Page, path: string) {
  await page.goto(path);
  await expect(page.getByText("جارٍ فتح صفحة اللجنة…")).toHaveCount(0);
}

/**
 * «سجّل دفعة» from a transfer screenshot, as a committee member does it from the WhatsApp group:
 * home → «سجّل دفعة» (/committee/record), the member (late months by default), the picture, the
 * wallet, save. Found by roles and labels: the member by name, the wallet by its name. Returns on
 * the saved screen («سُجّلت الدفعة» + «تراجع»), the payment confirmed in the database.
 */
export async function recordTransfer(page: Page, member: string, wallet = "بنكيلي") {
  await openPage(page, "/committee");
  await page
    .getByRole("link", { name: /سجّل دفعة/ })
    .first()
    .click();
  await page.waitForURL("**/committee/record");
  await page.getByLabel("ابحث عن العضو", { exact: true }).fill(member);
  await page.getByRole("button").filter({ hasText: member }).first().click();
  await page.locator('.r2-how input[type="file"]').setInputFiles(shot());
  await page
    .getByRole("radiogroup", { name: "المحفظة" })
    .getByRole("radio", { name: wallet })
    .click();
  const save = page.locator(".r2-foot").getByRole("button");
  await expect(save).toHaveText(/^\s*سجّل\s*$/);
  await save.click();
  await expect(page.getByRole("status").filter({ hasText: "سُجّلت الدفعة" })).toBeVisible();
}

/** «تراجع (n)» on the saved screen, right after recordTransfer. */
export async function undoFromSaved(page: Page) {
  await page.getByRole("button", { name: /^تراجع \(\d+\)$/ }).click();
  await expect(page.getByRole("heading", { name: "أُلغيت الدفعة، لم تُحسب." })).toBeVisible();
}

/**
 * A committee member's own Supabase session: the same database rules as the app. Used where no
 * screen offers the action (another member's undo) or the screen is still being built (levies,
 * the statement); switch each step to the screen once it lands.
 */
export const asCommittee = signedIn;

/** The Arabic message the app shows for a database error. */
export const errorText = (err: Parameters<typeof codeOf>[0] | null) =>
  err ? messageFor(codeOf(err)) : null;
