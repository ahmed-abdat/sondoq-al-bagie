import { describe, expect, it } from "vitest";
import { isDemo } from "./demo";

describe("isDemo", () => {
  it("is on only with fixtures outside production", () => {
    expect(isDemo({ SONDOQ_FIXTURES: "1" })).toBe(true);
    expect(isDemo({ SONDOQ_FIXTURES: "1", VERCEL_ENV: "preview" })).toBe(true);
    expect(isDemo({ SONDOQ_FIXTURES: "1", VERCEL_ENV: "development" })).toBe(true);
  });
  it("is never on in production or without fixtures", () => {
    expect(isDemo({ SONDOQ_FIXTURES: "1", VERCEL_ENV: "production" })).toBe(false);
    expect(isDemo({ VERCEL_ENV: "preview" })).toBe(false);
    expect(isDemo({ SONDOQ_FIXTURES: "true" })).toBe(false);
    expect(isDemo({})).toBe(false);
  });
});
