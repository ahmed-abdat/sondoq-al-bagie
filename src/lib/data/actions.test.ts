import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const updateTag = vi.fn();
let configured = true;

vi.mock("next/cache", () => ({ updateTag: (t: string) => updateTag(t) }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "app.test" }) }));
let session: { role: string } | null = null;
vi.mock("./committee", () => ({ getCommitteeSession: async () => session }));
const inviteUserByEmail = vi.fn();
let secret = true;
vi.mock("@/lib/supabase/admin", () => ({
  tryCreateAdminClient: () => (secret ? { auth: { admin: { inviteUserByEmail } } } : null),
}));
const updateUser = vi.fn();
const getUser = vi.fn();
const resetPasswordForEmail = vi.fn();
const upload = vi.fn();
const createSignedUrl = vi.fn();
let dupRows: { id: string }[] = [];
const query = {
  select: () => query,
  eq: () => query,
  in: () => query,
  neq: () => query,
  limit: async () => ({ data: dupRows, error: null }),
};
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () =>
    configured
      ? {
          rpc,
          from: () => query,
          storage: { from: () => ({ upload, createSignedUrl }) },
          auth: { updateUser, getUser, resetPasswordForEmail },
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
  inviteCommitteeMember,
  setPassword,
  requestPasswordReset,
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
  session = null;
  secret = true;
  inviteUserByEmail.mockReset();
  updateUser.mockReset();
  getUser.mockReset();
  resetPasswordForEmail.mockReset();
  upload.mockReset();
  createSignedUrl.mockReset();
  dupRows = [];
  rpc.mockReset();
  updateTag.mockReset();
  configured = true;
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

  const invite = {
    email: " New@Example.com ",
    displayName: "عضو اللجنة",
    role: "committee" as const,
  };

  it("only an admin invites, and only with the server secret", async () => {
    expect(await inviteCommitteeMember(invite)).toMatchObject({ code: "not_signed_in" });
    session = { role: "treasurer" };
    expect(await inviteCommitteeMember(invite)).toMatchObject({ code: "not_admin" });
    session = { role: "admin" };
    secret = false;
    expect(await inviteCommitteeMember(invite)).toMatchObject({ code: "not_configured" });
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });

  it("invites by email then sets the role as the admin", async () => {
    session = { role: "admin" };
    const uid = "0f8fad5b-d9cb-469f-a165-70867728950e";
    inviteUserByEmail.mockResolvedValue({ data: { user: { id: uid } }, error: null });
    rpc.mockResolvedValue({ data: null, error: null });
    expect(await inviteCommitteeMember(invite)).toEqual({ ok: true, data: { userId: uid } });
    expect(inviteUserByEmail).toHaveBeenCalledWith("new@example.com", {
      redirectTo: "https://app.test/auth/confirm?next=%2Fcommittee%2Fsettings",
    });
    expect(rpc).toHaveBeenCalledWith(
      "set_committee_member",
      expect.objectContaining({ p_user_id: uid, p_role: "committee" }),
    );
    inviteUserByEmail.mockResolvedValue({
      data: null,
      error: { message: "User already registered" },
    });
    expect(await inviteCommitteeMember(invite)).toMatchObject({ code: "already_registered" });
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

  it("answers ok to a reset request whether or not the account exists", async () => {
    resetPasswordForEmail.mockResolvedValue({ error: { message: "User not found" } });
    expect(await requestPasswordReset({ email: "nobody@example.com" })).toEqual({
      ok: true,
      data: undefined,
    });
    expect(await requestPasswordReset({ email: "not-an-email" })).toMatchObject({
      code: "invalid_input",
    });
  });
});
