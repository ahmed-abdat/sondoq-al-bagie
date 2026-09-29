import { describe, expect, it } from "vitest";
import { demoPhoneOf } from "./demo-member";

describe("demoPhoneOf", () => {
  it("keeps the demo tokens only", () => {
    expect(
      demoPhoneOf({ active: "demo2", saved: ["demo2", "x".repeat(43), "demo"], pending: "zzz" }),
    ).toEqual({ active: "demo2", profiles: ["demo2", "demo"], pending: null });
  });
});
