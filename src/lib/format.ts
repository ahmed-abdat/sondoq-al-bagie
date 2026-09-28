/**
 * Number display for the whole app: Latin digits, narrow no-break space (U+202F) between
 * thousands ("12 500"). Intl "ar-MR" groups with a dot ("12.500"), which reads like a decimal
 * next to receipts, so we group by hand.
 */
export const THIN = " ";

/** Latin digits, narrow-nbsp thousands, up to 2 decimals ("8.62"). */
export function formatNumber(value: number): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const rounded = Math.round(abs * 100) / 100;
  const [intPart = "0", dec] = rounded.toString().split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, THIN);
  return `${negative && rounded !== 0 ? "−" : ""}${grouped}${dec ? `.${dec}` : ""}`;
}

/** An amount stored in old ouguiya (MRO), e.g. "12 500 أوقية". */
export function formatMro(mro: number): string {
  return `${formatNumber(Math.round(mro))} أوقية`;
}

/** An amount in new ouguiya (MRU), as wallets and receipts show it, e.g. "1 250 MRU". */
export function formatMru(mru: number): string {
  return `${formatNumber(mru)} MRU`;
}

/** Whole percent, e.g. 11/12 → 92. */
export function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/**
 * Wraps text in Unicode LTR isolates (U+2066 … U+2069) so numbers, codes and references
 * such as "BQ-7K2M-0231" or "36 12 34 56" keep their order inside Arabic text (WhatsApp, share).
 */
export function ltr(text: string): string {
  return `\u2066${text}\u2069`;
}
