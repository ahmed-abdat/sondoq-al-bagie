import { describe, expect, it } from "vitest";
import {
  buildAnnual,
  buildCampaign,
  buildExpenses,
  buildGrid,
  buildHandover,
  buildLate,
  buildStatement,
  buildStats,
  buildSummary,
  buildWallets,
  buildWork,
  daysWord,
  refLabel,
} from "./build";
import {
  A4,
  blockHeight,
  docText,
  monthsText,
  pageRoom,
  paginate,
  percent,
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
  ["stats", buildStats(fx.fxStats)],
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
      "الإحصاءات-2026",
    ]);
  });
});

describe("«الإحصاءات»", () => {
  it("percent: whole numbers, never 100٪ with someone missing, never 0٪ once someone paid", () => {
    expect(percent(42, 88)).toBe("48٪");
    expect(percent(995, 1000)).toBe("99٪");
    expect(percent(1, 1000)).toBe("1٪");
    expect(percent(0, 88)).toBe("0٪");
    expect(percent(88, 88)).toBe("100٪");
    expect(percent(3, 0)).toBe("—");
  });
  it("days as words", () => {
    expect([1, 2, 5, 10, 12, 100].map(daysWord)).toEqual([
      "يوم واحد",
      "يومين",
      "5 أيام",
      "10 أيام",
      "12 يومًا",
      "100 يوم",
    ]);
  });

  const doc = buildStats(fx.fxStats);
  // without the direction marks that keep amounts left to right inside a sentence
  const text = txt(doc).replace(/[\u2066-\u2069]/g, "");
  it("fees first: paid up to the month, by group, each month, who still owes, last year", () => {
    expect(doc.subtitle).toBe("سنة 2026 · حتى سبتمبر");
    expect(text).toContain("*48٪* دفعوا حتى سبتمبر: 42 من 88 عضوًا.");
    expect(text).toContain("المجموعة أ: 55٪ (22 من 40)");
    expect(text).toContain("المجموعة ب: 42٪ (20 من 48)");
    expect(text).toContain("يناير 80، فبراير 78");
    // months not started yet are not counted
    expect(text).toContain("سبتمبر 42");
    expect(text).not.toContain("أكتوبر 5");
    expect(text).toContain("شهر واحد: 18");
    expect(text).toContain("شهران أو 3: 16");
    expect(text).toContain("4 أشهر أو أكثر: 12");
    expect(text).toContain("السنة الماضية في مثل هذا الوقت: 55٪ دفعوا.");
  });
  it("the owing buckets and the paid-up add up to the active members", () => {
    const o = fx.fxStats.fees.overall;
    expect(o.paidUp + o.owe1 + o.owe2to3 + o.owe4plus).toBe(o.active);
  });
  it("each لوحة and تبرع: counts, percentages and money, no names", () => {
    expect(text).toContain("*لوحة العيد*");
    expect(text).toContain("*40٪* دفعوا نصيبهم. فُتحت قبل 12 يومًا.");
    expect(text).toContain("دفعوا: 34");
    expect(text).toContain("لم يدفعوا بعد: 50");
    expect(text).toContain("معفون: 4");
    expect(text).toContain("جُمع 68 000 من 168 000 أوقية.");
    expect(text).toContain("*تبرع: ترميم المصلى*");
    expect(text).toContain("أوقية جُمعت من هدف 150 000 (43٪).");
    expect(text).toContain("تبرّع 25٪ من أعضاء الرابطة.");
    for (const name of [...new Set(fx.fxLevy.shares!.map((s) => s.fullName))])
      expect(text).not.toContain(name);
  });
  it("a past year: «السنة كاملة», all 12 months counted", () => {
    const past = buildStats({
      ...fx.fxStats,
      fees: { ...fx.fxFeeStats, year: 2025, refMonth: 12 },
      previous: null,
      levies: [],
      donations: [],
    });
    expect(past.subtitle).toBe("سنة 2025");
    expect(past.hasAmounts).toBe(false);
    expect(txt(past)).toContain("دفعوا السنة كاملة");
    expect(txt(past)).toContain("ديسمبر 2");
    expect(txt(past)).not.toContain("السنة الماضية");
  });
  it("nobody owing says so instead of three zeros", () => {
    const o = { ...fx.fxFeeStats.overall, paidUp: 88, owe1: 0, owe2to3: 0, owe4plus: 0 };
    const t = txt(buildStats({ ...fx.fxStats, fees: { ...fx.fxFeeStats, overall: o } }));
    expect(t).toContain("لا أحد عليه رسوم.");
    expect(t).toContain("*100٪*");
  });
  it("a لوحة or تبرع section is never split between two pages", () => {
    for (const size of [PHONE, A4]) {
      const pages = paginate(doc.blocks, size);
      for (const title of ["لوحة العيد", "تبرع: ترميم المصلى"]) {
        const at = pages.findIndex((pg) => pg.some((b) => b.t === "heading" && b.text === title));
        const after = pages[at].slice(
          pages[at].findIndex((b) => b.t === "heading" && b.text === title),
        );
        expect(after.some((b) => b.t === "big")).toBe(true);
        expect(after.filter((b) => b.t === "tiles").length).toBeGreaterThan(0);
      }
      for (const pg of pages)
        expect(pg.reduce((s, b) => s + blockHeight(b, size), 0)).toBeLessThanOrEqual(
          pageRoom(size),
        );
    }
  });
  it("drawn on the page: the figures, the month numbers, the counts", () => {
    const texts = drawn(doc, PHONE);
    for (const t of ["48٪", "55٪", "42٪", "40٪", "43٪"])
      expect(texts.some((x) => x.includes(t))).toBe(true);
    for (let m = 1; m <= 12; m++) expect(texts).toContain(String(m));
  });
  it("the campaign report opens with its figures and drops the repeated levy line", () => {
    const levy = txt(buildCampaign(fx.fxLevy, fx.fxLevyStats));
    expect(levy).toContain("*40٪* دفعوا نصيبهم.");
    expect(levy).not.toContain("ولم يدفع بعد");
    expect(levy.match(/جُمع/g)).toHaveLength(1);
    expect(txt(buildCampaign(fx.fxLevy))).toContain("ولم يدفع بعد");
    const gift = txt(buildCampaign(fx.fxCampaign, fx.fxDonationStats));
    expect(gift).toContain("تبرّعوا: 27");
  });
});
