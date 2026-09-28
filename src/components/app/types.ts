// UI view models built from the Lane A types (see source.ts for the mapping).
import type { ExpenseCategory, PaymentMethod } from "@/lib/data/types";
import type { ReceiptView } from "./receipt-model";

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
  /** the public receipt, preloaded for the first rows so it opens offline too */
  receipt?: ReceiptView | null;
  category?: ExpenseCategory;
  note?: string | null;
};

/**
 * Committee member row (with phone and note).
 * TODO(lane-a): replace with the getMembersAdmin() shape from src/lib/data/types.ts when it lands.
 */
export type MemberAdmin = import("@/lib/data/types").MemberStatus & {
  phone: string | null;
  note: string | null;
};
