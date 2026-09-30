import { describe, expect, it } from "vitest";
import {
  buildAnnual,
  buildCampaign,
  buildExpenses,
  buildGrid,
  buildHandover,
  buildLate,
  buildStatement,
  buildSummary,
  buildWallets,
  buildWork,
  refLabel,
} from "./build";
import {
  A4,
  blockHeight,
  docText,
  monthsText,
  pageRoom,
  paginate,
  PHONE,
  UNITS_NOTE,
  type Block,
  type ReportDoc,
} from "./doc";
import { drawDocPage } from "./draw";
import * as fx from "./fixtures";

/** The report's text with plain spaces (numbers use a thin space). */
const txt = (doc: ReportDoc) => docText(doc, META).replace(/[\u2009\u202f\u00a0]/g, " ");
const META = { generatedAt: "2026-09-28T10:00:00.000Z", preparedBy: "سيدي محمد" };
const ALL: [string, ReportDoc][] = [
  ["annual", buildAnnual(fx.fxAnnual)],
  ["summary", buildSummary(fx.fxSummary)],
  ["grid", buildGrid(fx.fxGrid)],
  ["late", buildLate(fx.fxLate)],
  ["expenses", buildExpenses(fx.fxExpenses)],
  ["campaign", buildCampaign(fx.fxCampaign)],
  ["levy", buildCampaign(fx.fxLevy)],
  ["member", buildStatement(fx.fxStatement)],
  ["handover", buildHandover(fx.fxHandover)],
  ["wallets", buildWallets(fx.fxWallets)],
  ["work", buildWork(fx.fxWork)],
];
/** Any formatted amount: «1 000», «45 000», «313 500». */
const AMOUNT = /\d{1,3}(?:[\s  ]\d{3})+/;

/** A canvas that records every text drawn. */
function drawn(doc: ReportDoc, size = A4): string[] {
  const texts: string[] = [];
  const noop = () => {};
  const ctx = new Proxy(
    {
      fillText: (t: string) => void texts.push(t),
      measureText: (t: string) => ({ width: t.length * 12 }),
      createLinearGradient: () => ({ addColorStop: noop }),
    } as Record<string, unknown>,
    { get: (o, k) => (k in o ? o[k as string] : noop), set: () => true },
  ) as unknown as CanvasRenderingContext2D;
  const pages = paginate(doc.blocks, size);
  pages.forEach((blocks, i) =>
    drawDocPage(ctx, doc, blocks, {
      fonts: { display: "a", body: "b" },
      size,
      meta: META,
      no: i + 1,
      of: pages.length,
    }),
  );
  return texts;
}

