// Drift guard between the SQL error codes (P0001 + HINT) and the Arabic messages.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MESSAGES } from "./errors";

/** Raised only by guards the RPCs already enforce first; users never see them. */
const INTERNAL = ["confirm_only", "stamp_once"];

const dir = join(process.cwd(), "supabase/migrations");
const sql = readdirSync(dir)
  .filter((f) => f.endsWith(".sql"))
  .map((f) => readFileSync(join(dir, f), "utf8"))
  .join("\n");

const codes = new Set(
  [
    ...sql.matchAll(/(?:fail|month_error)\('([a-z_]+)'/g),
    ...sql.matchAll(/hint\s*=\s*'([a-z_]+)'/g),
  ].map((m) => m[1]),
);

describe("error codes", () => {
  it("finds the SQL codes", () => {
    expect(codes.size).toBeGreaterThan(30);
    expect(codes).toContain("month_already_paid");
  });

  it("every SQL error code has an Arabic message (or is internal)", () => {
    const missing = [...codes].filter((c) => !(c in MESSAGES) && !INTERNAL.includes(c));
    expect(missing).toEqual([]);
  });

  it('every failure("…") code in the data layer has a message', () => {
    const libDir = join(process.cwd(), "src/lib/data");
    const ts = readdirSync(libDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => readFileSync(join(libDir, f), "utf8"))
      .join("\n");
    const used = [...ts.matchAll(/failure\(\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(used.filter((c) => !(c in MESSAGES))).toEqual([]);
  });
});
