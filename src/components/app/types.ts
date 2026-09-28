// UI view models built from the Lane A types (see source.ts for the mapping).
import type { ExpenseCategory, PaymentMethod } from "@/lib/data/types";

/** One public operation for «آخر العمليات» / «كل العمليات» (confirmed payments + expenses). */
export type LedgerEntry = {
  id: string;
  kind: "payment" | "donation" | "expense";
  title: string;
  sub: string;
  amount: number;
  at: string;
  /** «منذ ساعة», computed on the server */
  when: string;
  method: PaymentMethod | null;
  /** verification code → opens the public receipt */
  code: string | null;
  category?: ExpenseCategory;
  note?: string | null;
};
