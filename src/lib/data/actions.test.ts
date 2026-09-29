import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const updateTag = vi.fn();
let configured = true;

vi.mock("next/cache", () => ({ updateTag: (t: string) => updateTag(t) }));
vi.mock("server-only", () => ({}));
const afterFns: (() => unknown)[] = [];
vi.mock("next/server", () => ({ after: (fn: () => unknown) => afterFns.push(fn) }));
const notifyConfirmers = vi.fn();
vi.mock("@/lib/push/send", () => ({
  notifyConfirmers: (...a: unknown[]) => notifyConfirmers(...a),
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test" }) }));
let session: {
  role: string;
  userId?: string;
  setupPending?: boolean;
  memberId?: string | null;
} | null = null;
vi.mock("./committee", () => ({ getCommitteeSession: async () => session }));
const createUser = vi.fn();
const deleteUser = vi.fn(async () => ({}));
const updateUserById = vi.fn();
let accountRow: { login: string } | null = null;
let secret = true;
vi.mock("@/lib/supabase/admin", () => ({
  tryCreateAdminClient: () =>
    secret ? { auth: { admin: { createUser, deleteUser, updateUserById } } } : null,
}));
const updateUser = vi.fn();
const getUser = vi.fn();
const signOut = vi.fn();
const upload = vi.fn();
const createSignedUrl = vi.fn();
let dupRows: { id: string }[] = [];
const query = {
  select: () => query,
  eq: () => query,
  in: () => query,
  neq: () => query,
  limit: async () => ({ data: dupRows, error: null }),
  maybeSingle: async () => ({ data: accountRow, error: null }),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    configured
      ? {
          rpc,
          from: () => query,
          storage: { from: () => ({ upload, createSignedUrl }) },
          auth: { updateUser, getUser, signOut },
        }
      : null,
}));

const {
  recordPayment,
  confirmPayment,
  rejectPayment,
  undoPayment,
  updateSettings,
  uploadProof,
  proofUrl,
  setPassword,
  createCommitteeAccount,
  resetCommitteePassword,
  deleteCommitteeAccount,
  signOutEverywhere,
  completeSetup,
  linkCommitteeMember,
} = await import("./actions");

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const member = "0f8fad5b-d9cb-469f-a165-70867728950e";
const payment = {
  id,
  payerName: "دافع",
  method: "sedad" as const,
  amount: 1000,
  paidOn: "2026-09-01",
  allocations: [{ kind: "months" as const, memberId: member, year: 2026, month: 9, amount: 1000 }],
};

beforeEach(() => {
  createUser.mockReset();
  deleteUser.mockClear();
  updateUserById.mockReset();
  accountRow = null;
  session = null;
  secret = true;
  updateUser.mockReset();
  getUser.mockReset();
  upload.mockReset();
  createSignedUrl.mockReset();
  dupRows = [];
  rpc.mockReset();
  updateTag.mockReset();
  configured = true;
  afterFns.length = 0;
  notifyConfirmers.mockReset();
});

describe("actions", () => {
  it("records a payment with snake_case allocations and expires the public cache", async () => {
    rpc.mockResolvedValue({
      data: { id, status: "confirmed", replay: false, already: false },
      error: null,
    });
    const r = await recordPayment(payment);
    expect(r).toEqual({
      ok: true,
      data: { id, status: "confirmed", replay: false, receiptCode: null },
    });
    expect(rpc).toHaveBeenCalledWith(
      "record_payment",
      expect.objectContaining({
        p_id: id,
        p_method: "sedad",
        p_allocations: [{ kind: "months", member_id: member, year: 2026, month: 9, amount: 1000 }],
      }),
    );
    expect(updateTag).toHaveBeenCalledWith("public");
  });

  it("notifies the other confirmers after a new pending payment, not a replay or a confirmed one", async () => {
    session = { role: "committee", userId: "u1" };
    rpc.mockResolvedValue({ data: { id, status: "pending", replay: false }, error: null });
    await recordPayment(payment);
    expect(afterFns).toHaveLength(1);
    await afterFns[0]();
    expect(notifyConfirmers).toHaveBeenCalledWith("u1", {
      title: "دفعة بانتظار التأكيد",
      body: "دافع · 1\u202f000 أوقية · سبتمبر 2026",
      url: "/committee",
      tag: `pending-${id}`,
    });
    rpc.mockResolvedValue({ data: { id, status: "pending", replay: true }, error: null });
    await recordPayment(payment);
    rpc.mockResolvedValue({ data: { id, status: "confirmed", replay: false }, error: null });
    await recordPayment(payment);
    expect(afterFns).toHaveLength(1);
  });

  it("returns an Arabic error for an RPC hint and does not expire the cache", async () => {
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", hint: "month_already_paid", message: "x" },
    });
    const r = await recordPayment(payment);
    expect(r).toMatchObject({ ok: false, code: "month_already_paid" });
    expect(!r.ok && r.message).toMatch(/مدفوع/);
    expect(updateTag).not.toHaveBeenCalled();
  });

  it("validates before calling the database", async () => {
    const r = await recordPayment({ ...payment, amount: 500 });
    expect(r).toMatchObject({ ok: false, code: "allocations_mismatch" });
    expect(await rejectPayment({ id, reason: "  " })).toMatchObject({
      ok: false,
      code: "invalid_input",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports who confirmed first on a double confirmation", async () => {
    rpc.mockResolvedValue({
      data: {
        status: "confirmed",
        already: true,
        decided_by_name: "الأمين",
        decided_at: "2026-09-01T10:00:00Z",
      },
      error: null,
    });
    expect(await confirmPayment({ id })).toEqual({
      ok: true,
      data: {
        already: true,
        decidedByName: "الأمين",
        decidedAt: "2026-09-01T10:00:00Z",
        receiptCode: null,
      },
    });
  });

  it("maps network failures and missing configuration", async () => {
    rpc.mockRejectedValue(new TypeError("fetch failed"));
    expect(await undoPayment({ id })).toMatchObject({ ok: false, code: "network" });
    configured = false;
    expect(await undoPayment({ id })).toMatchObject({ ok: false, code: "not_configured" });
  });

  it("passes only the settings that were given", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await updateSettings({ whatsappContact: "" });
    expect(rpc).toHaveBeenCalledWith("update_settings", {
      p_opening_balance: undefined,
      p_opening_balance_on: undefined,
      p_grace_days: undefined,
      p_show_amount_owed: undefined,
      p_whatsapp_contact: "",
    });
  });

  const proofForm = (bytes: number[], kind = "payments") => {
    const f = new FormData();
    f.set("file", new Blob([new Uint8Array(bytes)]));
    f.set("kind", kind);
    f.set("id", id);
    return f;
  };
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 1, 2, 3];

  it("uploads a real image under a hash-based path", async () => {
    upload.mockResolvedValue({ data: {}, error: null });
    const r = await uploadProof(proofForm(JPEG));
    expect(r.ok).toBe(true);
    const path = r.ok ? r.data.path : "";
    expect(path).toMatch(new RegExp(`^payments/${id}-[0-9a-f]{12}\\.jpg$`));
    expect(upload).toHaveBeenCalledWith(
      path,
      expect.any(Uint8Array),
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
  });

  it("refuses non-images, reused screenshots and bad input", async () => {
    expect(await uploadProof(proofForm([0x3c, 0x73, 0x76, 0x67]))).toMatchObject({
      code: "proof_not_image",
    });
    dupRows = [{ id: "other" }];
    expect(await uploadProof(proofForm(JPEG))).toMatchObject({ code: "duplicate_proof" });
    expect(await uploadProof(proofForm(JPEG, "avatars"))).toMatchObject({ code: "invalid_input" });
    expect(upload).not.toHaveBeenCalled();
  });

  it("treats an already-uploaded identical file as success", async () => {
    upload.mockResolvedValue({ data: null, error: { message: "The resource already exists" } });
    expect((await uploadProof(proofForm(JPEG))).ok).toBe(true);
  });

  it("signs only app proof paths", async () => {
    expect(await proofUrl({ path: "../x" })).toMatchObject({ code: "invalid_input" });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://x.supabase.co/storage/v1/s" },
      error: null,
    });
    expect(await proofUrl({ path: `payments/${id}-0123456789ab.jpg` })).toEqual({
      ok: true,
      data: "https://x.supabase.co/storage/v1/s",
    });
  });

  it("sets a password only for a signed-in user and rejects short ones", async () => {
    expect(await setPassword({ password: "short" })).toMatchObject({ code: "weak_password" });
    getUser.mockResolvedValue({ data: { user: null } });
    expect(await setPassword({ password: "long enough pass" })).toMatchObject({
      code: "not_signed_in",
    });
    getUser.mockResolvedValue({ data: { user: { id: "u" } } });
    updateUser.mockResolvedValue({ error: null });
    expect(await setPassword({ password: "long enough pass" })).toEqual({
      ok: true,
      data: undefined,
    });
  });

  const uid = "0f8fad5b-d9cb-469f-a165-70867728950e";

  it("creates a phone login with a generated password, then sets the role", async () => {
    session = { role: "admin", userId: "me" };
    createUser.mockResolvedValue({ data: { user: { id: uid } }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    const r = await createCommitteeAccount({
      displayName: "أمين الصندوق",
      login: "36 12 34 56",
      role: "treasurer",
    });
    expect(r.ok).toBe(true);
    const data = r.ok ? r.data : null;
    expect(data).toMatchObject({ userId: uid, login: "+22236123456" });
    expect(data?.password).toMatch(/^[a-z2-9]{12}$/);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "22236123456@phone.sondoq.invalid",
        email_confirm: true,
        password: data?.password,
        app_metadata: { setup_pending: true },
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "set_committee_member",
      expect.objectContaining({ p_user_id: uid, p_role: "treasurer" }),
    );
  });

  it("refuses bad logins, non-admins, taken logins; removes the login if the role fails", async () => {
    session = { role: "admin", userId: "me" };
    expect(
      await createCommitteeAccount({ displayName: "x", login: "123", role: "committee" }),
    ).toMatchObject({ code: "bad_login" });
    createUser.mockResolvedValue({
      data: { user: null },
      error: { message: "A user with this email address has already been registered" },
    });
    expect(
      await createCommitteeAccount({ displayName: "x", login: "a@b.co", role: "committee" }),
    ).toMatchObject({ code: "login_taken" });
    createUser.mockResolvedValue({ data: { user: { id: uid } }, error: null });
    rpc.mockResolvedValue({
      data: null,
      error: { code: "P0001", hint: "not_admin", message: "x" },
    });
    expect(
      await createCommitteeAccount({ displayName: "x", login: "a@b.co", role: "committee" }),
    ).toMatchObject({ code: "not_admin" });
    expect(deleteUser).toHaveBeenCalledWith(uid);
    session = { role: "treasurer" };
    expect(
      await createCommitteeAccount({ displayName: "x", login: "a@b.co", role: "committee" }),
    ).toMatchObject({ code: "not_admin" });
  });

  it("resets another committee member's password, never the admin's own", async () => {
    session = { role: "admin", userId: uid };
    expect(await resetCommitteePassword({ userId: uid })).toMatchObject({
      code: "cannot_reset_self",
    });
    session = { role: "admin", userId: "me" };
    expect(await resetCommitteePassword({ userId: uid })).toMatchObject({
      code: "not_committee_account",
    });
    accountRow = { login: "+22236123456" };
    updateUserById.mockResolvedValue({ error: null });
    const r = await resetCommitteePassword({ userId: uid });
    expect(r).toMatchObject({ ok: true, data: { userId: uid, login: "+22236123456" } });
    expect(updateUserById).toHaveBeenCalledWith(uid, {
      password: r.ok ? r.data.password : "",
      app_metadata: { setup_pending: true },
    });
  });

  describe("deleteCommitteeAccount", () => {
    const userId = "0f8fad5b-d9cb-469f-a165-70867728950e";
    it("needs the secret key before touching anything", async () => {
      secret = false;
      expect(await deleteCommitteeAccount({ userId })).toMatchObject({
        ok: false,
        code: "not_configured",
      });
      expect(rpc).not.toHaveBeenCalled();
    });
    it("refuses an account with history and keeps the login", async () => {
      rpc.mockResolvedValue({
        data: null,
        error: { code: "P0001", hint: "has_history", message: "x" },
      });
      const r = await deleteCommitteeAccount({ userId });
      expect(r).toMatchObject({ ok: false, code: "has_history" });
      expect(!r.ok && r.message).toMatch(/أوقفه/);
      expect(deleteUser).not.toHaveBeenCalled();
    });
    it("removes the committee row then the login", async () => {
      rpc.mockResolvedValue({ data: null, error: null });
      deleteUser.mockResolvedValueOnce({ error: null } as never);
      expect(await deleteCommitteeAccount({ userId })).toEqual({ ok: true, data: undefined });
      expect(rpc).toHaveBeenCalledWith("delete_committee_member", { p_user_id: userId });
      expect(deleteUser).toHaveBeenCalledWith(userId);
    });
    it("says so when the login could not be deleted", async () => {
      rpc.mockResolvedValue({ data: null, error: null });
      deleteUser.mockResolvedValueOnce({ error: { message: "boom" } } as never);
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await deleteCommitteeAccount({ userId })).toMatchObject({
        ok: false,
        code: "delete_failed",
      });
    });
  });

  it("signs out everywhere after dropping this browser's push subscription", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    signOut.mockResolvedValue({ error: null });
    expect(await signOutEverywhere({ endpoint: "https://push.test/1" })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(rpc).toHaveBeenCalledWith("delete_push_subscription", {
      p_endpoint: "https://push.test/1",
    });
    expect(signOut).toHaveBeenCalledWith({ scope: "global" });
    rpc.mockClear();
    await signOutEverywhere();
    expect(rpc).not.toHaveBeenCalled();
  });

  describe("completeSetup", () => {
    const me = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const input = { displayName: " سيدي ", memberId: member, password: "new-secret-9" };
    const ready = () => {
      session = { role: "committee", userId: me, setupPending: true, memberId: null };
      rpc.mockResolvedValue({ data: null, error: null });
      getUser.mockResolvedValue({ data: { user: { id: me } } });
      updateUser.mockResolvedValue({ error: null });
      updateUserById.mockResolvedValue({ error: null });
    };

    it("saves the name and member, sets the password, then clears the flag", async () => {
      ready();
      expect(await completeSetup(input)).toEqual({ ok: true, data: undefined });
      expect(rpc).toHaveBeenCalledWith("update_my_profile", {
        p_display_name: "سيدي",
        p_member_id: member,
      });
      expect(updateUser).toHaveBeenCalledWith({ password: "new-secret-9" });
      expect(updateUserById).toHaveBeenCalledWith(me, { app_metadata: { setup_pending: false } });
    });

    it("finishes with «لست عضوًا», and keeps a link the admin already set", async () => {
      ready();
      await completeSetup({ ...input, memberId: null });
      expect(rpc).toHaveBeenCalledWith("update_my_profile", {
        p_display_name: "سيدي",
        p_member_id: undefined,
      });
      ready();
      session = { ...session!, memberId: "9b2e5c1a-3d4f-4a6b-8c7d-0e1f2a3b4c5d" };
      rpc.mockClear();
      await completeSetup({ ...input, memberId: null });
      expect(rpc).toHaveBeenCalledWith(
        "update_my_profile",
        expect.objectContaining({ p_member_id: "9b2e5c1a-3d4f-4a6b-8c7d-0e1f2a3b4c5d" }),
      );
    });

    it("stops early: weak password, setup already done, member taken, same password", async () => {
      ready();
      expect(await completeSetup({ ...input, password: "short" })).toMatchObject({
        code: "weak_password",
      });
      expect(rpc).not.toHaveBeenCalled();
      session = { role: "committee", userId: me, setupPending: false };
      expect(await completeSetup(input)).toMatchObject({ code: "setup_done" });
      ready();
      rpc.mockResolvedValue({
        data: null,
        error: { code: "P0001", hint: "member_taken", message: "x" },
      });
      expect(await completeSetup(input)).toMatchObject({ code: "member_taken" });
      expect(updateUser).not.toHaveBeenCalled();
      ready();
      updateUser.mockResolvedValue({
        error: { message: "New password should be different from the old password." },
      });
      expect(await completeSetup(input)).toMatchObject({ code: "same_password" });
      expect(updateUserById).not.toHaveBeenCalled();
    });
  });

  describe("linkCommitteeMember", () => {
    const uid = "0f8fad5b-d9cb-469f-a165-70867728950e";
    it("admin only; keeps name, role and active; null unlinks", async () => {
      session = { role: "treasurer", userId: "me" };
      expect(await linkCommitteeMember({ userId: uid, memberId: null })).toMatchObject({
        code: "not_admin",
      });
      session = { role: "admin", userId: "me" };
      accountRow = null;
      expect(await linkCommitteeMember({ userId: uid, memberId: null })).toMatchObject({
        code: "not_committee_account",
      });
      accountRow = { display_name: "سيدي", role: "deputy", active: false } as never;
      rpc.mockResolvedValue({ data: null, error: null });
      expect(await linkCommitteeMember({ userId: uid, memberId: null })).toEqual({
        ok: true,
        data: undefined,
      });
      expect(rpc).toHaveBeenCalledWith("set_committee_member", {
        p_user_id: uid,
        p_display_name: "سيدي",
        p_role: "deputy",
        p_member_id: null,
        p_active: false,
      });
      rpc.mockResolvedValue({
        data: null,
        error: {
          code: "23505",
          message: 'duplicate key value violates unique constraint "committee_member_id_key"',
        },
      });
      expect(await linkCommitteeMember({ userId: uid, memberId: member })).toMatchObject({
        code: "member_taken",
      });
    });
  });
});
