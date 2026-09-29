// A member's 12 months of one year as a 12-letter string, so lists send ~12 bytes per member
// instead of 12 objects. Pure and client-safe (use it in Client Components).
// P paid · L late · U upcoming · N not owed (exempt/left); index 0 = January.
import type { MemberMonth, MonthState } from "./types";

const CODE: Record<MonthState, string> = { paid: "P", late: "L", upcoming: "U", not_owed: "N" };
const STATE: Record<string, MonthState> = { P: "paid", L: "late", U: "upcoming", N: "not_owed" };

/** Months of one member (any order; other years ignored) → "PPPPPPPPLLUU". Missing = N. */
export function encodeMonths(
  months: Pick<MemberMonth, "year" | "month" | "state">[],
  year: number,
) {
  const out = Array<string>(12).fill("N");
  for (const m of months) {
    if (m.year === year && m.month >= 1 && m.month <= 12) out[m.month - 1] = CODE[m.state];
  }
  return out.join("");
}

/** "PPLU…" → the 12 states, January first. */
export function monthStates(code: string): MonthState[] {
  return Array.from({ length: 12 }, (_, i) => STATE[code[i]] ?? "not_owed");
}

/** Back to MemberMonth rows (what the member sheet takes today). */
export function decodeMonths(code: string, memberId: string, year: number): MemberMonth[] {
  return monthStates(code).map((state, i) => ({ memberId, year, month: i + 1, state }));
}
