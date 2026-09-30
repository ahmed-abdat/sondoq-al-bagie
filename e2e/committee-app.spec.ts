import { expect, test } from "@playwright/test";

// The new committee screens (/committee/*) on the demo committee (fixtures build).

test("members: search by paper number, then the member's «كشف حساب»", async ({ page }) => {
  await page.goto("/committee/members");
  await page.getByLabel("ابحث عن عضو").fill("أ4");
  await page.getByRole("link", { name: /الشيخ ولد سيدي/ }).click();
  await expect(page).toHaveURL(/\/committee\/members\/A-4$/);
  await expect(page.getByRole("heading", { name: "ما عليه الآن" })).toBeVisible();
  await expect(page.locator(".pa-dl-owe")).toContainText("نوفمبر وديسمبر 2025");
  await page.getByRole("button", { name: /شارك الكشف/ }).click();
  const sheet = page.getByRole("dialog", { name: "شارك كشف الحساب" });
  await expect(sheet.getByRole("button", { name: /صور لواتساب/ })).toBeVisible();
  await expect(sheet.getByRole("img").first()).toBeVisible({ timeout: 15_000 });
});

test("a member's payments say who recorded them; «مسؤول» can cancel with a reason", async ({
  page,
}) => {
  await page.goto("/committee/members/A-1");
  const pay = page.locator(".pa-hist li").first();
  await expect(pay).toContainText("سجّلها");
  await pay.getByRole("button", { name: "ألغِ الدفعة" }).click();
  const sheet = page.getByRole("dialog", { name: "ألغِ الدفعة" });
  await expect(sheet.getByRole("button", { name: "اختر السبب" })).toBeDisabled();
  await sheet.getByRole("radio", { name: "دفعة مكررة" }).click();
  await sheet.getByRole("button", { name: "ألغِ الدفعة" }).click();
  await expect(page.getByText("أُلغيت الدفعة")).toBeVisible();
});

test("«الفئات»: move a group's members from January next year, with a preview", async ({
  page,
}) => {
  await page.goto("/committee/settings");
  const groups = page.getByRole("region", { name: "الفئات والمستحقات الشهرية" });
  await groups.getByRole("button", { name: "انقل أعضاءها" }).last().click();
  const sheet = page.getByRole("dialog", { name: "انقل أعضاء إلى فئة" });
  await expect(sheet.getByRole("button", { name: "ابتداءً من شهر" })).toContainText("يناير 2027");
  await sheet.getByRole("button", { name: "راجع النقل" }).click();
  await expect(sheet.getByRole("status")).toContainText(
    /سينتقل .+ إلى الفئة .+ ابتداءً من يناير 2027/,
  );
  await sheet.getByRole("button", { name: "انقل", exact: true }).click();
  await expect(page.getByText(/انتقل .+ إلى الفئة/)).toBeVisible();
});

test("a new لوحة on chosen members uses the shared member picker", async ({ page }) => {
  await page.goto("/committee/campaigns");
  await page.getByRole("radio", { name: /لوحات/ }).click();
  await page.getByRole("button", { name: "لوحة جديدة" }).click();
  const sheet = page.getByRole("dialog", { name: "لوحة جديدة" });
  await sheet.getByLabel("العنوان").fill("لوحة تجربة");
  await sheet.getByLabel("المبلغ على كل عضو").fill("500");
  await sheet.getByRole("radio", { name: "أختارهم" }).click();
  const find = sheet.getByLabel("أضف عضوًا");
  await find.fill("ب 2");
  await sheet
    .getByRole("button", { name: /عبد الله ولد الشيخ/ })
    .first()
    .click();
  await find.fill("");
  await expect(sheet.getByText("من اخترتهم:")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "أنشئ اللوحة على عضو واحد" })).toBeEnabled();
});

test("a new member's statement in التقارير: the shared member picker", async ({ page }) => {
  await page.goto("/committee/reports");
  await page.getByRole("button", { name: /كشف عضو/ }).click();
  const sheet = page.getByRole("dialog", { name: "كشف أي عضو؟" });
  await sheet.getByLabel("ابحث عن العضو").fill("أ4");
  await sheet.getByRole("button", { name: /الشيخ ولد سيدي/ }).click();
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("button", { name: /الشيخ ولد سيدي/ })).toBeVisible();
});

