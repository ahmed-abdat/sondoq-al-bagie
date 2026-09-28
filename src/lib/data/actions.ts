"use server";
// Committee writes. Each action validates its input, calls one RPC as the signed-in user (the
// database re-checks the role), maps errors to { ok: false, code, message } and expires the
// public cache when public numbers change. Never throws for expected failures.
import { updateTag } from "next/cache";
import { headers } from "next/headers";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { codeOf, failure, MESSAGES } from "./errors";
import { isProofPath, PROOF_MAX_BYTES, proofPath, sha256Hex, sniffImage } from "./proof";
import type { Client } from "./read";
import * as s from "./schemas";
import { getCommitteeSession } from "./committee";
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

/* ───────────── proof images ───────────── */

export type UploadedProof = { path: string; hash: string };

/**
 * Upload a proof image (FormData: file, kind "payments"|"expenses", id = the payment/expense id
 * the client generated). The server checks the real type from the bytes, the size, computes the
 * SHA-256 and refuses a screenshot already used by a live payment. Pass the returned path and
 * hash to recordPayment / recordExpense.
 */
export async function uploadProof(form: FormData): Promise<ActionResult<UploadedProof>> {
  const file = form.get("file");
  const kind = form.get("kind");
  const id = String(form.get("id") ?? "");
  if (
    !(file instanceof Blob) ||
    (kind !== "payments" && kind !== "expenses") ||
    !/^[0-9a-f-]{36}$/.test(id)
  ) {
    return failure("invalid_input");
  }
  if (file.size === 0 || file.size > PROOF_MAX_BYTES) return failure("proof_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return failure("proof_not_image");
  const hash = await sha256Hex(bytes);

  const sb = await createClient();
  if (!sb) return failure("not_configured");
  try {
    if (kind === "payments") {
      const { data: dup, error } = await sb
        .from("payments")
        .select("id")
        .eq("proof_hash", hash)
        .in("status", ["pending", "confirmed"])
        .neq("id", id)
        .limit(1);
      if (error) return failure(codeOf(error));
      if (dup.length) return failure("duplicate_proof");
    }
    const path = proofPath(kind, id, hash, mime);
    const { error } = await sb.storage
      .from("proofs")
      .upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "31536000" });
    // Same bytes for the same record → same path: a retry after a lost response is fine.
    if (error && !/exists|duplicate/i.test(error.message)) {
      return failure(
        /row-level security|unauthorized|403/i.test(error.message) ? "not_committee" : "unknown",
      );
    }
    return { ok: true, data: { path, hash } };
  } catch {
    return failure("network");
  }
}

/** Short-lived (5 min) link to view a proof image. Committee only (storage RLS). */
export async function proofUrl(input: { path: string }): Promise<ActionResult<string>> {
  if (!isProofPath(input?.path ?? "")) return failure("invalid_input");
  const sb = await createClient();
  if (!sb) return failure("not_configured");
  const { data, error } = await sb.storage.from("proofs").createSignedUrl(input.path, 300);
  if (error || !data)
    return failure(error && /not found/i.test(error.message) ? "not_found" : "not_committee");
  return { ok: true, data: data.signedUrl };
}

/* ───────────── committee accounts ───────────── */

async function siteOrigin(): Promise<string> {
  const h = await headers();
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  return fromEnv || h.get("origin") || `https://${h.get("host") ?? "localhost:3000"}`;
}

export type InviteResult = { userId: string };

/**
 * Admin: email an invitation to a new committee member and give them their role. They follow
 * the link (→ /auth/confirm), land on /committee/settings and choose a password. Needs the
 * server secret key (SUPABASE_SECRET_KEY) for the invite itself; the role is set as the admin.
 */
export async function inviteCommitteeMember(
  input: s.InviteCommitteeMemberInput,
): Promise<ActionResult<InviteResult>> {
  const parsed = s.inviteCommitteeMemberSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const me = await getCommitteeSession();
  if (!me) return failure("not_signed_in");
  if (me.role !== "admin") return failure("not_admin");
  const admin = tryCreateAdminClient();
  if (!admin) return failure("not_configured");
  const p = parsed.data;
  const redirectTo = `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent("/committee/settings")}`;
  let userId: string;
  try {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(p.email, { redirectTo });
    if (error)
      return failure(
        /already|registered|exists/i.test(error.message) ? "already_registered" : "unknown",
      );
    userId = data.user.id;
  } catch {
    return failure("network");
  }
  const role = await setCommitteeMember({
    userId,
    displayName: p.displayName,
    role: p.role,
    memberId: p.memberId ?? null,
    active: true,
  });
  return role.ok ? { ok: true, data: { userId } } : role;
}

/** Signed-in user sets a new password (after an invite or a reset link). */
export async function setPassword(input: { password: string }): Promise<ActionResult> {
  const parsed = s.passwordSchema.safeParse(input);
  if (!parsed.success) return failure("weak_password");
  const sb = await createClient();
  if (!sb) return failure("not_configured");
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return failure("not_signed_in");
  const { error } = await sb.auth.updateUser({ password: parsed.data.password });
  if (error)
    return failure(
      /weak|short|pwned|characters/i.test(error.message) ? "weak_password" : "unknown",
    );
  return { ok: true, data: undefined };
}

/**
 * «نسيت كلمة السر»: sends a reset link if the email has an account. Always answers ok so the form
 * does not reveal who has an account.
 */
export async function requestPasswordReset(input: { email: string }): Promise<ActionResult> {
  const parsed = s.emailSchema.safeParse(input?.email);
  if (!parsed.success) return failure("invalid_input");
  const sb = await createClient();
  if (!sb) return failure("not_configured");
  const redirectTo = `${await siteOrigin()}/auth/confirm?next=${encodeURIComponent("/committee/settings")}`;
  try {
    await sb.auth.resetPasswordForEmail(parsed.data, { redirectTo });
  } catch {
    return failure("network");
  }
  return { ok: true, data: undefined };
}
