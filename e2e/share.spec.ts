import { expect, test } from "@playwright/test";

// Runs against a build with fictional data: SONDOQ_FIXTURES=1 pnpm build && SONDOQ_FIXTURES=1 pnpm start.

test("receipt share falls back to a WhatsApp link when the phone cannot share files", async ({
  page,
}) => {
  // An old phone: no Web Share API. Capture window.open instead of leaving the app.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    Object.defineProperty(navigator, "canShare", { value: undefined, configurable: true });
    (window as unknown as { __opened: string[] }).__opened = [];
    window.open = ((url: string) => {
      (window as unknown as { __opened: string[] }).__opened.push(String(url));
      return null;
    }) as typeof window.open;
  });

  // committee-only app: the receipt opens from «الدفعات الأخيرة»
  await page.goto("/committee/payments");
  await page
    .getByRole("button", { name: /افتح الوصل$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "شارك الوصل" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __opened: string[] }).__opened))
    .toHaveLength(1);
  const [url] = await page.evaluate(() => (window as unknown as { __opened: string[] }).__opened);
  expect(url).toMatch(/^https:\/\/wa\.me\/(\d+)?\?text=/);
  const text = decodeURIComponent(url.split("text=")[1]);
  expect(text).toContain("وصل استلام");
  expect(text).toMatch(/رمز التحقق: \S+/);
  expect(text).toMatch(/\/r\/\S+/);
});

test("receipt share uses the share sheet with a PNG when available", async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: { name: string; type: string; size: number }[] };
    w.__shared = [];
    Object.defineProperty(navigator, "canShare", { value: () => true, configurable: true });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (d: ShareData) => {
        for (const f of d.files ?? [])
          w.__shared.push({ name: f.name, type: f.type, size: f.size });
      },
    });
  });

  // committee-only app: the receipt opens from «الدفعات الأخيرة»
  await page.goto("/committee/payments");
  await page
    .getByRole("button", { name: /افتح الوصل$/ })
    .first()
    .click();
  await page.getByRole("button", { name: "شارك الوصل" }).click();

  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared))
    .toHaveLength(1);
  const [file] = await page.evaluate(
    () =>
      (window as unknown as { __shared: { name: string; type: string; size: number }[] }).__shared,
  );
  expect(file.type).toBe("image/png");
  expect(file.name).toMatch(/^وصل-.+\.png$/);
  expect(file.size).toBeGreaterThan(20_000);
});
