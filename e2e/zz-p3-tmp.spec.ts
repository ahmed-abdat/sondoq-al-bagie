import { test } from "@playwright/test";
const SP = process.env.SP!;
const pages = (process.env.PAGES ?? "/committee").split(",");
test.use({ viewport: { width: 390, height: 844 } });
for (const p of pages)
  test(p, async ({ page }) => {
    const errs: string[] = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await page.goto(p);
    await page.waitForTimeout(700);
    await page.screenshot({ path: `${SP}/p3/${p.replace(/[/?=&]/g, "_")}.png`, fullPage: true });
    console.log(p, "sw", await page.evaluate(() => document.documentElement.scrollWidth), errs.join(" | "));
  });
