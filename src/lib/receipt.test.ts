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

describe("safeReceiptSrc on a local Supabase (http on loopback)", () => {
  const LOCAL = "http://127.0.0.1:55321";
  const signed = `${LOCAL}/storage/v1/object/sign/proofs/a.jpg?token=t`;

  it("allows a signed Storage URL when the configured project is the same loopback URL", () => {
    expect(safeReceiptSrc(signed, LOCAL)).toBe(signed);
    const lh = "http://localhost:54321/storage/v1/object/sign/proofs/a.jpg?token=t";
    expect(safeReceiptSrc(lh, "http://localhost:54321")).toBe(lh);
  });

  it("refuses http anywhere else, and anything that is not a signed Storage URL", () => {
    // http on a real host, even when configured so
    expect(
      safeReceiptSrc("http://example.com/storage/v1/object/sign/a.jpg", "http://example.com"),
    ).toBeNull();
    // the project is https: an http URL is refused, even on loopback
    expect(safeReceiptSrc(signed, "https://abc.supabase.co")).toBeNull();
    // another origin (port) than the configured one
    expect(safeReceiptSrc("http://127.0.0.1:9999/storage/v1/object/sign/a.jpg", LOCAL)).toBeNull();
    // not a signed object URL
    expect(safeReceiptSrc(`${LOCAL}/storage/v1/object/public/a.jpg`, LOCAL)).toBeNull();
    expect(safeReceiptSrc(`${LOCAL}/auth/v1/user`, LOCAL)).toBeNull();
    expect(safeReceiptSrc("javascript:alert(1)", LOCAL)).toBeNull();
    expect(safeReceiptSrc("data:image/svg+xml;base64,PHN2Zz4=", LOCAL)).toBeNull();
  });
});
