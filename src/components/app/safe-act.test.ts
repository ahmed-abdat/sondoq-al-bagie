import { describe, expect, it } from "vitest";
import { MESSAGES } from "@/lib/data/errors";
import { safeAct } from "./safe-act";

describe("safeAct", () => {
  it("passes answers through", async () => {
    const f = safeAct(async (n: number) => ({ ok: true as const, data: n * 2 }));
    expect(await f(2)).toEqual({ ok: true, data: 4 });
  });
  it("a thrown action becomes the network failure", async () => {
    const f = safeAct(async () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await f()).toEqual({ ok: false, code: "network", message: MESSAGES.network });
  });
  it("an error reported elsewhere (old app) is stale_app with no message", async () => {
    const f = safeAct(
      async () => {
        throw new Error("gone");
      },
      () => true,
    );
    expect(await f()).toEqual({ ok: false, code: "stale_app", message: "" });
  });
});
