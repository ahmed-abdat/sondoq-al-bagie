import type { MyProfile as DataMyProfile } from "@/lib/data/types";
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
  /** payments only: lets the committee cancel it from the receipt */
  paymentId?: string;
  /** the public receipt, preloaded for the first rows so it opens offline too */
  receipt?: ReceiptView | null;
  category?: ExpenseCategory;
  note?: string | null;
};

/** «حسابي»: Lane A's profile plus, from the session, whether they confirm payments. */
export type MyProfile = DataMyProfile & { canConfirm: boolean };
