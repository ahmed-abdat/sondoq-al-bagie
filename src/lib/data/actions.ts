"use server";
// Committee writes. Each action validates its input, calls one RPC as the signed-in user (the
// database re-checks the role), maps errors to { ok: false, code, message } and expires the
// public cache when public numbers change. Never throws for expected failures.
import { updateTag } from "next/cache";
import { after } from "next/server";
import { pendingPaymentPayload } from "@/lib/push/payload";
import { notifyConfirmers } from "@/lib/push/send";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import type { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { codeOf, failure, MESSAGES } from "./errors";
import { generatePassword, parseLogin } from "./logins";
import { isProofPath, PROOF_MAX_BYTES, proofPath, sha256Hex, sniffImage } from "./proof";
import type { Client } from "./read";
import * as s from "./schemas";
import { getCommitteeSession } from "./committee";
import { PUBLIC_TAG } from "./tags";
import type { ActionResult, IssuedCredentials } from "./types";

type RpcResult = {
  data: unknown;
  error: { code?: string; hint?: string | null; message?: string; details?: string | null } | null;
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
  if (res.error) return failure(codeOf(res.error), res.error.details);
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

/**
 * Record a payment. Treasurer/deputy/admin recordings are confirmed at once (except their own).
 * A new pending payment notifies the other confirmers by push, after the response.
 */
export async function recordPayment(input: s.RecordPaymentInput) {
  const res = await record(input);
  if (res.ok && res.data.status === "pending" && !res.data.replay) {
    const p = s.recordPaymentSchema.parse(input);
    const session = await getCommitteeSession();
    const payload = pendingPaymentPayload({
      id: res.data.id,
      payerName: p.payerName,
      amount: p.amount,
      allocations: p.allocations,
    });
    after(() => notifyConfirmers(session?.userId ?? null, payload));
  }
  return res;
}

async function record(input: s.RecordPaymentInput) {
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

export type ApplyCreditResult = {
  id: string;
  /** true when this id was already used (retry): nothing new was written */
  replay: boolean;
  receiptCode: string | null;
};

/** Months of one member paid from their credit: confirmed at once (not counted as new money). */
export async function applyCredit(input: s.ApplyCreditInput) {
  return run(
    s.applyCreditSchema,
    input,
    (sb, p) => sb.rpc("apply_credit", { p_id: p.id, p_member_id: p.memberId, p_months: p.months }),
    {
      touchesPublic: true,
      result: (d): ApplyCreditResult => {
        const r = d as { id: string; replay: boolean; receipt_code?: string | null };
        return { id: r.id, replay: r.replay, receiptCode: r.receipt_code ?? null };
      },
    },
  );
}

export async function rejectPayment(input: { id: string; reason: string }) {
  return run(
    s.idReasonSchema,
    input,
    (sb, p) => sb.rpc("reject_payment", { p_payment_id: p.id, p_reason: p.reason }),
    { touchesPublic: false },
  );
}

export async function cancelPayment(input: { id: string; reason: string }) {
  return run(
    s.idReasonSchema,
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
    s.idReasonSchema,
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

/* ───────────── campaigns (admin, treasurer, deputy) ───────────── */

/** Open a donation campaign. Target and deadline are optional; retries replay on the id. */
export async function createCampaign(input: s.CreateCampaignInput) {
  return run(
    s.createCampaignSchema,
    input,
    (sb, p) =>
      sb.rpc("create_campaign", {
        p_id: p.id,
        p_title: p.title,
        p_amount_mode: p.amountMode,
        p_purpose: p.purpose,
        p_target_amount: p.targetAmount,
        p_deadline: p.deadline,
        p_participants: p.participants?.map((x) => ({
          member_id: x.memberId,
          expected_amount: x.expectedAmount,
        })),
      }),
    { touchesPublic: true, result: (d) => d as string },
  );
}

export async function updateCampaign(input: s.UpdateCampaignInput) {
  return run(
    s.updateCampaignSchema,
    input,
    (sb, p) =>
      sb.rpc("update_campaign", {
        p_id: p.id,
        p_title: p.title,
        // generated types mark these non-null; the SQL accepts null (clears the field)
        p_purpose: p.purpose as string,
        p_target_amount: p.targetAmount as number,
        p_deadline: p.deadline as string,
      }),
    { touchesPublic: true },
  );
}

/** Close for good. Returns the amount moved to the main fund ('to_fund'), else 0. */
export async function closeCampaign(input: s.CloseCampaignInput) {
  return run(
    s.closeCampaignSchema,
    input,
    (sb, p) => sb.rpc("close_campaign", { p_id: p.id, p_surplus_action: p.surplusAction }),
    { touchesPublic: true, result: (d) => Number(d ?? 0) },
  );
}

/* ───────────── handover («تسليم الصندوق») ───────────── */

/** Outgoing admin/treasurer opens a draft for the current term (retries replay on the id). */
export async function startHandover(input: s.StartHandoverInput) {
  return run(
    s.startHandoverSchema,
    input,
    (sb, p) => sb.rpc("start_handover", { p_id: p.id, p_note: p.note }),
    { touchesPublic: false, result: (d) => d as string },
  );
}

/** Save the counted money (cash + each wallet), who stays on the committee, and a note. */
export async function updateHandoverDraft(input: s.UpdateHandoverDraftInput) {
  return run(
    s.updateHandoverDraftSchema,
    input,
    (sb, p) =>
      sb.rpc("update_handover_draft", {
        p_id: p.id,
        p_counted_lines: p.countedLines.map((l) => ({
          label: l.label,
          method: l.method ?? null,
          account_id: l.accountId ?? null,
          amount: l.amount,
        })),
        p_carry_over: p.carryOver,
        p_note: p.note,
      }),
    { touchesPublic: false },
  );
}

/** Outgoing side done; waits for the incoming admin. */
export async function submitHandover(input: { id: string }) {
  return run(s.paymentIdSchema, input, (sb, p) => sb.rpc("submit_handover", { p_id: p.id }), {
    touchesPublic: false,
  });
}

/**
 * Incoming admin (not the one who started or submitted) accepts: closes the term, opens the next
 * with the counted money, books any difference. Returns the new term number.
 */
export async function acceptHandover(input: s.AcceptHandoverInput) {
  return run(
    s.acceptHandoverSchema,
    input,
    (sb, p) => sb.rpc("accept_handover", { p_id: p.id, p_new_term_title: p.newTermTitle }),
    { touchesPublic: true, result: (d) => Number(d) },
  );
}

export async function cancelHandover(input: s.CancelHandoverInput) {
  return run(
    s.cancelHandoverSchema,
    input,
    (sb, p) => sb.rpc("cancel_handover", { p_id: p.id, p_reason: p.reason }),
    { touchesPublic: false },
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
        p_list_code: p.listCode,
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
        p_number: p.number,
      }),
    { touchesPublic: true },
  );
}

/** Move a member to another group (price) from a month on; status unchanged. */
export async function changeMemberGroup(input: s.ChangeMemberGroupInput) {
  return run(
    s.changeMemberGroupSchema,
    input,
    (sb, p) =>
      sb.rpc("change_member_group", {
        p_member_id: p.memberId,
        p_from_month: p.fromMonth,
        p_group_code: p.groupCode,
        p_reason: p.reason,
      }),
    { touchesPublic: true, result: (d) => d as string },
  );
}

/** Suggested number for a new member of list A or B. */
export async function nextMemberNumber(input: { listCode: string }): Promise<ActionResult<number>> {
  const code = String(input?.listCode ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z]$/.test(code)) return failure("invalid_input");
  const sb = await createClient();
  if (!sb) return failure("not_configured");
  const { data, error } = await sb.rpc("next_member_number", { p_list_code: code });
  if (error) return failure(codeOf(error));
  if (data === null) return failure("not_committee");
  return { ok: true, data: Number(data) };
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

/** Undo the last status/group change: the previous period is open again. Returns its new id. */
export async function cancelLastPeriod(input: s.CancelLastPeriodInput) {
  return run(
    s.cancelLastPeriodSchema,
    input,
    (sb, p) => sb.rpc("cancel_last_period", { p_member_id: p.memberId, p_reason: p.reason }),
    { touchesPublic: true, result: (d) => d as string },
  );
}

/** Move the start of the member's first period (wrong join month). Returns the period id. */
export async function setJoinMonth(input: s.SetJoinMonthInput) {
  return run(
    s.setJoinMonthSchema,
    input,
    (sb, p) =>
      sb.rpc("set_join_month", {
        p_member_id: p.memberId,
        p_from_month: p.fromMonth,
        p_reason: p.reason,
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

/** Give an existing auth user a committee role (new people: createCommitteeAccount). */
export async function setCommitteeMember(input: s.SetCommitteeMemberInput) {
  return run(
    s.setCommitteeMemberSchema,
    input,
    (sb, p) =>
      sb.rpc("set_committee_member", {
        p_user_id: p.userId,
        p_display_name: p.displayName,
        p_role: p.role,
        // null must reach the database as null: it unlinks (an omitted value would too)
        p_member_id: p.memberId as string,
        p_active: p.active,
      }),
    { touchesPublic: false },
  );
}

/**
 * Admin: link a committee account to its member row, or unlink it (memberId null). Keeps the
 * account's name, role and active state. Codes: not_admin, not_committee_account, member_taken.
 */
export async function linkCommitteeMember(
  input: s.LinkCommitteeMemberInput,
): Promise<ActionResult> {
  const parsed = s.linkCommitteeMemberSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const me = await getCommitteeSession();
  if (!me) return failure("not_signed_in");
  if (me.role !== "admin") return failure("not_admin");
  const sb = await createClient();
  if (!sb) return failure("not_configured");
  const { data: row } = await sb
    .from("committee")
    .select("display_name, role, active")
    .eq("user_id", parsed.data.userId)
    .maybeSingle();
  if (!row) return failure("not_committee_account");
  return setCommitteeMember({
    userId: parsed.data.userId,
    displayName: row.display_name,
    role: row.role,
    memberId: parsed.data.memberId,
    active: row.active,
  });
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

/** Signed-in user sets a new password («حسابي», first sign-in setup). */
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
      /different|same/i.test(error.message)
        ? "same_password"
        : /weak|short|pwned|characters/i.test(error.message)
          ? "weak_password"
          : "unknown",
    );
  return { ok: true, data: undefined };
}

/* ───────────── committee accounts without emails ───────────── */

/**
 * Admin creates a committee login (email or phone) with a generated password, shown once; the
 * admin sends it himself (WhatsApp). Needs SUPABASE_SECRET_KEY on the server.
 */
export async function createCommitteeAccount(
  input: s.CreateCommitteeAccountInput,
): Promise<ActionResult<IssuedCredentials>> {
  const parsed = s.createCommitteeAccountSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const login = parseLogin(parsed.data.login);
  if (!login) return failure("bad_login");
  const me = await getCommitteeSession();
  if (!me) return failure("not_signed_in");
  if (me.role !== "admin") return failure("not_admin");
  const admin = tryCreateAdminClient();
  if (!admin) return failure("not_configured");
  const password = generatePassword();
  let userId: string;
  try {
    const { data, error } = await admin.auth.admin.createUser({
      app_metadata: { setup_pending: true },
      email: login.authEmail,
      password,
      email_confirm: true,
      user_metadata: { display_name: parsed.data.displayName, login: login.display },
    });
    if (error || !data.user) {
      return failure(
        error && /already|registered|exists/i.test(error.message) ? "login_taken" : "unknown",
      );
    }
    userId = data.user.id;
  } catch {
    return failure("network");
  }
  const role = await setCommitteeMember({
    userId,
    displayName: parsed.data.displayName,
    role: parsed.data.role,
    memberId: parsed.data.memberId ?? null,
    active: true,
  });
  if (!role.ok) {
    await admin.auth.admin.deleteUser(userId).catch(() => undefined); // no orphan login
    return role;
  }
  return { ok: true, data: { userId, login: login.display, password } };
}

/** Admin gives a committee member a new generated password (shown once). Not for himself. */
export async function resetCommitteePassword(input: {
  userId: string;
}): Promise<ActionResult<IssuedCredentials>> {
  const parsed = s.committeeUserSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const me = await getCommitteeSession();
  if (!me) return failure("not_signed_in");
  if (me.role !== "admin") return failure("not_admin");
  if (parsed.data.userId === me.userId) return failure("cannot_reset_self");
  const sb = await createClient();
  const { data: row } = (await sb
    ?.from("committee_accounts")
    .select("login")
    .eq("user_id", parsed.data.userId)
    .maybeSingle()) ?? { data: null };
  if (!row) return failure("not_committee_account");
  const admin = tryCreateAdminClient();
  if (!admin) return failure("not_configured");
  const password = generatePassword();
  try {
    const { error } = await admin.auth.admin.updateUserById(parsed.data.userId, {
      password,
      app_metadata: { setup_pending: true },
    });
    if (error) return failure("unknown");
  } catch {
    return failure("network");
  }
  return { ok: true, data: { userId: parsed.data.userId, login: row.login ?? "", password } };
}

/** Deactivate (no more committee access) or reactivate an account. Never deleted. */
/** Admin: this confirmer is not a member of the fund (no member link expected). */
export async function setCommitteeNotMember(input: s.SetCommitteeNotMemberInput) {
  return run(
    s.setCommitteeNotMemberSchema,
    input,
    (sb, p) =>
      sb.rpc("set_committee_not_member", { p_user_id: p.userId, p_not_member: p.notMember }),
    { touchesPublic: false },
  );
}

export async function setCommitteeActive(input: s.SetCommitteeActiveInput) {
  return run(
    s.setCommitteeActiveSchema,
    input,
    (sb, p) => sb.rpc("set_committee_active", { p_user_id: p.userId, p_active: p.active }),
    { touchesPublic: false },
  );
}

/**
 * Delete an account that never did anything (admin only, not himself). One with history is refused
 * with `has_history`: deactivate it instead. The database removes the committee row (audited),
 * then the login is deleted with the secret key.
 */
export async function deleteCommitteeAccount(input: { userId: string }): Promise<ActionResult> {
  const parsed = s.committeeUserSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const admin = tryCreateAdminClient();
  if (!admin) return failure("not_configured");
  const res = await run(
    s.committeeUserSchema,
    parsed.data,
    (sb, p) => sb.rpc("delete_committee_member", { p_user_id: p.userId }),
    { touchesPublic: false },
  );
  if (!res.ok) return res;
  try {
    const { error } = await admin.auth.admin.deleteUser(parsed.data.userId);
    if (error) throw error;
  } catch (err) {
    // The committee row is gone, so the login opens nothing; it is only an orphan in auth.users.
    console.error("[deleteCommitteeAccount]", err);
    return failure("delete_failed");
  }
  return res;
}

/* ───────────── «حسابي» ───────────── */

/**
 * Edit your own display name, and link your own member row once (memberId null/omitted keeps
 * no link). Changing or removing an existing link is for the admin (own-membership rule).
 */
export async function updateMyProfile(input: s.UpdateMyProfileInput) {
  return run(
    s.updateMyProfileSchema,
    input,
    (sb, p) =>
      sb.rpc("update_my_profile", {
        p_display_name: p.displayName,
        p_member_id: p.memberId ?? undefined,
      }),
    { touchesPublic: false },
  );
}

/**
 * Sign out on every device (all sessions of this login). Pass this browser's push endpoint to
 * stop its notifications first. The caller then navigates to "/".
 */
export async function signOutEverywhere(input: { endpoint?: string } = {}): Promise<ActionResult> {
  const parsed = s.signOutEverywhereSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const sb = await createClient();
  if (!sb) return failure("not_configured");
  if (parsed.data.endpoint) {
    await sb.rpc("delete_push_subscription", { p_endpoint: parsed.data.endpoint });
  }
  const { error } = await sb.auth.signOut({ scope: "global" });
  return error ? failure("network") : { ok: true, data: undefined };
}

/**
 * First sign-in setup (also after an admin password reset): display name, own member row (or
 * none: «لست عضوًا»), a new password. Only while setupPending. An existing link (set by the
 * admin) is kept whatever `memberId` says. The password is set before the flag is cleared, so
 * a failed step leaves the setup to do again, never half-done and hidden.
 */
export async function completeSetup(input: s.CompleteSetupInput): Promise<ActionResult> {
  const parsed = s.completeSetupSchema.safeParse(input);
  if (!parsed.success) {
    const pw = parsed.error.issues.some((i) => i.path[0] === "password");
    return failure(pw ? "weak_password" : "invalid_input");
  }
  const me = await getCommitteeSession();
  if (!me) return failure("not_signed_in");
  if (!me.setupPending) return failure("setup_done");
  const admin = tryCreateAdminClient();
  if (!admin) return failure("not_configured");
  const p = parsed.data;
  // confirmers must be linked to their member row (own-membership rule), unless the admin marked
  // the account as not a member
  if (me.canConfirm && !(me.memberId ?? p.memberId)) {
    const sb = await createClient();
    const { data } = sb
      ? await sb.from("committee").select("not_member").eq("user_id", me.userId).maybeSingle()
      : { data: null };
    if (!data?.not_member) return failure("member_link_required");
  }
  const profile = await updateMyProfile({
    displayName: p.displayName,
    memberId: me.memberId ?? p.memberId ?? null,
  });
  if (!profile.ok) return profile;
  const pw = await setPassword({ password: p.password });
  if (!pw.ok) return pw;
  try {
    const { error } = await admin.auth.admin.updateUserById(me.userId, {
      app_metadata: { setup_pending: false },
    });
    if (error) return failure("unknown");
  } catch {
    return failure("network");
  }
  return { ok: true, data: undefined };
}

/* ───────────── push notifications ───────────── */

/** Save this browser's push subscription for the signed-in committee member. */
export async function savePushSubscription(input: s.PushSubscriptionInput) {
  return run(
    s.pushSubscriptionSchema,
    input,
    (sb, p) =>
      sb.rpc("save_push_subscription", {
        p_endpoint: p.endpoint,
        p_p256dh: p.keys.p256dh,
        p_auth: p.keys.auth,
        p_user_agent: p.userAgent,
      }),
    { touchesPublic: false },
  );
}

/** Forget one of the caller's subscriptions (notifications off, or before signing out). */
export async function deletePushSubscription(input: { endpoint: string }) {
  return run(
    s.pushEndpointSchema,
    input,
    (sb, p) => sb.rpc("delete_push_subscription", { p_endpoint: p.endpoint }),
    { touchesPublic: false },
  );
}
