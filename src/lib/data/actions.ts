"use server";
// Committee writes. Each action validates its input, calls one RPC as the signed-in user (the
// database re-checks the role), maps errors to { ok: false, code, message } and expires the
// public cache when public numbers change. Never throws for expected failures.
import { updateTag } from "next/cache";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { codeOf, failure, MESSAGES } from "./errors";
import type { Client } from "./read";
import * as s from "./schemas";
import { PUBLIC_TAG } from "./tags";
import type { ActionResult } from "./types";

type RpcResult = {
  data: unknown;
  error: { code?: string; hint?: string | null; message?: string } | null;
};

async function run<S extends z.ZodType, T = undefined>(
  schema: S,
  input: unknown,
  call: (sb: Client, data: z.output<S>) => PromiseLike<RpcResult>,
  opts: { touchesPublic: boolean; result?: (data: unknown) => T },
): Promise<ActionResult<T>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom")?.message;
    return failure(custom && custom in MESSAGES ? custom : "invalid_input");
  }
  const sb = await createClient();
  if (!sb) return failure("not_configured");
  let res: RpcResult;
  try {
    res = await call(sb, parsed.data);
  } catch {
    return failure("network");
  }
  if (res.error) return failure(codeOf(res.error));
  if (opts.touchesPublic) updateTag(PUBLIC_TAG);
  return { ok: true, data: (opts.result ? opts.result(res.data) : undefined) as T };
}

/* ───────────── payments ───────────── */

export type RecordPaymentResult = {
  id: string;
  status: "pending" | "confirmed";
  replay: boolean;
  /** set when the payment was confirmed at once */
  receiptCode: string | null;
};

/** Record a payment. Treasurer/deputy/admin recordings are confirmed at once (except their own). */
export async function recordPayment(input: s.RecordPaymentInput) {
  return run(
    s.recordPaymentSchema,
    input,
    (sb, p) =>
      sb.rpc("record_payment", {
        p_id: p.id,
        p_payer_name: p.payerName,
        p_method: p.method,
        p_amount: p.amount,
        p_paid_on: p.paidOn,
        p_allocations: p.allocations.map((a) =>
          a.kind === "months"
            ? {
                kind: a.kind,
                member_id: a.memberId,
                year: a.year,
                month: a.month,
                amount: a.amount,
              }
            : a.kind === "campaign"
              ? {
                  kind: a.kind,
                  campaign_id: a.campaignId,
                  member_id: a.memberId ?? null,
                  amount: a.amount,
                }
              : { kind: a.kind, member_id: a.memberId, amount: a.amount },
        ),
        p_txn_ref: p.txnRef,
        p_proof_path: p.proofPath,
        p_proof_hash: p.proofHash?.toLowerCase(),
        p_note: p.note,
      }),
    {
      touchesPublic: true,
      result: (d): RecordPaymentResult => {
        const r = d as {
          id: string;
          status: RecordPaymentResult["status"];
          replay: boolean;
          receipt_code?: string | null;
        };
        return {
          id: r.id,
          status: r.status,
          replay: r.replay,
          receiptCode: r.receipt_code ?? null,
        };
      },
    },
  );
}

export type ConfirmResult = {
  /** true when someone else confirmed it first (no-op) */
  already: boolean;
  decidedByName: string | null;
  decidedAt: string | null;
  /** receipt verification code (null for paper) */
  receiptCode: string | null;
};

export async function confirmPayment(input: { id: string }) {
  return run(
    s.paymentIdSchema,
    input,
    (sb, p) => sb.rpc("confirm_payment", { p_payment_id: p.id }),
    {
      touchesPublic: true,
      result: (d): ConfirmResult => {
        const r = d as {
          already: boolean;
          decided_by_name: string | null;
          decided_at: string | null;
          receipt_code?: string | null;
        };
        return {
          already: r.already,
          decidedByName: r.decided_by_name,
          decidedAt: r.decided_at,
          receiptCode: r.receipt_code ?? null,
        };
      },
    },
  );
}

export async function rejectPayment(input: { id: string; reason: string }) {
  return run(
    s.paymentReasonSchema,
    input,
    (sb, p) => sb.rpc("reject_payment", { p_payment_id: p.id, p_reason: p.reason }),
    { touchesPublic: false },
  );
}

export async function cancelPayment(input: { id: string; reason: string }) {
  return run(
    s.paymentReasonSchema,
    input,
    (sb, p) => sb.rpc("cancel_payment", { p_payment_id: p.id, p_reason: p.reason }),
    { touchesPublic: true },
  );
}

/** «تراجع» right after recording: only the recorder, within 30 s on the server (5 s in the UI). */
export async function undoPayment(input: { id: string }) {
  return run(s.paymentIdSchema, input, (sb, p) => sb.rpc("undo_payment", { p_payment_id: p.id }), {
    touchesPublic: true,
  });
}

/* ───────────── expenses, reminders ───────────── */

