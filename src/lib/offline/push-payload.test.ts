import { describe, expect, it } from "vitest";
import { pendingPaymentPayload } from "@/lib/push/payload";
import { notificationOptions, parsePushPayload, safePath } from "./push-payload";

describe("parsePushPayload", () => {
  it("reads the server's JSON", () => {
    expect(
      parsePushPayload(
        JSON.stringify({
          title: "دفعة تنتظر التأكيد",
          body: "محمد ولد أحمد: 1 500 أوقية",
          url: "/committee?p=42",
          tag: "pending-42",
        }),
      ),
    ).toEqual({
      title: "دفعة تنتظر التأكيد",
      body: "محمد ولد أحمد: 1 500 أوقية",
      url: "/committee?p=42",
      tag: "pending-42",
    });
  });
  it("falls back safely", () => {
    expect(parsePushPayload(null)).toEqual({
      title: "صندوق الشباب",
      body: "",
      url: "/committee",
      tag: "sondoq",
    });
    expect(parsePushPayload("نص عادي").body).toBe("نص عادي");
    expect(
      parsePushPayload(JSON.stringify({ title: 5, url: "https://evil.example" })),
    ).toMatchObject({ title: "صندوق الشباب", url: "/committee" });
    expect(parsePushPayload(JSON.stringify({ body: "x".repeat(500) })).body).toHaveLength(200);
  });
});

it("safePath keeps only paths on this site", () => {
  expect(safePath("/committee")).toBe("/committee");
  expect(safePath("/r/BQ-1?x=1")).toBe("/r/BQ-1?x=1");
  expect(safePath("//evil.example/x")).toBe("/committee");
  expect(safePath("https://evil.example")).toBe("/committee");
  expect(safePath("javascript:alert(1)")).toBe("/committee");
  expect(safePath("/\\evil")).toBe("/committee");
  expect(safePath(undefined, "/")).toBe("/");
});

it("notification options: Arabic, RTL, icon + monochrome badge, tap target", () => {
  const o = notificationOptions(parsePushPayload(JSON.stringify({ url: "/committee", tag: "t" })));
  expect(o).toMatchObject({
    dir: "rtl",
    lang: "ar",
    icon: "/icons/icon-192.png",
    badge: "/icons/badge-96.png",
    tag: "t",
    renotify: true,
    data: { url: "/committee" },
  });
});

it("reads exactly what the server builds (round trip over the wire)", () => {
  const sent = {
    ...pendingPaymentPayload({
      id: "p-42",
      payerName: "محمد ولد أحمد",
      amount: 1500,
      allocations: [{ kind: "months", year: 2026, month: 9 }],
    }),
    badgeCount: 3,
  };
  expect(parsePushPayload(JSON.stringify(sent))).toEqual(sent);
});
