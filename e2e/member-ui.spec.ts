import path from "node:path";
import { expect, test } from "@playwright/test";

// Member access (personal link) on a fixtures build: /m/demo opens the app as the demo member;
// every member write is simulated in the browser.

const SHOT = path.join(process.cwd(), "public/logo.jpg");

test("public home has no «أنت» card", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "هل أنت منتظم في الدفع؟" })).toBeVisible();
  await expect(page.locator(".bq-you")).toHaveCount(0);
});

test("whole year paid: thanks, no pay button; «ادفع عن شخص آخر» → pending, on /me and in the committee queue", async ({
  page,
}) => {
  await page.goto("/m/demo");
  const card = page.locator("section.bq-you");
  await expect(card).toBeVisible();
  await expect(card).toContainText("أنت");
  await expect(card).toContainText("دفعت رسوم 2026 كاملة");
  await expect(card).toContainText("شكرًا لك");
  await expect(card.getByRole("button", { name: "ادفع الآن" })).toHaveCount(0);
  // months like the report: 12 bordered cells, a ✓ in each paid month
  await expect(card.locator(".bq-you-cells li")).toHaveCount(12);
  await expect(card.locator(".bq-you-cells li svg")).toHaveCount(12);
  await expect(card.locator(".bq-you-key")).toHaveText(/مدفوع/);

  await card.getByRole("button", { name: "ادفع عن شخص آخر" }).click();
  const sheet = page.getByRole("dialog", { name: "أرسل صورة التحويل" });
  // for someone else: no «أنت» shortcut, «دفعت لهم سابقًا» first
  await expect(sheet.getByRole("heading", { name: "أنت" })).toHaveCount(0);
  await expect(sheet.getByRole("heading", { name: "دفعت لهم سابقًا" })).toBeVisible();
  await sheet.locator('section[aria-label="دفعت لهم سابقًا"] button.bq-row').first().click();

  // the screenshot is required: the one button asks for it first
  const btn = sheet.locator(".bq-rec-foot").getByRole("button");
  await expect(btn).toHaveText("أرفق صورة التحويل");
  await sheet.locator('input[type="file"]').setInputFiles(SHOT);
  await expect(btn).not.toHaveText("أرفق صورة التحويل");
  if ((await btn.textContent())?.includes("كيف")) {
    await btn.click();
    await sheet.getByRole("radio", { name: "بنكيلي" }).click();
  }
  await expect(sheet.locator(".bq-rec-foot")).toContainText("سيُرسل");
  await expect(btn).toHaveText("أرسل إلى اللجنة");
  await btn.click();
  await expect(page.getByText("أُرسلت إلى اللجنة. ستصلك رسالة عند التأكيد.")).toBeVisible();
  // one small line, linking to «دفعاتي»
  const wait = card.getByRole("link", { name: "دفعة بانتظار التأكيد" });
  await expect(wait).toHaveAttribute("href", "/me");

  // «دفعاتي»: the submission waits, an earlier one was rejected with its reason
  await card.getByRole("link", { name: "دفعاتي" }).click();
  await expect(page.getByRole("heading", { name: "دفعاتي", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "بانتظار التأكيد" })).toBeVisible();
  await expect(page.getByText("السبب: الصورة غير واضحة")).toBeVisible();

  // the committee (demo) sees it in the queue, labelled
  await page.locator("nav").getByRole("link", { name: "اللجنة" }).first().click();
  await expect(page.getByText(/أرسلها العضو .* عبر رابطه/)).toBeVisible();
});

test("late: one «ادفع الآن» → amount and wallets → «دفعت؟ أرسل صورة التحويل» with me and my late months chosen", async ({
  page,
}) => {
  await page.goto("/m/demo2");
  const card = page.locator("section.bq-you");
  await expect(card).toContainText(/عليك 3 أشهر · 1\s500 أوقية/);
  await expect(card.getByRole("button", { name: "ادفع الآن" })).toHaveCount(1);
  await expect(card.getByRole("button", { name: "ادفع عن شخص آخر" })).toBeVisible();
  await expect(card.locator(".bq-you-cells li svg")).toHaveCount(6);

  await card.getByRole("button", { name: "ادفع الآن" }).click();
  const pay = page.getByRole("dialog", { name: "ادفع الآن" });
  await expect(pay).toContainText(/عليك 1\s500 أوقية عن 3 أشهر/);
  await expect(pay).toContainText("كيف أدفع؟");
  await pay.getByRole("button", { name: /دفعت؟ أرسل صورة التحويل/ }).click();

  const sheet = page.getByRole("dialog", { name: "أرسل صورة التحويل" });
  await expect(sheet).toContainText("الحسن ولد عبد الله");
  await expect(sheet).toContainText(/يوليو|سبتمبر/);
  await expect(sheet.locator(".bq-rec-foot").getByRole("button")).toHaveText("أرفق صورة التحويل");
});

