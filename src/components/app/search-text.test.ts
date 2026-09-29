import { describe, expect, it } from "vitest";
import { nameRank, normalizeAr, spokenNumbers, spokenToQuery } from "./search-text";
import { searchMembers } from "./derive";

describe("normalizeAr", () => {
  it("folds hamza, taa marbuta, alef maqsura, harakat, digits and spaces", () => {
    expect(normalizeAr("  إبراهيمُ   مُوسَى ")).toBe("ابراهيم موسي");
    expect(normalizeAr("فاطمة")).toBe("فاطمه");
    expect(normalizeAr("مؤمن")).toBe("مومن");
    expect(normalizeAr("١٢")).toBe("12");
  });
});

describe("name matching", () => {
  const name = "محمد ولد الشيخ";
  it("ignores «ولد», order and a leading «ال»", () => {
    expect(nameRank(name, "محمد الشيخ")).toBeGreaterThanOrEqual(0);
    expect(nameRank(name, "الشيخ محمد")).toBeGreaterThanOrEqual(0);
    expect(nameRank(name, "محمد شيخ")).toBeGreaterThanOrEqual(0);
    expect(nameRank(name, "محمد ولد الش")).toBeGreaterThanOrEqual(0);
    expect(nameRank(name, "محمدولدالشيخ")).toBeGreaterThanOrEqual(0);
    expect(nameRank(name, "احمد")).toBe(-1);
  });
  it("ranks names that start with the typed word first", () => {
    const list = [{ fullName: "سيدي ولد محمد" }, { fullName: "محمد ولد سيدي" }];
    expect(searchMembers(list, "محمد").map((m) => m.fullName)).toEqual([
      "محمد ولد سيدي",
      "سيدي ولد محمد",
    ]);
  });
  it("finds hamza and taa marbuta variants", () => {
    expect(nameRank("أحمد ولد إبراهيم", "احمد ابراهيم")).toBe(0);
    expect(nameRank("عائشة منت أحمد", "عايشه")).toBe(0);
  });
});

describe("spoken numbers", () => {
  it("reads 1–99", () => {
    expect(spokenNumbers("خمسة")).toBe("5");
    expect(spokenNumbers("عشرة")).toBe("10");
    expect(spokenNumbers("اثنا عشر")).toBe("12");
    expect(spokenNumbers("ثلاثة عشر")).toBe("13");
    expect(spokenNumbers("عشرون")).toBe("20");
    expect(spokenNumbers("خمسة وعشرون")).toBe("25");
    expect(spokenNumbers("سبعة و تسعين")).toBe("97");
    expect(spokenNumbers("واحد اثنان")).toBe("12");
  });
});

describe("spoken query", () => {
  it("turns a group and number into «أ 12» / «ب 12»", () => {
    expect(spokenToQuery("ألف اثنا عشر")).toBe("أ 12");
    expect(spokenToQuery("باء خمسة")).toBe("ب 5");
    expect(spokenToQuery("ب ١٢")).toBe("ب 12");
    expect(spokenToQuery("أ12")).toBe("أ 12");
    expect(spokenToQuery("رقم ثلاثين")).toBe("30");
  });
  it("keeps a name as a name", () => {
    expect(spokenToQuery("محمد ولد الشيخ")).toBe("محمد ولد الشيخ");
  });
});
