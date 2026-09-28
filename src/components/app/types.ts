// UI-side shapes for data the Lane A layer does not return yet. Each is marked TODO(lane-a):
// when src/lib/data/types.ts grows the field, delete the local type and map from the real one.
import type { ExpenseCategory, PaymentMethod, VerifiedReceipt } from "@/lib/data/types";

/**
 * One public operation for «آخر العمليات» / «كل العمليات».
 * TODO(lane-a): public ledger view with amount, method, id and receipt code per confirmed payment
 * (ActivityItem.payment_confirmed has none of them, so real-mode payments show no amount).
 */
export type LedgerEntry = {
  id: string;
  kind: "payment" | "donation" | "expense";
  title: string;
  sub: string;
  /** null when the data layer does not expose it yet */
  amount: number | null;
  at: string;
  method: PaymentMethod | null;
  /** verification code → opens the public receipt */
  code: string | null;
  category?: ExpenseCategory;
  note?: string | null;
};

/** TODO(lane-a): campaign contributions list («آخر المساهمات»). */
export type Contribution = {
  id: string;
  campaignId: string;
  name: string;
  amount: number;
  confirmedAt: string;
};

/**
 * VerifiedReceipt + what the public receipt prints.
 * TODO(lane-a): confirmer name/role, last 4 of the txn ref and the cancel reason on verify_receipt.
 */
export type VerifiedReceiptPlus = VerifiedReceipt &
  (
    | { status: "not_found" }
    | {
        status: "valid" | "cancelled" | "pending";
        confirmedByName?: string | null;
        confirmedByRole?: string | null;
        txnLast4?: string | null;
        cancelReason?: string | null;
      }
  );
