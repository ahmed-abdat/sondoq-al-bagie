// Fees of one member in the record flow: this year's months and late months of earlier years,
// each at its own price (a group change or an older year can cost differently). Pure, tested.
import { MONTHS_AR } from "@/lib/dates";
import type { PMember } from "./types";

export const ym = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;
const split = (key: string) => key.split("-").map(Number) as [number, number];

/** The price of one month; null when no price is set for that year. */
export function priceOf(m: Pick<PMember, "fee" | "prices">, key: string): number | null {
  const p = m.prices?.[key];
  return p === undefined ? m.fee : p;
}

/** Earlier-year late months that can be paid (a price is set), oldest first. */
export const payablePast = (m: Pick<PMember, "fee" | "prices" | "pastLate">) =>
  [...m.pastLate].sort().filter((k) => priceOf(m, k) !== null);

/** «نوفمبر وديسمبر 2025»; several years: «ديسمبر 2024 ويناير 2025». */
export function pastWords(keys: string[]): string {
  const years = new Map<number, number[]>();
  for (const k of [...keys].sort()) {
    const [y, mo] = split(k);
    years.set(y, [...(years.get(y) ?? []), mo]);
  }
  const parts = [...years].map(([y, ms]) => {
    const names = ms.map((x) => MONTHS_AR[x - 1]);
    const words =
      names.length === 1
        ? names[0]
        : ms.every((x, i) => i === 0 || x === ms[i - 1] + 1) && ms.length > 2
          ? `من ${names[0]} إلى ${names[names.length - 1]}`
          : `${names.slice(0, -1).join("، ")} و${names[names.length - 1]}`;
    return `${words} ${y}`;
  });
  return parts.length <= 1 ? (parts[0] ?? "") : `${parts.slice(0, -1).join("، ")} و${parts.at(-1)}`;
}

/** One allocation per month (earlier years first), each at its own price. */
export function feeAllocations(
  m: Pick<PMember, "id" | "fee" | "prices">,
  year: number,
  months: number[],
  past: string[],
) {
  return [
    ...[...past].sort().map(split),
    ...[...months].sort((a, b) => a - b).map((x) => [year, x]),
  ].map(([y, mo]) => ({
    kind: "months" as const,
    memberId: m.id,
    year: y,
    month: mo,
    amount: priceOf(m, ym(y, mo)) ?? 0,
  }));
}

export const feesTotal = (...a: Parameters<typeof feeAllocations>) =>
  feeAllocations(...a).reduce((s, x) => s + x.amount, 0);