test("«إزالة … من هذا الهاتف» forgets the link here", async ({ page }) => {
  await page.goto("/m/demo");
  await expect(page.locator("section.bq-you")).toBeVisible();
  await page.goto("/me");
  await page.getByRole("button", { name: /إزالة سيدي ولد الشيخ من هذا الهاتف/ }).click();
  await page.getByRole("button", { name: "نعم، أزِله" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(page.locator("section.bq-you")).toHaveCount(0);
  await page.goto("/me");
  await expect(page.getByText("هذه الصفحة لمن فتح رابطه الخاص")).toBeVisible();
});

test("a second person's link on the same phone: ask, add, switch, remove one", async ({ page }) => {
  await page.goto("/m/demo");
  const card = page.locator("section.bq-you");
  await expect(card).toContainText("سيدي ولد الشيخ");

  // «ابقَ باسم …» keeps the phone as it was
  await page.goto("/m/demo2");
  await expect(page).toHaveURL(/\/m\/switch$/);
  await expect(page.getByText("هذا الهاتف مفتوح باسم سيدي ولد الشيخ (أ 3).")).toBeVisible();
  await expect(page.getByText("هذا رابط الحسن ولد عبد الله (ب 6).")).toBeVisible();
  await expect(page.getByText("لا يضيع شيء: بيانات كل شخص محفوظة عند اللجنة.")).toBeVisible();
  await page.getByRole("button", { name: "ابقَ باسم سيدي ولد الشيخ" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(card).toContainText("سيدي ولد الشيخ");
  await expect(card.locator(".bq-you-sw")).toHaveCount(0);

  // «أضف … وانتقل إليه»: both on the phone, the new one active
  await page.goto("/m/demo2");
  await page.getByRole("button", { name: "أضف الحسن ولد عبد الله وانتقل إليه" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(card.getByRole("heading", { name: "الحسن ولد عبد الله" })).toBeVisible();
  await card.getByRole("button", { name: "انتقل إلى سيدي ولد الشيخ" }).click();
  await expect(card.getByRole("heading", { name: "سيدي ولد الشيخ" })).toBeVisible();

  // removing the active person keeps the other
  await page.goto("/me");
  await page.getByRole("button", { name: /إزالة سيدي ولد الشيخ من هذا الهاتف/ }).click();
  await page.getByRole("button", { name: "نعم، أزِله" }).click();
  await page.waitForURL((u) => u.pathname === "/");
  await expect(card.getByRole("heading", { name: "الحسن ولد عبد الله" })).toBeVisible();
  await expect(card.locator(".bq-you-sw")).toHaveCount(0);
});

test("committee creates a member link, shown once with the WhatsApp text", async ({ page }) => {
  await page.goto("/committee/members");
  // A-2 has no link in the fixtures
  await page.getByRole("button", { name: /^أ 2،/ }).click();
  const sheet = page.getByRole("dialog");
  const section = sheet.locator(".bq-mlink");
  await expect(section).toContainText("لا رابط له بعد");
  await section.getByRole("button", { name: "إنشاء رابط" }).click();
  await expect(section.getByText("لن يظهر الرابط مرة أخرى.", { exact: false })).toBeVisible();
  await expect(section.locator(".bq-mlink-url")).toContainText("/m/");
  const wa = section.getByRole("link", { name: /إرسال عبر واتساب/ });
  expect(decodeURIComponent((await wa.getAttribute("href")) ?? "")).toContain(
    "هذا رابطك الخاص في صندوق الرابطة:",
  );
  await section.getByRole("button", { name: "تم" }).click();
  await expect(section).toContainText("لم يُستخدم بعد");
  await section.getByRole("button", { name: "إيقاف الرابط" }).click();
  await section.getByRole("button", { name: "نعم، أوقفه" }).click();
  await expect(section).toContainText("لا رابط له بعد");
});

test("an invalid link says so calmly", async ({ page }) => {
  await page.goto("/m/invalid");
  await expect(page.getByRole("heading", { name: "هذا الرابط لم يعد يعمل" })).toBeVisible();
  await expect(page.getByText("اطلب رابطًا جديدًا من اللجنة.")).toBeVisible();
});
