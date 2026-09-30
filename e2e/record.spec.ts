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
/** The total in the footer, in old ouguiya. */
const total = async (page: Page) =>
  Number((await page.locator(".r2-foot-sum b").innerText()).replace(/\D/g, ""));

test("the save button names the missing step, then saves; «تراجع» takes it back", async ({
  page,
}) => {
  await page.goto("/committee/record");
  // nothing chosen yet: no total bar; a new phone offers who owes
  await expect(page.locator(".r2-foot")).toHaveCount(0);
  await expect(page.getByText("عليهم متأخرات", { exact: true })).toBeVisible();

  await page.getByLabel("ابحث عن العضو", { exact: true }).fill("أ 4");
  await page.locator(".pa-rows button.pa-row").first().click();
  // late months by default, the total in the footer before anything is saved
  const line = page.locator(".r2-line").first();
  await expect(line).toContainText(/مستحقات .*من يناير/);
  await expect(page.getByRole("radio", { name: "الأشهر المتأخرة" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await expect(page.locator(".r2-foot-sum")).toContainText(/\d/);
  await expect(saveBtn(page)).toHaveText("كيف دفع؟");

  await page.getByRole("button", { name: /نقدًا/ }).click();
  await expect(page.getByRole("button", { name: /^متى دفع؟: اليوم/ })).toBeVisible();
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
  await expect(page.getByRole("button", { name: /^متى دفع؟: اليوم/ })).toBeVisible();
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
  await expect(page.locator(".r2-line").first()).toContainText("مستحقات من يوليو إلى أغسطس");

  await page
    .locator('.r2-how input[type="file"]')
    .setInputFiles({ name: "t.png", mimeType: "image/png", buffer: png1x1 });
  await expect(page.getByRole("img", { name: "صورة التحويل" })).toBeVisible();
  // nothing read on this picture: its amount is typed (MRU, as printed)
  await expect(saveBtn(page)).toHaveText("اكتب المبلغ", { timeout: 30_000 });
  await page.getByLabel("لم نقرأ المبلغ. اكتبه:").fill(String((await total(page)) / 10));
  await expect(page.locator(".r2-chip")).toHaveText(/مطابق للصورة/);
  await expect(saveBtn(page)).toHaveText("اختر المحفظة");
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
  await expect(page.getByText("من عائلته، عليهم متأخرات:")).toBeVisible();
  await page.locator(".r2-rel-chip").first().click();
  await expect(page.locator(".r2-line")).toHaveCount(2);
  await expect(page.getByText("شخصان في تحويل واحد")).toBeVisible();
  // the second person is removed again
  await page.getByRole("button", { name: "أخرِجه من الدفعة" }).nth(1).click();
  await expect(page.locator(".r2-line")).toHaveCount(1);
});

test("the payment picker: who has nothing to pay is not offered, search shows them dimmed", async ({
  page,
}) => {
  await page.goto("/committee/record");
  const find = page.getByLabel("ابحث عن العضو", { exact: true });
  // before typing: only members with something to pay
  await expect(page.locator(".pa-rows button.pa-row").first()).toBeVisible();
  await expect(page.locator(".pa-rows button.pa-row.is-muted")).toHaveCount(0);
  // a member who paid the whole year and owes no لوحة share: found, dimmed, still pickable (تبرع)
  await find.fill("أ 7");
  const row = page.locator(".pa-rows button.pa-row").first();
  await expect(row).toContainText("لا شيء عليه");
  await expect(row).toHaveClass(/is-muted/);
  // paid the year but owes a لوحة share: offered, and says so
  await find.fill("أ 2");
  await expect(page.locator(".pa-rows button.pa-row").first()).toContainText("عليه نصيب لوحة");
});

test("the picture strip: the amount typed from it is checked against the total, in place", async ({
  page,
}) => {
  await startFor(page, "ب 12");
  await page
    .locator('.r2-how input[type="file"]')
    .setInputFiles({ name: "t.png", mimeType: "image/png", buffer: png1x1 });
  const typed = page.getByLabel("لم نقرأ المبلغ. اكتبه:");
  await expect(typed).toBeVisible({ timeout: 30_000 });
  const sum = await total(page);
  // the picture says more than the total: «ينقص», add a person or give the reason
  await typed.fill(String(sum / 10 + 50));
  await expect(page.locator(".r2-chip")).toHaveText(/أقل من الصورة بـ 500/);
  await expect(page.locator(".r2-diff")).toContainText("ينقص 500");
  await page
    .getByRole("radiogroup", { name: "المحفظة" })
    .getByRole("radio", { name: "بنكيلي" })
    .click();
  await expect(saveBtn(page)).toHaveText("اكتب السبب");
  await page.locator(".r2-diff").getByRole("button", { name: "اكتب السبب" }).click();
  await page.getByLabel("السبب (يُحفظ مع الدفعة)").fill("الباقي نقدًا");
  await expect(saveBtn(page)).toHaveText(/سجّل/);
  // «أضف شخصًا» opens the member search
  await page.locator(".r2-diff").getByRole("button", { name: "أضف شخصًا" }).click();
  await expect(page.getByLabel("ابحث عن العضو", { exact: true })).toBeVisible();

  // full screen and back
  await page.getByRole("button", { name: "كبّر صورة التحويل" }).click();
  await expect(page.getByRole("dialog", { name: "صورة التحويل" })).toBeVisible();
  await page.getByRole("button", { name: "أغلق" }).click();
  await expect(page.getByRole("dialog", { name: "صورة التحويل" })).toHaveCount(0);

  // remove, then «تراجع» brings it back with what was typed
  await page.getByRole("button", { name: "احذف الصورة" }).click();
  await expect(page.locator(".r2-how")).toBeVisible();
  await page.getByRole("status").getByRole("button", { name: "تراجع" }).click();
  await expect(page.getByRole("img", { name: "صورة التحويل" })).toBeVisible();
  await expect(typed).toHaveValue(String(sum / 10 + 50));
});
