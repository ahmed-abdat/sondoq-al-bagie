import { describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/data/types";
import { onceId, sendOnce } from "./once-id";

let n = 0;
const make = () => `id-${++n}`;
const NET = { ok: false as const, code: "network", message: "تعذّر الاتصال" };

/** The shape of the record/expense submit: upload the proof, then record, both with the id. */
function form(
  upload: (id: string) => Promise<ActionResult>,
  record: (id: string) => Promise<ActionResult<string>>,
) {
  const once = onceId(make);
  const submit = () =>
    sendOnce(once, async (id) => {
      const up = await upload(id);
      if (!up.ok) return up;
      return record(id);
    });
  return { once, submit };
}

describe("one id per form (retry after a lost answer)", () => {
  it("a retry after the answer was lost sends the same id to upload and record", async () => {
    const upload = vi
      .fn<(id: string) => Promise<ActionResult>>()
      .mockResolvedValue({ ok: true, data: undefined });
    const record = vi
      .fn<(id: string) => Promise<ActionResult<string>>>()
      .mockResolvedValueOnce(NET) // the server saved it, the answer never came back
      .mockImplementationOnce(async (id) => ({ ok: true, data: id })); // replayed
    const f = form(upload, record);
    expect((await f.submit()).ok).toBe(false);
    expect((await f.submit()).ok).toBe(true);
    const [first, second] = record.mock.calls.map((c) => c[0]);
    expect(second).toBe(first);
    expect(upload.mock.calls[1][0]).toBe(upload.mock.calls[0][0]);
    expect(upload.mock.calls[0][0]).toBe(first);
  });

  it("a thrown send keeps the id too", async () => {
    const once = onceId(make);
    const seen: string[] = [];
    await expect(
      sendOnce(once, async (id) => {
        seen.push(id);
        throw new Error("fetch failed");
      }),
    ).rejects.toThrow();
    await sendOnce(once, async (id) => {
      seen.push(id);
      return { ok: true, data: undefined };
    });
    expect(seen[1]).toBe(seen[0]);
  });

  it("a refused upload keeps the id", async () => {
    const upload = vi
      .fn()
      .mockResolvedValueOnce(NET)
      .mockResolvedValue({ ok: true, data: undefined });
    const record = vi.fn(async (id: string) => ({ ok: true as const, data: id }));
    const f = form(upload, record);
    await f.submit();
    await f.submit();
    expect(upload.mock.calls[1][0]).toBe(upload.mock.calls[0][0]);
    expect(record.mock.calls[0][0]).toBe(upload.mock.calls[0][0]);
  });

  it("after success the next payment gets a new id", async () => {
    const record = vi.fn(async (id: string) => ({ ok: true as const, data: id }));
    const f = form(async () => ({ ok: true, data: undefined }), record);
    await f.submit();
    await f.submit();
    expect(record.mock.calls[1][0]).not.toBe(record.mock.calls[0][0]);
  });
});
