import { describe, expect, it } from "vitest";
import { codeOf, failure, MESSAGES, messageFor } from "./errors";

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

  it("maps other database states to calm messages", () => {
    expect(codeOf({ code: "23503", message: "violates foreign key constraint" })).toBe(
      "invalid_input",
    );
    expect(codeOf({ code: "23502", message: "null value" })).toBe("invalid_input");
    expect(codeOf({ code: "23P01", message: "conflicting key value" })).toBe("invalid_input");
    expect(codeOf({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(
      "timeout",
    );
    for (const code of ["40001", "40P01", "PGRST202"]) expect(codeOf({ code })).toBe("busy");
    expect(codeOf({ code: "23505", message: 'unique constraint "handovers_one_active"' })).toBe(
      "handover_in_progress",
    );
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

  it("names the member and month from a month error's detail", () => {
    const d = (x: object) => JSON.stringify(x);
    const paid = failure("month_already_paid", d({ name: "محمد", ref: "A-12", ym: "2026-07" }));
    expect(paid.code).toBe("month_already_paid");
    expect(paid.message).toBe("شهر يوليو 2026 لـ محمد (\u2066A-12\u2069) مدفوع من قبل.");
    expect(messageFor("month_not_owed", d({ name: "محمد", ym: "2026-01" }))).toBe(
      "شهر يناير 2026 غير مستحق على محمد: قبل انضمامه، أو بعد إعفائه أو مغادرته.",
    );
    expect(
      messageFor("wrong_month_amount", d({ name: "محمد", ym: "2026-03", price: 1000 })),
    ).toMatch(/^رسوم شهر مارس 2026 لـ محمد هي 1.000 أوقية\.$/);
  });

  it("falls back to the plain message on a missing or odd detail", () => {
    for (const detail of [
      null,
      "",
      "not json",
      "{}",
      JSON.stringify({ name: "x", ym: "2026-13" }),
    ]) {
      expect(messageFor("month_already_paid", detail)).toBe(MESSAGES.month_already_paid);
    }
    expect(messageFor("wrong_month_amount", JSON.stringify({ name: "x", ym: "2026-03" }))).toBe(
      MESSAGES.wrong_month_amount,
    );
    expect(messageFor("not_pending", JSON.stringify({ name: "x", ym: "2026-03" }))).toBe(
      MESSAGES.not_pending,
    );
  });
});
