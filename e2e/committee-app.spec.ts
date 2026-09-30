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
    "التدريس المحظري",
    "تكريم الناجحين",
    "الفريق الرياضي",
    "أخرى",
  ]);
});

test("«المصاريف»: each expense says its activity, wallet and who recorded it", async ({ page }) => {
  await page.goto("/committee/expenses");
  const first = page.locator(".pa-rows li").first();
  await expect(first).toContainText(/التدريس المحظري|تكريم الناجحين|الفريق الرياضي|أخرى/);
  await expect(first).toContainText(/بنكيلي|مصرفي|نقدًا/);
  await expect(first).toContainText(/سجّله /);
});

test("«المحافظ» (one pot): one row per wallet, no balance; one sheet adds a wallet with its number, stops it", async ({
  page,
}) => {
  await page.goto("/committee/settings");
  const ws = page.getByRole("region", { name: "المحافظ" });
  // a row: name, number and holder; no account buttons in the list
  await expect(ws.getByText("22200000011")).toBeVisible();
  await expect(
    ws.getByRole("button", { name: /أوقف الحساب|حدّد رصيد|أضف حسابًا|حوّل/ }),
  ).toHaveCount(0);
  await expect(ws.getByText(/الرصيد الآن/)).toHaveCount(0);

  // a new wallet with its number in one sheet
  await ws.getByRole("button", { name: "محفظة جديدة" }).click();
  let sheet = page.getByRole("dialog", { name: "محفظة جديدة" });
  await sheet.getByLabel("اسم المحفظة").fill("محفظة التجربة");
  await sheet.getByLabel("رقم الحساب").fill("22000099");
  await sheet.getByLabel("اسم صاحب الحساب").fill("رابطة شباب البقيع");
  await sheet.getByRole("button", { name: "أضف المحفظة" }).click();
  await expect(ws.getByText("محفظة التجربة", { exact: true })).toBeVisible();
  await expect(ws.getByText("22000099")).toBeVisible();

  // stop one from its sheet (a wallet without a number waits in «محافظ بلا رقم»)
  await ws.getByText(/^محافظ بلا رقم/).click();
  await ws.getByRole("button", { name: "عدّل كليك" }).click();
  sheet = page.getByRole("dialog", { name: "عدّل المحفظة" });
  await sheet.getByRole("button", { name: "أوقف المحفظة" }).click();
  await sheet.getByRole("button", { name: "نعم، أوقفها" }).click();
  await ws.getByText(/^محافظ متوقفة/).click();
  await expect(ws.getByRole("button", { name: "أعِد كليك" })).toBeVisible();

  // the expense sheet offers the wallets that have an account, and cash
  await page.goto("/committee/expenses");
  await page.getByRole("button", { name: /سجّل مصروفًا/ }).click();
  const exp = page.getByRole("dialog", { name: "سجّل مصروفًا" });
  await expect(exp.getByRole("radiogroup", { name: "المحفظة" }).getByRole("radio")).toHaveText([
    "بنكيلي",
    "مصرفي",
    "نقدًا",
  ]);
});

test("a new committee account is linked to a member with the shared member search", async ({
  page,
}) => {
  await page.goto("/committee/settings");
  await page.getByRole("button", { name: "إضافة حساب" }).click();
  const add = page.getByRole("dialog", { name: "إضافة حساب" });
  await add.getByRole("button", { name: "اختر العضو" }).click();
  const pick = page.getByRole("dialog", { name: "اختر العضو" });
  await pick.getByLabel("ابحث عن العضو").fill("أ4");
  await pick.getByRole("button", { name: /الشيخ ولد سيدي/ }).click();
  await expect(pick).toBeHidden();
  await expect(add.getByText("الشيخ ولد سيدي")).toBeVisible();
});

test("«غيّر الرقم» in the wallet's sheet: a new number, the old one keeps its payments", async ({
  page,
}) => {
  await page.goto("/committee/settings");
  const ws = page.getByRole("region", { name: "المحافظ" });
  // a new number: the old one stops, its payments stay
  await ws.getByRole("button", { name: "عدّل بنكيلي" }).click();
  const ed = page.getByRole("dialog", { name: "عدّل المحفظة" });
  await ed.getByRole("button", { name: "غيّر الرقم" }).click();
  await ed.getByLabel("رقم الحساب").fill("22000077");
  await expect(ed.getByRole("radio", { name: "رقم جديد" })).toHaveAttribute("aria-checked", "true");
  await ed.getByRole("button", { name: "احفظ" }).click();
  await expect(ws.getByText("22000077")).toBeVisible();
});

test("a payment's note (why it differs from the picture) shows in the member's history", async ({
  page,
}) => {
  await page.goto("/committee/members/A-1");
  await expect(page.locator(".pa-hist-note")).toContainText("يختلف عن الصورة: الباقي يُدفع نقدًا");
});

test("«الفئات»: a mid-year month warns; «ابدأ من يناير» really moves the start to January", async ({
  page,
}) => {
  await page.goto("/committee/settings");
  const groups = page.getByRole("region", { name: "الفئات والمستحقات الشهرية" });
  await groups.getByRole("button", { name: "انقل أعضاءها" }).last().click();
  const sheet = page.getByRole("dialog", { name: "انقل أعضاء إلى فئة" });
  await sheet.getByRole("button", { name: "ابتداءً من شهر" }).click();
  const pick = page.getByRole("dialog", { name: "ابتداءً من شهر" });
  await pick.getByRole("button", { name: "السنة السابقة" }).click();
  await pick.getByRole("button", { name: "أكتوبر" }).click();
  await expect(pick).toBeHidden();
  await expect(sheet.getByRole("button", { name: "ابتداءً من شهر" })).toContainText("أكتوبر 2026");
  await sheet.getByRole("button", { name: /ابدأ من يناير 2027/ }).click();
  await expect(sheet.getByRole("button", { name: "ابتداءً من شهر" })).toContainText("يناير 2027");
  await expect(sheet.getByRole("button", { name: /ابدأ من يناير/ })).toHaveCount(0);
  // the picker opens on the chosen month, not the old one
  await sheet.getByRole("button", { name: "ابتداءً من شهر" }).click();
  const again = page.getByRole("dialog", { name: "ابتداءً من شهر" });
  await expect(again.getByRole("button", { name: "يناير" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(again.getByRole("button", { name: "أكتوبر" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});
