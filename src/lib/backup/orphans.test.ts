import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { candidates, pruneOrphanProofs } = await import("./orphans");

const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const id2 = "0f8fad5b-d9cb-469f-a165-70867728950e";
const now = new Date("2026-09-28T03:00:00Z");
const old = "2026-09-20T00:00:00Z";

describe("orphan proofs", () => {
  it("only judges app-written files older than a day", () => {
    expect(
      candidates(
        "payments",
        [
          { name: `${id}-0123456789ab.jpg`, created_at: old },
          { name: `${id2}-0123456789ab.webp`, created_at: "2026-09-27T20:00:00Z" }, // fresh
          { name: "notes.txt", created_at: old }, // not ours
          { name: `${id2}-0123456789ab.png`, created_at: null },
        ],
        now,
      ),
    ).toEqual([`payments/${id}-0123456789ab.jpg`]);
  });

  it("removes old files no record points at, keeps referenced ones", async () => {
    const files = {
      payments: [
        { name: `${id}-0123456789ab.jpg`, created_at: old },
        { name: `${id2}-0123456789ab.jpg`, created_at: old },
      ],
      expenses: [],
    };
    const remove = vi.fn(async () => ({ error: null }));
    const sb = {
      storage: {
        from: () => ({
          list: async (folder: "payments" | "expenses") => ({ data: files[folder], error: null }),
          remove,
        }),
      },
      from: () => ({
        select: () => ({
          in: async () => ({
            data: [{ proof_path: `payments/${id}-0123456789ab.jpg` }],
            error: null,
          }),
        }),
      }),
    };
    expect(await pruneOrphanProofs(sb as never, now)).toEqual({ removed: 1 });
    expect(remove).toHaveBeenCalledWith([`payments/${id2}-0123456789ab.jpg`]);
  });
});
