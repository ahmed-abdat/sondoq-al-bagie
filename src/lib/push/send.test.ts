import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => null }));
const { MAX_FAILURES, outcomeOf, sendPush } = await import("./send");

const payload = { title: "t", body: "b", url: "/committee", tag: "pending-1" };
type Row = { id: string; endpoint: string; p256dh: string; auth: string; failures: number };

/** Admin client stand-in: records updates/deletes per subscription id. */
function fakeAdmin(rows: Row[]) {
  const writes: [string, string, unknown?][] = [];
  const admin = {
    from: () => ({
      select: () => ({ in: async () => ({ data: rows, error: null }) }),
      update: (v: unknown) => ({
        eq: async (_: string, id: string) => void writes.push(["update", id, v]),
      }),
      delete: () => ({ eq: async (_: string, id: string) => void writes.push(["delete", id]) }),
    }),
  };
  return { admin: admin as never, writes };
}
const row = (id: string, failures = 0): Row => ({
  id,
  endpoint: `https://push.test/${id}`,
  p256dh: "k",
  auth: "a",
  failures,
});

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "pub");
  vi.stubEnv("VAPID_PRIVATE_KEY", "priv");
  vi.stubEnv("VAPID_SUBJECT", "mailto:x@test.invalid");
});
afterEach(() => vi.unstubAllEnvs());

describe("push send", () => {
  it("treats 404/410 as unsubscribed and anything else as a failure", () => {
    expect(outcomeOf({ statusCode: 410 })).toBe("gone");
    expect(outcomeOf({ statusCode: 404 })).toBe("gone");
    expect(outcomeOf({ statusCode: 500 })).toBe("failed");
    expect(outcomeOf(new Error("network"))).toBe("failed");
  });

  it("sends the JSON payload, marks successes, deletes gone ones and counts failures", async () => {
    const { admin, writes } = fakeAdmin([
      row("ok"),
      row("gone"),
      row("flaky", 1),
      row("dead", MAX_FAILURES - 1),
    ]);
    const send = vi.fn<
      (sub: { endpoint: string }, body: string, opts: unknown) => Promise<unknown>
    >(async (sub) => {
      if (sub.endpoint.endsWith("/gone")) throw { statusCode: 410 };
      if (!sub.endpoint.endsWith("/ok")) throw { statusCode: 500 };
      return {};
    });
    const counts = await sendPush(["u1"], payload, { admin, send: send as never });
    expect(counts).toEqual({ ok: 1, gone: 1, failed: 2 });
    expect(send.mock.calls[0][1]).toBe(JSON.stringify(payload));
    expect(send.mock.calls[0][2]).toMatchObject({
      vapidDetails: { publicKey: "pub" },
      topic: "pending-1",
    });
    expect(writes).toContainEqual(["update", "ok", expect.objectContaining({ failures: 0 })]);
    expect(writes).toContainEqual(["delete", "gone"]);
    expect(writes).toContainEqual(["update", "flaky", { failures: 2 }]);
    expect(writes).toContainEqual(["delete", "dead"]);
  });

  it("does nothing without VAPID keys, a secret key or recipients", async () => {
    const send = vi.fn();
    const { admin } = fakeAdmin([row("ok")]);
    expect(await sendPush([], payload, { admin, send })).toEqual({ ok: 0, gone: 0, failed: 0 });
    expect(await sendPush(["u1"], payload, { admin: null, send })).toEqual({
      ok: 0,
      gone: 0,
      failed: 0,
    });
    vi.stubEnv("VAPID_PRIVATE_KEY", "");
    expect(await sendPush(["u1"], payload, { admin, send })).toEqual({ ok: 0, gone: 0, failed: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("notifyConfirmers", () => {
  it("adds the current pending count as badgeCount and skips the recorder", async () => {
    vi.resetModules();
    const sent: unknown[] = [];
    const committee = {
      select: () => ({
        eq: () => ({
          in: async () => ({ data: [{ user_id: "rec" }, { user_id: "t" }], error: null }),
        }),
      }),
    };
    const payments = { select: () => ({ eq: async () => ({ count: 3, error: null }) }) };
    const subs = {
      select: () => ({
        in: async (_: string, ids: string[]) => ({ data: ids.map((id) => row(id)), error: null }),
      }),
      update: () => ({ eq: async () => undefined }),
      delete: () => ({ eq: async () => undefined }),
    };
    const admin = {
      from: (t: string) => (t === "committee" ? committee : t === "payments" ? payments : subs),
    };
    vi.doMock("@/lib/supabase/admin", () => ({ tryCreateAdminClient: () => admin }));
    vi.doMock("web-push", () => ({
      default: {
        sendNotification: async (s: { endpoint: string }, body: string) =>
          void sent.push([s.endpoint, JSON.parse(body)]),
      },
    }));
    const m = await import("./send");
    await m.notifyConfirmers("rec", payload);
    expect(sent).toEqual([["https://push.test/t", { ...payload, badgeCount: 3 }]]);
  });

  it("filters devices by the chosen kind when one is given (m29)", async () => {
    const calls: unknown[][] = [];
    const q = {
      in: (...a: unknown[]) => (calls.push(["in", ...a]), q),
      contains: (...a: unknown[]) => (calls.push(["contains", ...a]), q),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(ok),
    };
    const admin = { from: () => ({ select: () => q }) } as never;
    await sendPush(["u1"], payload, { admin, kind: "expense", send: vi.fn() });
    expect(calls).toContainEqual(["contains", "kinds", ["expense"]]);
    calls.length = 0;
    await sendPush(["u1"], payload, { admin, send: vi.fn() });
    expect(calls.some((c) => c[0] === "contains")).toBe(false);
  });
});
