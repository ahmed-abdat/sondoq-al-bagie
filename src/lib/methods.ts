/**
 * How a payment was made. The fund only records it; logos are identifiers, not payment buttons.
 * Values are stable ids (store these); labels are Arabic for display.
 */
export const METHODS = [
  "bankily",
  "masrvi",
  "sedad",
  "click",
  "bim",
  "amanty",
  "bamis",
  "cash",
  "paper",
  "other",
] as const;

export type Method = (typeof METHODS)[number];

/** Wallets shown first in pickers. */
export const MAIN_METHODS: readonly Method[] = ["bankily", "masrvi", "sedad", "cash"];

export const METHOD_LABELS: Record<Method, string> = {
  bankily: "بنكيلي",
  masrvi: "مصرفي",
  sedad: "السداد",
  click: "كليك",
  bim: "BIM",
  amanty: "أمانتي",
  bamis: "BAMIS",
  cash: "نقداً",
  // Imported from the 2026 paper sheets (see docs/HANDOFF.md).
  paper: "سجل ورقي",
  other: "أخرى",
};

const LOGOS: Partial<Record<Method, string>> = {
  bankily: "/wallets/bankily.webp",
  masrvi: "/wallets/masrvi.webp",
  sedad: "/wallets/sedad.webp",
  click: "/wallets/click.webp",
  bim: "/wallets/bim.webp",
  amanty: "/wallets/amanty.webp",
  bamis: "/wallets/bamis.webp",
};

export function isMethod(value: unknown): value is Method {
  return typeof value === "string" && (METHODS as readonly string[]).includes(value);
}

export function methodLabel(method: Method): string {
  return METHOD_LABELS[method];
}

/** Logo path in /public, or null for cash, paper and other. */
export function methodLogo(method: Method): string | null {
  return LOGOS[method] ?? null;
}
