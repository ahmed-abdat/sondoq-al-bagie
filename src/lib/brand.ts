// The fund's names and how people write a member's paper number. Used by every report.

export const ASSOC_NAME = "رابطة شباب قرية البقيع";

const LETTERS: Record<string, string> = { A: "أ", B: "ب" };

/**
 * Member number as people know it: «A-12» → «أ 12» (group letter, space, number).
 * `isolate` wraps it in RIGHT-TO-LEFT ISOLATE … POP (U+2067 … U+2069) for text sent to WhatsApp,
 * so the letter stays before the number whatever surrounds it.
 */
export function memberNumber(ref: string, isolate = false): string {
  const [list, ...rest] = ref.split("-");
  const no = rest.join("-");
  const s = no ? `${LETTERS[list.trim().toUpperCase()] ?? list} ${no}` : ref;
  return isolate ? `⁧${s}⁩` : s;
}