describe("words", () => {
  it("months as words, runs joined", () => {
    expect(monthsText([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe("يناير إلى سبتمبر");
    expect(monthsText([3, 6])).toBe("مارس ويونيو");
    expect(monthsText([1, 2, 5])).toBe("يناير وفبراير ومايو");
    expect(monthsText([1, 3, 4, 5, 9])).toBe("يناير، مارس إلى مايو وسبتمبر");
    expect(monthsText([])).toBe("");
  });
  it("member refs as on paper", () => {
    expect(refLabel("A-9")).toBe("أ 9");
    expect(refLabel("B-901")).toBe("ب 901");
  });
});

describe("paginate", () => {
  const table = (n: number): Block => ({
    t: "table",
    head: ["الاسم", "دفع"],
    rows: Array.from({ length: n }, (_, i) => [`عضو ${i}`, "✓"]),
  });

  it("splits a long table between rows, repeating its head, and loses no row", () => {
    const pages = paginate([{ t: "heading", text: "القائمة" }, table(60)], A4);
    expect(pages.length).toBeGreaterThan(1);
    const rows = pages.flat().flatMap((b) => (b.t === "table" ? b.rows : []));
    expect(rows).toHaveLength(60);
    for (const page of pages) {
      const h = page.reduce((s, b) => s + blockHeight(b, A4), 0);
      expect(h).toBeLessThanOrEqual(pageRoom(A4));
      for (const b of page) if (b.t === "table") expect(b.head).toEqual(["الاسم", "دفع"]);
    }
  });

  it("never leaves a heading alone at the bottom of a page", () => {
    const filler: Block = {
      t: "rows",
      rows: Array.from({ length: 19 }, (_, i) => ({ label: `س ${i}`, amount: 1 })),
    };
    const pages = paginate(
      [filler, { t: "heading", text: "التالي" }, { t: "bars", values: [] }],
      A4,
    );
    for (const page of pages.slice(0, -1)) expect(page[page.length - 1].t).not.toBe("heading");
  });
});

describe("the 10 reports", () => {
  it("every one renders on phone images and A4 pages, with no link, QR or receipt", () => {
    for (const [name, doc] of ALL) {
      for (const size of [PHONE, A4]) {
        const texts = drawn(doc, size);
        expect(texts.length, name).toBeGreaterThan(3);
        for (const t of texts) expect(t, name).not.toMatch(/https?:|baqie|\/r\/|وصل|رمز التحقق/);
      }
      expect(txt(doc), name).not.toMatch(/https?:|baqie|\/r\//);
    }
  });

  it("the units note once where there are amounts, never on «المتأخرات»", () => {
    for (const [name, doc] of ALL) {
      const text = txt(doc);
      if (name === "late") expect(text).not.toContain(UNITS_NOTE);
      else if (doc.hasAmounts) expect(text.split(UNITS_NOTE)).toHaveLength(2);
    }
  });

  it("annual: opening → income by source → spending by kind → closing, chart and 12 months", () => {
    const doc = buildAnnual(fx.fxAnnual);
    const text = txt(doc);
    for (const t of [
      "رصيد أول السنة: 120 000",
      "الرسوم الشهرية: 212 500",
      "اللوحات: 30 000",
      "التبرعات: 71 000",
      "*مجموع ما دخل: 313 500*",
      "التدريس: 90 000",
      "*مجموع ما صُرف: 133 500*",
      "*رصيد آخر السنة: 300 000*",
    ])
      expect(text).toContain(t);
    expect(doc.blocks.some((b) => b.t === "bars" && b.values.length === 12)).toBe(true);
    const months = doc.blocks.find((b) => b.t === "table");
    expect(months?.t === "table" && months.rows).toHaveLength(12);
  });

  it("summary of a month: the month's words and paid count", () => {
    const text = txt(buildSummary(fx.fxSummary));
    expect(text).toContain("في الصندوق أول الشهر");
    expect(text).toContain("دفع رسوم سبتمبر 47 عضوًا من 89.");
    expect(text).not.toContain("متأخر");
  });

  it("months grid: per group, a ✓ per paid month, the owner's legend", () => {
    const doc = buildGrid(fx.fxGrid);
    const grids = doc.blocks.filter((b) => b.t === "grid");
    expect(grids).toHaveLength(2);
    const first = grids[0].t === "grid" ? grids[0].rows[0] : null;
    expect(first?.paid.filter(Boolean)).toHaveLength(12);
    expect(txt(doc)).toContain("✓ مدفوع · خانة فارغة: لم يُدفع");
  });

  it("«المتأخرات»: names, months left and the levy column; no amount anywhere", () => {
    const doc = buildLate(fx.fxLate);
    expect(doc.hasAmounts).toBe(false);
    const text = txt(doc);
    expect(text).toContain("_الاسم · الأشهر الباقية · لوحة_");
    expect(text).toContain("أ 4 · الحسن ولد عبد الله · يناير إلى سبتمبر · ✓");
    expect(text).toContain("أ 5 · المختار ولد محمد · يونيو إلى سبتمبر · —");
    expect(text).toContain("ب 11 · عبد الرحمن ولد سيدي");
    for (const t of [text, ...drawn(doc)]) {
      expect(t).not.toMatch(AMOUNT);
      expect(t).not.toMatch(/أوقية|الرسوم الشهرية|المجموع/);
    }
    expect(buildLate({ ...fx.fxLate, members: [] }).blocks).toEqual([
      { t: "note", text: "لا أحد عليه متأخرات الآن." },
    ]);
  });

  it("expenses: by kind with the total, then by month newest first", () => {
    const doc = buildExpenses(fx.fxExpenses);
    const heads = doc.blocks.flatMap((b) => (b.t === "heading" ? [b.text] : []));
    expect(heads).toEqual(["حسب النوع", "سبتمبر 2026", "أغسطس 2026", "أبريل 2026"]);
    expect(txt(doc)).toContain("*المجموع: 133 500*");
    expect(buildExpenses({ ...fx.fxExpenses, items: [] }).blocks[0]).toEqual({
      t: "note",
      text: "لم يُصرف شيء في هذه الفترة.",
    });
  });

  it("campaign: target, collected, spent, what is left, who gave", () => {
    const text = txt(buildCampaign(fx.fxCampaign));
    expect(text).toContain("الهدف: 300 000");
    expect(text).toContain("*بقي في التبرع: 46 000*");
    expect(text).toContain("فاعل خير");
  });

  it("لوحة: ✓ / «لم يدفع بعد» / «معفى» per member", () => {
    const doc = buildCampaign(fx.fxLevy);
    const table = doc.blocks.find((b) => b.t === "table");
    const marks = table?.t === "table" ? table.rows.map((r) => r[1]) : [];
    expect(marks).toEqual(["✓", "✓", "✓", "لم يدفع بعد", "معفى"]);
    expect(txt(doc)).toContain("دفع 3 أعضاء، ولم يدفع بعد 1، ومعفى 1.");
  });

  it("member statement: the 12 months, confirmed payments (not cancelled), what is left", () => {
    const doc = buildStatement(fx.fxStatement);
    const months = doc.blocks.find((b) => b.t === "months");
    expect(months?.t === "months" && months.paid.filter(Boolean)).toHaveLength(5);
    const text = txt(doc);
    expect(text).toContain("رسوم يناير إلى مارس (2 مارس 2026 · سجّلها سيدي محمد): 3 000");
    expect(text).not.toContain("سُجّلت مرتين");
    expect(text).toContain("رسوم يونيو إلى سبتمبر: 4 000");
    expect(text).toContain("لوحة لوحة العيد: 2 000");
  });

  it("handover: the balance handed over, where the money is, two signatures", () => {
    const doc = buildHandover(fx.fxHandover);
    const text = txt(doc);
    expect(text).toContain("*الرصيد الذي يُسلَّم: 300 000*");
    expect(text).toContain("*المجموع المعدود: 300 000*");
    expect(doc.blocks.at(-1)).toEqual({
      t: "sign",
      right: "سلّم: سيدي محمد",
      left: "استلم: ………………",
    });
  });

  it("wallets: money in per wallet and cash; no «خرج» column until expenses name a wallet", () => {
    const doc = buildWallets(fx.fxWallets);
    const table = doc.blocks.find((b) => b.t === "table");
    expect(table?.t === "table" && table.head).toEqual(["المحفظة", "الدفعات", "دخل"]);
    expect(table?.t === "table" && table.foot?.[2].replace(/\D/g, "")).toBe("313500");
    const withOut = buildWallets({
      ...fx.fxWallets,
      wallets: fx.fxWallets.wallets.map((w) => ({ ...w, out: 1000, balance: 5000 })),
      cash: { ...fx.fxWallets.cash, out: 2000, balance: 73_000 },
      unspecifiedOut: 3000,
    });
    const t2 = withOut.blocks.find((b) => b.t === "table");
    expect(t2?.t === "table" && t2.head).toEqual(["المحفظة", "الدفعات", "دخل", "خرج", "الرصيد"]);
    const rows = t2?.t === "table" ? t2.rows.map((r) => r.map((c) => c.replace(/\D/g, ""))) : [];
    expect(rows.at(-2)).toEqual(["", "60", "75000", "2000", "73000"]); // cash
    expect(t2?.t === "table" && t2.rows.at(-1)?.[0]).toBe("مصاريف قبل تسمية المحفظة");
    // out: 3 wallets × 1 000 + cash 2 000 + before-wallets 3 000; balance: 3 × 5 000 + 73 000
    expect(t2?.t === "table" && t2.foot?.slice(3).map((c) => c.replace(/\D/g, ""))).toEqual([
      "8000",
      "88000",
    ]);
  });

  it("committee work: who recorded what, the inactive without activity left out, what was cancelled", () => {
    const doc = buildWork(fx.fxWork);
    const table = doc.blocks.find((b) => b.t === "table");
    expect(table?.t === "table" && table.rows.map((r) => r[0])).toEqual(["سيدي محمد", "يحيى"]);
    expect(txt(doc)).toContain(
      "دفعة المختار ولد محمد (ألغاه سيدي محمد · 1 يونيو 2026 · سُجّلت مرتين): 1 000",
    );
  });

  it("file names per report and period", () => {
    expect(ALL.map(([, d]) => d.fileBase)).toEqual([
      "التقرير-السنوي-2026",
      "الملخص-2026-09",
      "جدول-الأشهر-2026",
      "المتأخرات-2026",
      "المصاريف-2026",
      "تبرع-ترميم-المسجد",
      "لوحة-لوحة-العيد",
      "كشف-المختار-ولد-محمد-2026",
      "التسليم-الدورة-2",
      "المحافظ-2026",
      "عمل-اللجنة-2026",
    ]);
  });
});