test("«النشاط»: «المسؤول» adds, renames and stops one; the expense sheet offers the active ones", async ({
  page,
}) => {
  await page.goto("/committee/settings");
  const acts = page.getByRole("region", { name: "النشاط" });
  await acts.getByLabel("اسم النشاط الجديد").fill("رحلة الشباب");
  await acts.getByRole("button", { name: "أضف" }).click();
  await expect(acts.getByText("رحلة الشباب")).toBeVisible();
  await acts.getByRole("button", { name: "غيّر اسم رحلة الشباب" }).click();
  await acts.getByLabel("الاسم الجديد لـ رحلة الشباب").fill("رحلة الصيف");
  await acts.getByRole("button", { name: "احفظ" }).click();
  await expect(acts.getByText("رحلة الصيف")).toBeVisible();
  await acts.getByRole("button", { name: "أوقف رحلة الصيف" }).click();
  await acts.getByRole("button", { name: "نعم، أوقف رحلة الصيف" }).click();
  await expect(acts.getByRole("heading", { name: "نشاط متوقف" })).toBeVisible();
  await expect(acts.getByRole("button", { name: "أعِد رحلة الصيف" })).toBeVisible();

  await page.goto("/committee/expenses");
  await page.getByRole("button", { name: /سجّل مصروفًا/ }).click();
  const sheet = page.getByRole("dialog", { name: "سجّل مصروفًا" });
  await expect(sheet.getByRole("radiogroup", { name: "النشاط" }).getByRole("radio")).toHaveText([
    "التدريس المحوري",
    "تكريم الناجحين",
    "الفريق الرياضي",
    "أخرى",
  ]);
});

test("«المصاريف»: each expense says its activity, wallet and who recorded it", async ({ page }) => {
  await page.goto("/committee/expenses");
  const first = page.locator(".pa-rows li").first();
  await expect(first).toContainText(/التدريس المحوري|تكريم الناجحين|الفريق الرياضي|أخرى/);
  await expect(first).toContainText(/بنكيلي|مصرفي|نقدًا/);
  await expect(first).toContainText(/سجّله /);
});

test("«المحافظ»: «المسؤول» adds a wallet and an account, sets an opening once; payments offer them", async ({
  page,
}) => {
  await page.goto("/committee/settings");
  const ws = page.getByRole("region", { name: "المحافظ" });
  // an opening, set once (the confirmation box is required)
  await ws.getByRole("button", { name: "حدّد رصيد أولها" }).first().click();
  const open = page.getByRole("dialog", { name: "رصيد أول الحساب" });
  await open.getByLabel("رصيد أول بالأوقية").fill("12000");
  await expect(open.getByRole("button", { name: "احفظ الرصيد" })).toBeDisabled();
  await open.getByRole("checkbox").check();
  await open.getByRole("button", { name: "احفظ الرصيد" }).click();
  await expect(page.getByText("حُفظ رصيد أول الحساب.")).toBeVisible();
  await expect(ws.getByText(/رصيد أول: 12\s000 أوقية/)).toBeVisible();

  // a new wallet, then its account
  await ws.getByRole("button", { name: "محفظة جديدة" }).click();
  const nw = page.getByRole("dialog", { name: "محفظة جديدة" });
  await nw.getByLabel("اسم المحفظة").fill("محفظة التجربة");
  await nw.getByRole("button", { name: "أضف المحفظة" }).click();
  await expect(ws.getByText("محفظة التجربة", { exact: true })).toBeVisible();
  await ws.getByRole("button", { name: "أضف حسابًا في محفظة التجربة" }).click();
  const acc = page.getByRole("dialog", { name: "أضف حسابًا" });
  await acc.getByLabel("رقم الحساب").fill("22000099");
  await acc.getByLabel("اسم صاحب الحساب").fill("رابطة شباب البقيع");
  await acc.getByRole("button", { name: "أضف الحساب" }).click();
  await expect(ws.getByText("22000099")).toBeVisible();

  // stop one, bring it back
  await ws.getByRole("button", { name: "أوقف كليك" }).click();
  await ws.getByRole("button", { name: "نعم، أوقف كليك" }).click();
  await expect(ws.getByRole("button", { name: "أعِد كليك" })).toBeVisible();

  // the expense sheet offers the wallets that have an account, and cash
  await page.goto("/committee/expenses");
  await page.getByRole("button", { name: /سجّل مصروفًا/ }).click();
  const sheet = page.getByRole("dialog", { name: "سجّل مصروفًا" });
  await expect(sheet.getByRole("radiogroup", { name: "المحفظة" }).getByRole("radio")).toHaveText([
    "بنكيلي",
    "مصرفي",
    "نقدًا",
  ]);
});
