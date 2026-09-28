import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
let session: object | null = null;
vi.mock("./committee", () => ({ getCommitteeSession: async () => session }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
const membersAdmin = vi.fn();
vi.mock("./read", () => ({ membersAdmin: (...a: unknown[]) => membersAdmin(...a) }));
const { exportRoute } = await import("./export");

afterEach(() => {
  session = null;
  membersAdmin.mockReset();
});

describe("export routes", () => {
  it("refuses without a committee session", async () => {
    const res = await exportRoute("members")();
    expect(res.status).toBe(401);
    expect(membersAdmin).not.toHaveBeenCalled();
  });

  it("returns an uncached CSV download", async () => {
    session = { userId: "u" };
    membersAdmin.mockResolvedValue([]);
    const res = await exportRoute("members")();
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/csv; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(res.headers.get("content-disposition")).toMatch(
      /^attachment; filename="members-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    // text() would drop the BOM; check the bytes Excel sees.
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it("hides database errors", async () => {
    session = { userId: "u" };
    membersAdmin.mockRejectedValue(new Error("boom"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await exportRoute("members")()).status).toBe(500);
  });
});
