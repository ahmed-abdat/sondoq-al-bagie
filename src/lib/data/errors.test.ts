import { describe, expect, it } from "vitest";
import { codeOf, failure, messageFor } from "./errors";

describe("errors", () => {
  it("uses the RPC hint as the code", () => {
    expect(
      codeOf({ code: "P0001", hint: "month_already_paid", message: "sondoq: month_already_paid" }),
    ).toBe("month_already_paid");
  });

  it("maps unique violations to business codes", () => {
    expect(
      codeOf({
        code: "23505",
        message: 'duplicate key value violates unique constraint "payments_txn_ref_uniq"',
      }),
    ).toBe("duplicate_txn_ref");
    expect(codeOf({ code: "23505", message: 'unique constraint "members_number_key"' })).toBe(
      "number_taken",
    );
  });

  it("maps permission and network errors", () => {
    expect(codeOf({ code: "42501", message: "permission denied" })).toBe("not_committee");
    expect(codeOf({ message: "TypeError: fetch failed" })).toBe("network");
    expect(codeOf({ code: "XX000", message: "?" })).toBe("unknown");
  });

  it("has an Arabic message for every code and a fallback", () => {
    expect(failure("undo_expired")).toEqual({
      ok: false,
      code: "undo_expired",
      message: messageFor("undo_expired"),
    });
    expect(messageFor("undo_expired")).toMatch(/[؀-ۿ]/);
    expect(messageFor("no_such_code")).toBe(messageFor("unknown"));
  });
});
