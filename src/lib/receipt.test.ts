import { describe, expect, it } from "vitest";
import { isSafeImageDataUrl, safeReceiptSrc } from "./receipt";

const SB = "https://abc.supabase.co";

describe("safeReceiptSrc", () => {
  it("allows raster data URLs, blob previews and our Supabase Storage", () => {
    expect(safeReceiptSrc("data:image/jpeg;base64,AAAA", SB)).toBe("data:image/jpeg;base64,AAAA");
    expect(safeReceiptSrc("blob:https://app.example/1234", SB)).toBe(
      "blob:https://app.example/1234",
    );
    const signed = `${SB}/storage/v1/object/sign/receipts/a.jpg?token=x`;
    expect(safeReceiptSrc(signed, SB)).toBe(signed);
  });

  it("rejects scripts, svg, other hosts and other paths", () => {
    expect(safeReceiptSrc("javascript:alert(1)", SB)).toBeNull();
    expect(safeReceiptSrc("data:image/svg+xml;base64,PHN2Zz4=", SB)).toBeNull();
    expect(safeReceiptSrc("data:text/html;base64,AAAA", SB)).toBeNull();
    expect(safeReceiptSrc("https://evil.example/x.png", SB)).toBeNull();
    expect(safeReceiptSrc(`${SB}/rest/v1/members`, SB)).toBeNull();
    expect(safeReceiptSrc("http://abc.supabase.co/storage/v1/object/x", SB)).toBeNull();
    expect(safeReceiptSrc(`${SB}/storage/v1/object/x`, undefined)).toBeNull();
    expect(safeReceiptSrc("", SB)).toBeNull();
    expect(safeReceiptSrc("/relative.png", SB)).toBeNull();
  });

  it("checks data URLs strictly", () => {
    expect(isSafeImageDataUrl("data:image/png;base64,AAAA")).toBe(true);
    expect(isSafeImageDataUrl("data:image/png;base64,AA AA")).toBe(false);
  });
});
