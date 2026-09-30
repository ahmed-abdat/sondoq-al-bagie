import { expect, test, type Page } from "@playwright/test";

// «سجّل دفعة» on the demo committee (fixtures build): writes are simulated in the browser.
// Committee-only app: home → /committee/record, confirmed at once, «تراجع» for 30 s, no receipt.

/** From home, the big «سجّل دفعة», then a member found by name or paper number. */
async function startFor(page: Page, who: string) {
  await page.goto("/committee");
  await page
    .getByRole("link", { name: /سجّل دفعة/ })
    .first()
    .click();
  await page.waitForURL("**/committee/record");
  await expect(page.getByRole("heading", { name: "سجّل دفعة", level: 1 })).toBeVisible();
  await page.getByLabel("ابحث عن العضو", { exact: true }).fill(who);
  await page.locator(".pa-rows button.pa-row").first().click();
}

// a valid 1×1 PNG (OCR reads nothing: the committee member picks the wallet)
const png1x1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC",
  "base64",
);

const saveBtn = (page: Page) => page.locator(".r2-foot").getByRole("button");

test("the save button names the missing step, then saves; «تراجع» takes it back", async ({
  page,
}) => {
  await page.goto("/committee/record");
  // nothing chosen yet: no total bar; a new phone offers who owes
  await expect(page.locator(".r2-foot")).toHaveCount(0);
  await expect(page.getByText("عليهم رسوم", { exact: true })).toBeVisible();

  await page.getByLabel("ابحث عن العضو", { exact: true }).fill("أ 4");
  await page.locator(".pa-rows button.pa-row").first().click();
  // late months by default, the total in the footer before anything is saved
  const line = page.locator(".r2-line").first();
  await expect(line).toContainText(/رسوم .*من يناير/);
  await expect(page.getByRole("radio", { name: "الأشهر المتأخرة" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator(".r2-foot-sum")).toContainText(/\d/);
  await expect(saveBtn(page)).toHaveText("كيف دفع؟");

  await page.getByRole("button", { name: /نقدًا/ }).click();
  await expect(page.getByText("نقدًا، اليوم")).toBeVisible();
  await expect(saveBtn(page)).toHaveText(/سجّل/);
  await saveBtn(page).click();

  // no receipt: a line, «تراجع (30)» and the next steps
  await expect(page.getByRole("status").filter({ hasText: "سُجّلت الدفعة" })).toBeVisible();
  await expect(page.getByText(/الشيخ ولد سيدي · \d[\d\s  ]* أوقية/)).toBeVisible();
  await expect(page.getByRole("button", { name: /دفعة أخرى/ })).toBeVisible();
  await page.getByRole("button", { name: /^تراجع \(\d+\)$/ }).click();
  await expect(page.getByRole("heading", { name: "أُلغيت الدفعة، لم تُحسب." })).toBeVisible();
  await expect(page.getByRole("button", { name: /^تراجع/ })).toHaveCount(0);
  // the form comes back filled, to correct and save again
  await page.getByRole("button", { name: "صحّحها وسجّل من جديد" }).click();
  await expect(page.locator(".r2-line").first()).toContainText("الشيخ ولد سيدي");
  await expect(page.getByText("نقدًا، اليوم")).toBeVisible();
});

test("a transfer screenshot asks for the wallet, the months can be picked one by one", async ({
  page,
}) => {
  await startFor(page, "ب 12");
  await page.getByRole("radio", { name: "اختر" }).click();
  await page
    .getByRole("group", { name: /^أشهر \d{4}$/ })
    .getByRole("button", { name: /سبتمبر/ })
    .click();
  await expect(page.locator(".r2-line").first()).toContainText("رسوم من يوليو إلى أغسطس");

  await page
    .locator('.r2-how input[type="file"]')
    .setInputFiles({ name: "t.png", mimeType: "image/png", buffer: png1x1 });
  await expect(page.getByRole("img", { name: "صورة التحويل" })).toBeVisible();
  await expect(saveBtn(page)).toHaveText("اختر المحفظة", { timeout: 30_000 });
  await page
    .getByRole("radiogroup", { name: "المحفظة" })
    .getByRole("radio", { name: "بنكيلي" })
    .click();
  await expect(saveBtn(page)).toHaveText(/سجّل/);
  await saveBtn(page).click();
  await expect(page.getByRole("status").filter({ hasText: "سُجّلت الدفعة" })).toBeVisible();
});

test("several people in one transfer: a relative from the hint, each with his months", async ({
  page,
}) => {
  await startFor(page, "ب 12");
  await expect(page.getByText("من عائلته، عليهم رسوم:")).toBeVisible();
  await page.locator(".r2-rel-chip").first().click();
  await expect(page.locator(".r2-line")).toHaveCount(2);
  await expect(page.getByText("شخصان في تحويل واحد")).toBeVisible();
  // the second person is removed again
  await page.getByRole("button", { name: "احذف من الدفعة" }).nth(1).click();
  await expect(page.locator(".r2-line")).toHaveCount(1);
});
