"use server";
// Member writes (personal link, docs/MEMBER-ACCESS.md). Every action reads the `bq_member`
// cookie, hashes it and calls a server-only RPC with the secret key; without a valid link it
// returns `member_link_invalid`. Members never confirm anything: submissions are pending until a
// confirmer decides. Same result shape as the committee actions: { ok, data } | { ok: false, code, message }.
import { after } from "next/server";
import { pendingPaymentPayload } from "@/lib/push/payload";
import { notifyConfirmers } from "@/lib/push/send";
import { tryCreateAdminClient } from "@/lib/supabase/admin";
import { codeOf, failure } from "./errors";
import { hashMemberToken, liveProfiles, memberToken, verifyMemberToken } from "./member";
import {
  activate,
  clearAll,
  clearPending,
  readPending,
  readProfiles,
  withoutProfile,
} from "./member-cookies";
import type { MemberSubmitInput, MemberSubmitResult } from "./member-types";
import { PROOF_MAX_BYTES, proofPath, sha256Hex, sniffImage } from "./proof";
import * as s from "./schemas";
import type { ActionResult } from "./types";

type Admin = NonNullable<ReturnType<typeof tryCreateAdminClient>>;
type LinkContext =
  { ok: true; hash: string; admin: Admin } | { ok: false; error: ReturnType<typeof failure> };

/** Token hash + admin client, or the failure to return. */
async function linkContext(): Promise<LinkContext> {
  const token = await memberToken();
  if (!token) return { ok: false, error: failure("member_link_invalid") };
  const admin = tryCreateAdminClient();
  if (!admin) return { ok: false, error: failure("not_configured") };
  return { ok: true, hash: hashMemberToken(token), admin };
}

/**
 * Upload the transfer screenshot (FormData: file, id = the payment id of the open sheet).
 * Same checks as the committee upload: image by magic bytes, ≤ 400 KB, SHA-256, duplicate check.
 * Saved with the secret key at payments/<id>-<hash>.<ext> (members have no storage access).
 */
export async function memberUploadProof(
  form: FormData,
): Promise<ActionResult<{ path: string; hash: string }>> {
  const file = form.get("file");
  const id = String(form.get("id") ?? "");
  if (!(file instanceof Blob) || !/^[0-9a-f-]{36}$/.test(id)) return failure("invalid_input");
  const ctx = await linkContext();
  if (!ctx.ok) return ctx.error;
  // the link must still work (a revoked link cannot fill the bucket)
  const { data: session, error: sErr } = await ctx.admin.rpc("member_session", {
    p_token_hash: ctx.hash,
  });
  if (sErr) return failure(codeOf(sErr));
  if (!session) return failure("member_link_invalid");
  if (file.size === 0 || file.size > PROOF_MAX_BYTES) return failure("proof_too_large");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniffImage(bytes);
  if (!mime) return failure("proof_not_image");
  const hash = await sha256Hex(bytes);
  try {
    const { data: dup, error } = await ctx.admin
      .from("payments")
      .select("id")
      .eq("proof_hash", hash)
      .in("status", ["pending", "confirmed"])
      .neq("id", id)
      .limit(1);
    if (error) return failure(codeOf(error));
    if (dup?.length) return failure("duplicate_proof");
    const path = proofPath("payments", id, hash, mime);
    const up = await ctx.admin.storage
      .from("proofs")
      .upload(path, bytes, { contentType: mime, upsert: false, cacheControl: "31536000" });
    // same bytes for the same payment → same path: a retry after a lost response is fine
    if (up.error && !/exists|duplicate/i.test(up.error.message)) return failure("unknown");
    return { ok: true, data: { path, hash } };
  } catch {
    return failure("network");
  }
}

