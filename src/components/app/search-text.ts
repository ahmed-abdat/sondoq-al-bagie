// Text rules for finding a member: forgiving Arabic name matching and turning a spoken phrase
// («باء اثنا عشر») into a search query («ب 12»). Pure, unit tested.

export const toLatinDigits = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));

/** Alef/hamza forms, taa marbuta, alef maqsura, harakat, tatweel, punctuation, extra spaces. */
export function normalizeAr(s: string) {
  return toLatinDigits(s)
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ء/g, "")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/[ً-ْٰـ]/g, "")
    .replace(/[.,،؛;:!?؟«»"'()\-_/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** «ولد» and its kin carry no identity in a search: «محمد ولد الشيخ» ≈ «محمد الشيخ». */
const LINKS = new Set(["ولد", "ول", "ود", "بن", "ابن", "بنت", "منت"]);
const bare = (t: string) => (t.length > 3 && t.startsWith("ال") ? t.slice(2) : t);

export function nameTokens(s: string): string[] {
  return normalizeAr(s)
    .split(" ")
    .filter((t) => t && !LINKS.has(t));
}

/**
 * Every typed word must start a word of the name (in any order), ignoring «ولد» and a leading
 * «ال»: «محمد شيخ», «الشيخ محمد», «محمد ولد الش» all find «محمد ولد الشيخ».
 * Returns a rank (lower is better) or -1 for no match.
 */
export function nameRank(name: string, query: string): number {
  const q = nameTokens(query);
  if (!q.length) return -1;
  const n = nameTokens(name);
  let rank = 0;
  for (const [i, w] of q.entries()) {
    const at = n.findIndex((t) => t.startsWith(w) || bare(t).startsWith(bare(w)));
    if (at < 0) {
      // last resort: the words run together («محمدالشيخ»)
      const glued = normalizeAr(query).replace(/\s|ولد|بنت|منت/g, "");
      return glued && n.join("").includes(glued) ? 50 : -1;
    }
    rank += at === i ? 0 : 1;
  }
  return rank;
}

/* ───────────── spoken numbers (1–99) and group letters ───────────── */

const UNITS: Record<string, number> = {
  واحد: 1,
  واحده: 1,
  احد: 1,
  احدي: 1,
  اثنان: 2,
  اثنين: 2,
  اثنا: 2,
  اثني: 2,
  اثنتان: 2,
  اثنتين: 2,
  اتنين: 2,
  ثلاث: 3,
  ثلاثه: 3,
  تلاته: 3,
  اربع: 4,
  اربعه: 4,
  خمس: 5,
  خمسه: 5,
  ست: 6,
  سته: 6,
  سبع: 7,
  سبعه: 7,
  ثمان: 8,
  ثماني: 8,
  ثمانيه: 8,
  تمنيه: 8,
  تسع: 9,
  تسعه: 9,
};
const TEN = new Set(["عشر", "عشره"]);
const TENS: Record<string, number> = {
  عشرون: 20,
  عشرين: 20,
  ثلاثون: 30,
  ثلاثين: 30,
  اربعون: 40,
  اربعين: 40,
  خمسون: 50,
  خمسين: 50,
  ستون: 60,
  ستين: 60,
  سبعون: 70,
  سبعين: 70,
  ثمانون: 80,
  ثمانين: 80,
  تسعون: 90,
  تسعين: 90,
};
const tensOf = (t: string) => TENS[t] ?? (t.startsWith("و") ? TENS[t.slice(1)] : undefined);
const unitOf = (t: string) => UNITS[t] ?? (t.startsWith("و") ? UNITS[t.slice(1)] : undefined);

/** Words → numbers: «خمسة وعشرون» → «25», «اثنا عشر» → «12», «عشرة» → «10». */
export function spokenNumbers(s: string): string {
  const w = normalizeAr(s).split(" ").filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < w.length; i++) {
    const u = unitOf(w[i]);
    if (u !== undefined) {
      if (TEN.has(w[i + 1] ?? "")) {
        out.push(String(10 + u));
        i += 1;
      } else if (w[i + 1] === "و" && TENS[w[i + 2] ?? ""]) {
        out.push(String(u + TENS[w[i + 2]]));
        i += 2;
      } else if (w[i + 1]?.startsWith("و") && tensOf(w[i + 1])) {
        out.push(String(u + tensOf(w[i + 1])!));
        i += 1;
      } else out.push(String(u));
      continue;
    }
    const t = TENS[w[i]];
    if (t !== undefined) out.push(String(t));
    else if (TEN.has(w[i])) out.push("10");
    else out.push(w[i]);
  }
  // digits said one by one («واحد اثنان») or split by the recogniser («1 2») join up
  return out.join(" ").replace(/\b(\d)\s+(?=\d\b)/g, "$1");
}

const FILLER = new Set(["رقم", "رقمه", "العضو", "عضو", "المجموعه", "مجموعه", "حرف", "من"]);
const LETTER_A = new Set(["ا", "الف", "اليف"]);
const LETTER_B = new Set(["ب", "با", "باء", "باا", "بي"]);

/**
 * A recognised phrase → what goes in the search box. «الف اثنا عشر» → «أ 12»,
 * «رقم خمسة» → «5», «محمد ولد الشيخ» stays a name.
 */
export function spokenToQuery(transcript: string): string {
  const words = spokenNumbers(transcript)
    .split(" ")
    .filter((t) => t && !FILLER.has(t));
  // «أ12» / «ب12» as one word
  const glued = words.flatMap((t) => (/^[اب]\d+$/.test(t) ? [t[0], t.slice(1)] : [t]));
  const num = glued.find((t) => /^\d+$/.test(t));
  if (!num) return glued.join(" ");
  const others = glued.filter((t) => t !== num);
  if (others.length === 0) return String(Number(num));
  if (others.every((t) => LETTER_A.has(t))) return `أ ${Number(num)}`;
  if (others.every((t) => LETTER_B.has(t))) return `ب ${Number(num)}`;
  return glued.join(" ");
}
