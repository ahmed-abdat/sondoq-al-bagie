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
  shareText,
  UNITS_NOTE,
  type Block,
  type ReportDoc,
} from "./doc";
import { drawDocPage } from "./draw";
import * as fx from "./fixtures";

/** The report's text with plain spaces (numbers use a thin space). */
const txt = (doc: ReportDoc) => docText(doc, META).replace(/[\u2009\u202f\u00a0]/g, " ");
const fmtN = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
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

  it("the closing total never ends a page without its split", () => {
    for (const size of [PHONE, A4]) {
      const pages = paginate(buildAnnual(fx.fxAnnual).blocks, size);
      const at = pages.findIndex((pg) =>
        pg.some((b) => b.t === "rows" && b.total?.label === "المجموع آخر السنة"),
      );
      const txtOf = (pg: Block[]) => JSON.stringify(pg);
      expect(txtOf(pages[at])).toContain("منها في الصندوق");
      expect(txtOf(pages[at])).toContain("منها لدى التبرعات واللوحات");
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
      "المستحقات الشهرية: 212 500",
      "اللوحات: 30 000",
      "التبرعات: 71 000",
      "*مجموع المداخيل: 313 500*",
      "التدريس المحظري: 90 000",
      "*مجموع المصاريف: 133 500*",
      "*المجموع آخر السنة: 300 000*",
      // split so that «في الصندوق» is the fund alone, the same number as home
      "منها في الصندوق: 254 000",
      "منها لدى التبرعات واللوحات: 46 000",
    ])
      expect(text).toContain(t);
    const noCampaigns = txt(buildAnnual({ ...fx.fxAnnual, campaignsHeld: 0 }));
    expect(noCampaigns).toContain("*رصيد آخر السنة: 300 000*");
    expect(noCampaigns).not.toContain("منها في الصندوق");
    expect(doc.blocks.some((b) => b.t === "bars" && b.values.length === 12)).toBe(true);
    // owner: the chart and the table by the month the fees pay for, expenses by date
    expect(text).toContain("*المداخيل حسب الشهر المستحق*");
    const bars = doc.blocks.find((b) => b.t === "bars");
    expect(bars?.t === "bars" && bars.values).toEqual(fx.fxAnnual.months.map((m) => m.dueIncome));
    expect(text).toContain("*المجموع · 307 500 · 133 500*");
    expect(text.replace(/[\u2066-\u2069]/g, "")).toContain(
      "لا يظهر هنا 6 000 دُفعت هذه السنة لمستحقات سنة أخرى.",
    );
    // the chart adds up: by date − other years' months + this year's months paid in another year
    const due = fx.fxAnnual.incomeDue;
    expect(fx.fxAnnual.months.reduce((s, m) => s + m.dueIncome, 0)).toBe(due.total);
    expect(due.total).toBe(fx.fxAnnual.income.total - due.feesForOtherMonths + due.feesPaidOutside);
    const months = doc.blocks.find((b) => b.t === "table");
    expect(months?.t === "table" && months.rows).toHaveLength(12);
  });

  it("summary of a month: the month's words and paid count", () => {
    const text = txt(buildSummary(fx.fxSummary));
    expect(text).toContain("في الصندوق أول الشهر");
    // the total adds up; «في الصندوق» is the fund alone, the same number as home
    const closing = fx.fxSummary.closing;
    expect(text).toContain(`*المجموع آخر الشهر: ${fmtN(closing)}*`);
    expect(text).toContain(`منها في الصندوق: ${fmtN(closing - 46_000)}`);
    expect(text).toContain("منها لدى التبرعات واللوحات: 46 000");
    const none = txt(buildSummary({ ...fx.fxSummary, campaignsHeld: 0 }));
    expect(none).toContain(`*في الصندوق آخر الشهر: ${fmtN(closing)}*`);
    expect(text).toContain("دفع مستحقات شهر سبتمبر 47 عضوًا من 89.");
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

  it("«المتأخرات»: a paper grid per الفئة, names only, ✓ / empty / «—», no number or amount", () => {
    const doc = buildLate(fx.fxLate);
    expect(doc.hasAmounts).toBe(false);
    expect(doc.subtitle).toBe("سنة 2026 · الدورة 1");
    const pages = paginate(doc.blocks, A4);
    // one section per الفئة, each on its own page(s)
    const sectionOf = (pg: Block[]) =>
      pg.find((b) => b.t === "heading" && b.section)?.t === "heading"
        ? (pg.find((b) => b.t === "heading" && b.section) as { text: string }).text
        : null;
    expect(pages.map(sectionOf)).toEqual(["الفئة أ", "الفئة ب"]);
    const grids = doc.blocks.filter((b) => b.t === "grid");
    const rows = grids.flatMap((g) => (g.t === "grid" ? g.rows : []));
    const row = (name: string) => rows.find((r) => r.name === name)!;
    // A-5: Jan–May paid, the rest empty
    expect(row("المختار ولد محمد").paid.slice(0, 6)).toEqual([true, true, true, true, true, false]);
    // B-8 joined in April: January–March «—», never empty (it must not look unpaid)
    expect(row("باب ولد عبد الله").none?.slice(0, 4)).toEqual([true, true, true, false]);
    expect(row("باب ولد عبد الله").paid.some(Boolean)).toBe(false);
    const text = txt(doc);
    expect(text).toContain("✓ مدفوع · خانة فارغة: لم يُدفع · —: غير مستحق عليه");
    expect(text).toContain("لم يُدفع بعد نصيب لوحة ترميم المسجد: الحسن ولد عبد الله.");
    // the text: the names per الفئة, nothing else
    expect(text).toMatch(/\*الفئة أ\*[\s\S]*\nالحسن ولد عبد الله\nالمختار ولد محمد\n/);
    for (const t of [text, ...drawn(doc)]) {
      expect(t).not.toMatch(AMOUNT);
      expect(t).not.toMatch(/أوقية|المستحقات الشهرية|المجموع/);
      expect(t).not.toMatch(/[AB]-\d|عضو/);
    }
    // the band says which الفئة («المتأخرات · الفئة أ»)
    expect(drawn(doc)).toEqual(
      expect.arrayContaining(["المتأخرات · الفئة أ", "المتأخرات · الفئة ب"]),
    );
    expect(buildLate({ ...fx.fxLate, members: [] }).blocks).toEqual([
      { t: "note", text: "لا أحد عليه متأخرات الآن." },
    ]);
  });

  it("«المتأخرات»: months owed from an earlier year are named under the grid", () => {
    const m = { ...fx.fxLate.members[3], lateMonths: ["2025-11", "2025-12"], levies: [] };
    const text = txt(buildLate({ ...fx.fxLate, members: [m] }));
    expect(text).toContain("عليهم متأخرات من سنة 2025: عبد الرحمن ولد سيدي.");
  });

  it("«المتأخرات»: a long الفئة runs onto more pages, its title on each, no name lost", () => {
    const many = Array.from({ length: 70 }, (_, i) => ({
      ...fx.fxLate.members[1],
      fullName: `عضو تجريبي ${i}`,
    }));
    const doc = buildLate({ ...fx.fxLate, members: many });
    const pages = paginate(doc.blocks, A4);
    expect(pages.length).toBeGreaterThan(1);
    for (const pg of pages)
      expect(pg[0]).toMatchObject({ t: "heading", section: true, text: "الفئة أ" });
    const names = pages.flat().flatMap((b) => (b.t === "grid" ? b.rows.map((r) => r.name) : []));
    expect(names).toHaveLength(70);
  });

  it("expenses: by kind with the total, then by month newest first", () => {
    const doc = buildExpenses(fx.fxExpenses);
    const heads = doc.blocks.flatMap((b) => (b.t === "heading" ? [b.text] : []));
    expect(heads).toEqual(["حسب النشاط", "سبتمبر 2026", "أغسطس 2026", "أبريل 2026"]);
    expect(txt(doc)).toContain("*المجموع: 133 500*");
    expect(buildExpenses({ ...fx.fxExpenses, items: [] }).blocks[0]).toEqual({
      t: "note",
      text: "لا مصاريف في هذه الفترة.",
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
    expect(text).toContain("مستحقات يناير إلى مارس (2 مارس 2026 · سجّلها سيدي محمد): 3 000");
    expect(text).not.toContain("سُجّلت مرتين");
    expect(text).toContain("مستحقات يونيو إلى سبتمبر: 4 000");
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

  it("wallets: the movement in the period (داخل / خارج); «الرصيد» only where an opening exists", () => {
    const doc = buildWallets(fx.fxWallets);
    const table = doc.blocks.find((b) => b.t === "table");
    expect(table?.t === "table" && table.head).toEqual(["المحفظة", "الدفعات", "داخل"]);
    expect(table?.t === "table" && table.foot?.[2].replace(/\D/g, "")).toBe("313500");
    expect(txt(doc)).toContain("*الحركة في الفترة*");
    // a balance without an opening is never shown (it cannot be known)
    const noOpening = buildWallets({
      ...fx.fxWallets,
      wallets: fx.fxWallets.wallets.map((w) => ({ ...w, out: 1000, balance: 5000 })),
      cash: { ...fx.fxWallets.cash, out: 2000 },
      unspecifiedOut: 3000,
      paperIn: 4000,
    });
    const t2 = noOpening.blocks.find((b) => b.t === "table");
    expect(t2?.t === "table" && t2.head).toEqual(["المحفظة", "الدفعات", "داخل", "خارج", "الرصيد"]);
    const cells = t2?.t === "table" ? t2.rows.map((r) => r.map((c) => c.replace(/\D/g, ""))) : [];
    for (const r of cells) expect(r[4]).toBe("");
    expect(t2?.t === "table" && t2.rows.map((r) => r[0]).slice(-2)).toEqual([
      "بلا محفظة (الأوراق)",
      "مصاريف بلا محفظة",
    ]);
    // خارج: 3 wallets × 1 000 + cash 2 000 + without a wallet 3 000
    expect(t2?.t === "table" && t2.foot?.[3].replace(/\D/g, "")).toBe("8000");
    // with an opening: that wallet's balance, the date in the note
    const opened = buildWallets({
      ...fx.fxWallets,
      wallets: fx.fxWallets.wallets.map((w, i) =>
        i === 0
          ? { ...w, out: 0, opening: { amount: 10_000, on: "2026-01-01" }, balance: 155_000 }
          : w,
      ),
    });
    const t3 = opened.blocks.find((b) => b.t === "table");
    expect(t3?.t === "table" && t3.rows[0].at(-1)?.replace(/\D/g, "")).toBe("155000");
    expect(t3?.t === "table" && t3.rows[1].at(-1)).toBe("");
    expect(txt(opened)).toContain("«الرصيد» لمحفظة لها رصيد افتتاحي فقط (من 1 يناير 2026)");
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
    expect(text).toContain("الفئة أ: 55٪ (22 من 40)");
    expect(text).toContain("الفئة ب: 42٪ (20 من 48)");
    expect(text).toContain("يناير 80، فبراير 78");
    expect(text).toContain("سبتمبر 42");
    // months not started yet: what is already paid in them (a whole year paid), never «مقدَّمًا»
    expect(text).toContain("أكتوبر 5، نوفمبر 2، ديسمبر 2");
    expect(text).not.toContain("مقدَّمًا");
    expect(text).not.toContain("مقدما");
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
    expect(text).toContain(
      "الفئة أ: جُمع 40 000 من 76 000 أوقية. الفئة ب: جُمع 28 000 من 92 000 أوقية.",
    );
    // the groups add up to the whole
    const g = fx.fxLevyStats.groups;
    expect(g.reduce((s, x) => s + x.collected, 0)).toBe(fx.fxLevyStats.collected);
    expect(g.reduce((s, x) => s + x.expected, 0)).toBe(fx.fxLevyStats.expected);
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
  it("last year: on the same day, the whole year for a past year, nothing before the records", () => {
    const line = (previous: typeof fx.fxStats.previous) =>
      txt(buildStats({ ...fx.fxStats, previous }))
        .split("\n")
        .find((l) => l.startsWith("السنة الماضية"));
    const prev = fx.fxStats.previous!;
    expect(line(prev)).toBe("السنة الماضية في مثل هذا الوقت: 55٪ دفعوا.");
    expect(line({ ...prev, asOf: null })).toBe("السنة الماضية كاملة: 55٪ دفعوا.");
    expect(line({ ...prev, beforeRecords: true })).toBeUndefined();
    expect(line(null)).toBeUndefined();
  });
  it("nobody owing says so instead of three zeros", () => {
    const o = { ...fx.fxFeeStats.overall, paidUp: 88, owe1: 0, owe2to3: 0, owe4plus: 0 };
    const t = txt(buildStats({ ...fx.fxStats, fees: { ...fx.fxFeeStats, overall: o } }));
    expect(t).toContain("لا أحد عليه متأخرات.");
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
    // the paid count above every month that has payments, future months included
    for (const n of ["80", "42", "5"]) expect(texts).toContain(n);
    for (const t of ["48٪", "55٪", "42٪", "40٪", "43٪"])
      expect(texts.some((x) => x.includes(t))).toBe(true);
    for (let m = 1; m <= 12; m++) expect(texts).toContain(String(m));
  });
  it("the campaign report opens with its figures and drops the repeated levy line", () => {
    const levy = txt(buildCampaign(fx.fxLevy, fx.fxLevyStats));
    expect(levy).toContain("*40٪* دفعوا نصيبهم.");
    expect(levy).not.toContain("ولم يدفع بعد");
    // the amounts once (the campaign's own lines), plus the per-group line
    expect(levy.match(/^جُمع/gm)).toHaveLength(1);
    expect(txt(buildCampaign(fx.fxLevy))).toContain("ولم يدفع بعد");
    const gift = txt(buildCampaign(fx.fxCampaign, fx.fxDonationStats));
    expect(gift).toContain("تبرّعوا: 27");
  });
});

describe("the owner's words (docs/GLOSSARY.md)", () => {
  /** words never to use in a report, and the word to use instead */
  const NEVER: [RegExp, string][] = [
    [/(^|[\s«(*·،])دخل([\s:»)*.،]|$)/m, "المداخيل"],
    [/ما دخل|ما صُرف|صُرف|الإيرادات/, "المداخيل / المصاريف"],
    [/رسوم|الاشتراك/, "المستحقات"],
    [/المجموعة [أبج]/, "الفئة"],
    [/الديون/, "المتأخرات"],
    [/أمين الصندوق|نائب الرئيس|المشرف/, "المسؤول / عضو اللجنة"],
    [/\bوصل\b|وصل استلام/, "no receipts"],
    [/مقدَّمًا|مقدما/, "no «مقدَّمًا» (owner)"],
  ];
  const docs = [...ALL, ["stats-levy", buildCampaign(fx.fxLevy, fx.fxLevyStats)] as const];
  for (const [name, doc] of docs)
    it(`${name}: only the glossary's words`, () => {
      const text = txt(doc);
      for (const [re, use] of NEVER) expect(text, `use ${use}`).not.toMatch(re);
    });
});

describe("the WhatsApp group is public (owner): no app, no site, no link", () => {
  const NEVER = /http|vercel|baqie|التطبيق|www\.|\.app\b/;
  for (const [name, doc] of ALL)
    it(`${name}: text, share message and every drawn page`, () => {
      expect(txt(doc)).not.toMatch(NEVER);
      expect(shareText(doc)).not.toMatch(NEVER);
      for (const size of [PHONE, A4])
        for (const t of drawn(doc, size)) expect(t).not.toMatch(NEVER);
    });
  it("each report says what it is and whom to ask, in one short line", () => {
    for (const [, doc] of ALL) {
      expect(doc.message.length).toBeGreaterThan(10);
      expect(doc.message.length).toBeLessThan(90);
      expect(shareText(doc).split("\n")).toEqual([`*${doc.title} · ${doc.subtitle}*`, doc.message]);
    }
    expect(shareText(buildLate(fx.fxLate))).toBe(
      "*المتأخرات · سنة 2026 · الدورة 1*\nهذه الأسماء عليها متأخرات لم تُدفع بعد. للدفع أو السؤال تواصل مع اللجنة.",
    );
  });
});