/** «أرسلت دفعة»: always pending; the confirmers get a push. Retry with the same id = replay. */
export async function memberSubmitPayment(
  input: MemberSubmitInput,
): Promise<ActionResult<MemberSubmitResult>> {
  if (!input?.proofPath || !input?.proofHash) return failure("proof_required");
  const parsed = s.recordPaymentSchema.safeParse(input);
  if (!parsed.success) {
    const custom = parsed.error.issues.find((i) => i.code === "custom")?.message;
    return failure(custom === "allocations_mismatch" ? custom : "invalid_input");
  }
  const p = parsed.data;
  if (!p.proofPath || !p.proofHash) return failure("proof_required");
  if (p.method === "paper") return failure("invalid_input");
  const ctx = await linkContext();
  if (!ctx.ok) return ctx.error;
  let res;
  try {
    res = await ctx.admin.rpc("member_submit_payment", {
      p_token_hash: ctx.hash,
      p_id: p.id,
      p_payer_name: p.payerName,
      p_method: p.method,
      p_amount: p.amount,
      p_paid_on: p.paidOn,
      p_allocations: p.allocations.map((a) =>
        a.kind === "months"
          ? { kind: a.kind, member_id: a.memberId, year: a.year, month: a.month, amount: a.amount }
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
      p_proof_hash: p.proofHash.toLowerCase(),
      p_note: p.note,
    });
  } catch {
    return failure("network");
  }
  if (res.error) return failure(codeOf(res.error), res.error.details);
  const r = res.data as { id: string; replay: boolean; pending_overlap?: boolean };
  if (!r.replay) {
    const payload = pendingPaymentPayload({
      id: r.id,
      payerName: p.payerName,
      amount: p.amount,
      allocations: p.allocations,
    });
    after(() => notifyConfirmers(null, payload));
  }
  return {
    ok: true,
    data: { id: r.id, replay: r.replay, pendingOverlap: r.pending_overlap ?? false },
  };
}

/**
 * «أبلغني عند التأكيد»: this device gets the confirm/reject pushes of EVERY profile saved on it
 * (a family phone follows everyone it holds).
 */
export async function memberSavePush(input: s.PushSubscriptionInput): Promise<ActionResult> {
  const parsed = s.pushSubscriptionSchema.safeParse(input);
  if (!parsed.success) return failure("invalid_input");
  const admin = tryCreateAdminClient();
  if (!admin) return failure("not_configured");
  const { saved } = await readProfiles();
  if (!saved.length) return failure("member_link_invalid");
  const { error } = await admin.rpc("member_save_push", {
    p_token_hashes: saved.map(hashMemberToken),
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.keys.p256dh,
    p_auth: parsed.data.keys.auth,
  });
  return error ? failure(codeOf(error)) : { ok: true, data: undefined };
}

/** Stop the active profile's pushes on this device (the other profiles keep theirs). */
export async function memberDeletePush(input: { endpoint: string }): Promise<ActionResult> {
  const ctx = await linkContext();
  if (!ctx.ok) return { ok: true, data: undefined }; // nothing to remove without a link
  const { error } = await ctx.admin.rpc("member_delete_push", {
    p_token_hash: ctx.hash,
    p_endpoint: String(input?.endpoint ?? ""),
  });
  return error ? failure(codeOf(error)) : { ok: true, data: undefined };
}

/** «أنت» switcher: act as another profile saved on this device. */
export async function memberSwitch(input: { linkId: string }): Promise<ActionResult> {
  const { saved } = await readProfiles();
  const live = await liveProfiles(saved);
  const token = saved.find((t) => live.get(t)?.linkId === input?.linkId);
  if (!token) return failure("member_link_invalid");
  await activate(token, saved);
  return { ok: true, data: undefined };
}

/** «أضف X وانتقل إليه»: save the pending link (cap 5, least recently used drops) and use it. */
export async function memberAcceptPending(): Promise<ActionResult> {
  const pending = await readPending();
  if (!pending || !(await verifyMemberToken(pending))) {
    await clearPending();
    return failure("member_link_invalid");
  }
  const { saved } = await readProfiles();
  await activate(pending, saved);
  await clearPending();
  return { ok: true, data: undefined };
}

/** «ابقَ بالاسم الحالي»: forget the pending link. */
export async function memberDeclinePending(): Promise<ActionResult> {
  await clearPending();
  return { ok: true, data: undefined };
}

/**
 * «خروج من هذا الجهاز» for the ACTIVE profile only (and its push on this device, if given). The
 * next saved profile becomes active; with none left, every member cookie (and the flag) goes.
 */
export async function memberSignOut(input: { endpoint?: string } = {}): Promise<ActionResult> {
  if (input?.endpoint) await memberDeletePush({ endpoint: input.endpoint });
  const { active, saved } = await readProfiles();
  const rest = active ? withoutProfile(saved, active) : saved;
  const live = await liveProfiles(rest);
  const next = rest.find((t) => live.has(t));
  if (next)
    await activate(
      next,
      rest.filter((t) => live.has(t)),
    );
  else await clearAll();
  return { ok: true, data: undefined };
}