export async function recordExpense(input: s.RecordExpenseInput) {
  return run(
    s.recordExpenseSchema,
    input,
    (sb, p) =>
      sb.rpc("record_expense", {
        p_id: p.id,
        p_spent_on: p.spentOn,
        p_category: p.category,
        p_amount: p.amount,
        p_note: p.note,
        p_campaign_id: p.campaignId,
        p_receipt_path: p.receiptPath,
      }),
    { touchesPublic: true, result: (d) => d as string },
  );
}

export async function cancelExpense(input: { id: string; reason: string }) {
  return run(
    s.cancelExpenseSchema,
    input,
    (sb, p) => sb.rpc("cancel_expense", { p_expense_id: p.id, p_reason: p.reason }),
    { touchesPublic: true },
  );
}

/** Log a WhatsApp reminder/receipt the committee member just opened. */
export async function logReminder(input: s.LogReminderInput) {
  return run(
    s.logReminderSchema,
    input,
    (sb, p) =>
      sb.rpc("log_reminder", {
        p_kind: p.kind,
        p_member_id: p.memberId,
        p_campaign_id: p.campaignId,
        p_payment_id: p.paymentId,
      }),
    { touchesPublic: false, result: (d) => d as string },
  );
}

/* ───────────── admin ───────────── */

export async function addMember(input: s.AddMemberInput) {
  return run(
    s.addMemberSchema,
    input,
    (sb, p) =>
      sb.rpc("add_member", {
        p_number: p.number,
        p_full_name: p.fullName,
        p_group_code: p.groupCode,
        p_from_month: p.fromMonth,
        p_phone: p.phone,
        p_note: p.note,
        p_status: p.status,
      }),
    { touchesPublic: true, result: (d) => d as string },
  );
}

export async function updateMember(input: s.UpdateMemberInput) {
  return run(
    s.updateMemberSchema,
    input,
    (sb, p) =>
      sb.rpc("update_member", {
        p_member_id: p.memberId,
        p_full_name: p.fullName,
        // generated types mark these non-null; the SQL accepts null (clears the field)
        p_phone: p.phone as string,
        p_note: p.note as string,
      }),
    { touchesPublic: true },
  );
}

export async function changeMemberStatus(input: s.ChangeMemberStatusInput) {
  return run(
    s.changeMemberStatusSchema,
    input,
    (sb, p) =>
      sb.rpc("change_member_status", {
        p_member_id: p.memberId,
        p_from_month: p.fromMonth,
        p_status: p.status,
        p_reason: p.reason,
        p_group_code: p.groupCode,
      }),
    { touchesPublic: true, result: (d) => d as string },
  );
}

export async function setGroupPrice(input: s.SetGroupPriceInput) {
  return run(
    s.setGroupPriceSchema,
    input,
    (sb, p) =>
      sb.rpc("set_group_price", {
        p_group_code: p.groupCode,
        p_year: p.year,
        p_monthly_amount: p.monthlyAmount,
      }),
    { touchesPublic: true },
  );
}

/** Give an existing auth user a committee role (see inviteCommitteeMember for new people). */
export async function setCommitteeMember(input: s.SetCommitteeMemberInput) {
  return run(
    s.setCommitteeMemberSchema,
    input,
    (sb, p) =>
      sb.rpc("set_committee_member", {
        p_user_id: p.userId,
        p_display_name: p.displayName,
        p_role: p.role,
        p_member_id: p.memberId ?? undefined,
        p_active: p.active,
      }),
    { touchesPublic: false },
  );
}

export async function updateSettings(input: s.UpdateSettingsInput) {
  return run(
    s.updateSettingsSchema,
    input,
    (sb, p) =>
      sb.rpc("update_settings", {
        p_opening_balance: p.openingBalance,
        p_opening_balance_on: p.openingBalanceOn,
        p_grace_days: p.graceDays,
        p_show_amount_owed: p.showAmountOwed,
        p_whatsapp_contact: p.whatsappContact,
      }),
    { touchesPublic: true },
  );
}

export async function addFundAccount(input: s.AddFundAccountInput) {
  return run(
    s.addFundAccountSchema,
    input,
    (sb, p) =>
      sb.rpc("add_fund_account", {
        p_method: p.method,
        p_account_number: p.accountNumber,
        p_holder_name: p.holderName,
        p_note: p.note,
        p_sort_order: p.sortOrder,
      }),
    { touchesPublic: true, result: (d) => d as string },
  );
}

/** Edit name/note/order, or deactivate (active: false). Number and wallet never change. */
export async function updateFundAccount(input: s.UpdateFundAccountInput) {
  return run(
    s.updateFundAccountSchema,
    input,
    (sb, p) =>
      sb.rpc("update_fund_account", {
        p_id: p.id,
        p_holder_name: p.holderName,
        p_note: p.note as string,
        p_sort_order: p.sortOrder,
        p_active: p.active,
      }),
    { touchesPublic: true },
  );
}
