// Accuracy (plan §12): the numbers each committee screen shows, read off the screen, and the same
// numbers from the database (the committee's own session, the app's rules). Found by roles,
// labels and words, like a person reading the phone.
import { expect, type Page } from "@playwright/test";
import { asCommittee, openPage } from "./steps";

/** «294 000» (thin spaces, direction marks) → 294000. */
export const toNumber = (s: string) => Number(s.replace(/[^\d]/g, ""));
const clean = (s: string) => s.replace(/[   ⁦-⁩‎‏]/g, " ");

export type Truth = {
  balance: number;
  paidUp: number;
  active: number;
};

/** What the database says now: the fund balance and the year's fees (report_fee_stats). */
export async function truth(): Promise<Truth> {
  const c = await asCommittee("treasurer");
  const fund = await c.from("fund_summary").select("balance").maybeSingle();
  expect(fund.error).toBeNull();
  const fees = await c.rpc("report_fee_stats", { p_year: new Date().getUTCFullYear() });
  expect(fees.error).toBeNull();
  const overall = (fees.data as { overall: { paid_up: number; active: number } }).overall;
  return {
    balance: Number(fund.data?.balance ?? NaN),
    paidUp: Number(overall.paid_up),
    active: Number(overall.active),
  };
}

export type Home = {
  balance: number;
  monthIn: number;
  monthOut: number;
  paidUp: number;
  active: number;
  pct: string;
};

/** Home: «في الصندوق», «هذا الشهر: دخل … · صرف …», «دفع … من … حتى … · …٪». */
export async function home(page: Page): Promise<Home> {
  await openPage(page, "/committee");
  const hero = page.getByRole("region", { name: "الصندوق" });
  await expect(hero).toContainText("في الصندوق");
  const text = clean(await hero.innerText());
  const bal = /في الصندوق\s*([\d\s]+)\s*أوقية/.exec(text);
  const month = /دخل\s*([\d\s]+)\s*·\s*صرف\s*([\d\s]+)/.exec(text);
  const feesLink = page.locator("a.pb-month"); // «دفع … من … حتى … · …٪», to «الإحصاءات»
  await expect(feesLink).toBeVisible();
  const feesLine = clean(await feesLink.innerText());
  const fees = /دفع\s*([\d\s]+?)\s*من\s*([\d\s]+?)\s*حتى.*?(\d+٪)/.exec(feesLine);
  expect(bal, text).not.toBeNull();
  expect(month, text).not.toBeNull();
  expect(fees, feesLine).not.toBeNull();
  return {
    balance: toNumber(bal![1]),
    monthIn: toNumber(month![1]),
    monthOut: toNumber(month![2]),
    paidUp: toNumber(fees![1]),
    active: toNumber(fees![2]),
    pct: fees![3],
  };
}

/** «الإحصاءات» page: «دفعوا … حتى …: X من Y عضوًا.» and its big «…٪». */
export async function statsPage(page: Page) {
  await openPage(page, "/committee/stats");
  const card = page.getByRole("region", { name: /^الرسوم الشهرية/ });
  const text = clean(await card.innerText());
  const m = /دفعوا.*?:\s*([\d\s]+?)\s*من\s*([\d\s]+?)\s*عضو/.exec(text);
  const p = /(\d+٪)/.exec(text);
  expect(m, text).not.toBeNull();
  return { paidUp: toNumber(m![1]), active: toNumber(m![2]), pct: p![1] };
}

/** A report from «التقارير» as its WhatsApp text («نص», copied). */
export async function reportText(page: Page, name: RegExp): Promise<string> {
  await openPage(page, "/committee/reports");
  await page.getByRole("button", { name }).click();
  await expect(page.getByRole("img", { name: /صفحة 1 من \d+/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "نص", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText(/نُسخ نص التقرير/);
  return clean(await page.evaluate(() => navigator.clipboard.readText()));
}

/** A member's page: how many months of this year are ticked. */
export async function memberMonths(page: Page, ref: string): Promise<number> {
  await openPage(page, `/committee/members/${ref}`);
  const grid = page.getByRole("table", { name: "أشهر السنة" });
  await expect(grid).toBeVisible();
  return grid.getByLabel("مدفوع", { exact: true }).count();
}
