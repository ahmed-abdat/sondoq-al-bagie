import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => null }));
const { notifyMember } = await import("./member");
const { memberConfirmedPayload, memberRejectedPayload } = await import("./payload");

type Tables = Record<string, unknown>;
/** Admin stand-in: one row (or rows) per table; records deletes/updates. */
function fakeAdmin(t: Tables) {
  const writes: string[] = [];
  const q = (table: string) => {
    const chain = {
      select: () => chain,
      eq: () => chain,
      maybeSingle: async () => ({ data: t[table] ?? null, error: null }),
      then: (res: (v: unknown) => unknown) => res({ data: t[table] ?? [], error: null }),
      update: () => ({ eq: async () => void writes.push(`update ${table}`) }),
      delete: () => ({ eq: async () => void writes.push(`delete ${table}`) }),
    };
    return chain;
  };
  return { admin: { from: q } as never, writes };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:x@y.z");
});

describe("member push", () => {
  it("says what was confirmed and links the receipt; a rejection gives the reason", () => {
    expect(
      memberConfirmedPayload({
        id: "p1",
        amount: 3000,
        receiptCode: "BQ-ABCD-1234",
        allocations: [
          { kind: "months", year: 2026, month: 7 },
          { kind: "months", year: 2026, month: 8 },
        ],
      }),
    ).toMatchObject({ title: "تم تأكيد دفعتك", url: "/r/BQ-ABCD-1234", tag: "member-p1" });
    expect(memberRejectedPayload({ id: "p1", reason: "صورة غير واضحة" })).toMatchObject({
      title: "رُفضت الدفعة",
      body: "صورة غير واضحة",
      url: "/me",
    });
  });

  it("sends to the devices of the link that sent the payment", async () => {
    const { admin } = fakeAdmin({
      payments: {
        id: "p1",
        status: "rejected",
        amount: 1000,
        reject_reason: "مكرر",
        submitted_via_link: "l1",
      },
      member_links: { revoked_at: null },
      member_push_subscriptions: [
        { id: "s1", endpoint: "https://push.test/1", p256dh: "k", auth: "a", failures: 0 },
      ],
    });
    const send = vi.fn(async () => ({}));
    expect(await notifyMember("p1", { admin, send: send as never })).toEqual({
      ok: 1,
      gone: 0,
      failed: 0,
    });
    expect(JSON.parse((send.mock.calls[0] as unknown[])[1] as string)).toMatchObject({
      body: "مكرر",
    });
  });

  it("does nothing for committee payments or a revoked link, and drops a gone device", async () => {
    const send = vi.fn(async () => ({}));
    const committee = fakeAdmin({
      payments: { id: "p1", status: "confirmed", submitted_via_link: null },
    });
    expect(await notifyMember("p1", { admin: committee.admin, send: send as never })).toEqual({
      ok: 0,
      gone: 0,
      failed: 0,
    });
    const revoked = fakeAdmin({
      payments: { id: "p1", status: "rejected", reject_reason: "x", submitted_via_link: "l1" },
      member_links: { revoked_at: "2026-09-29T00:00:00Z" },
    });
    expect(await notifyMember("p1", { admin: revoked.admin, send: send as never })).toEqual({
      ok: 0,
      gone: 0,
      failed: 0,
    });
    expect(send).not.toHaveBeenCalled();
    const gone = fakeAdmin({
      payments: { id: "p1", status: "rejected", reject_reason: "x", submitted_via_link: "l1" },
      member_links: { revoked_at: null },
      member_push_subscriptions: [
        { id: "s1", endpoint: "https://push.test/1", p256dh: "k", auth: "a", failures: 0 },
      ],
    });
    const fail = vi.fn(async () => Promise.reject({ statusCode: 410 }));
    expect(await notifyMember("p1", { admin: gone.admin, send: fail as never })).toMatchObject({
      gone: 1,
    });
    expect(gone.writes).toContain("delete member_push_subscriptions");
  });
});
