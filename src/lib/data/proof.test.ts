import { describe, expect, it } from "vitest";
import { dataUrlToBlob, isProofPath, proofPath, sha256Hex, sniffImage } from "./proof";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");
const SVG = new TextEncoder().encode("<svg xmlns=");

describe("proof", () => {
  it("sniffs jpeg/png/webp and rejects anything else", () => {
    expect(sniffImage(JPEG)).toBe("image/jpeg");
    expect(sniffImage(PNG)).toBe("image/png");
    expect(sniffImage(WEBP)).toBe("image/webp");
    expect(sniffImage(SVG)).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });

  it("hashes with sha-256", async () => {
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });

  it("builds stable paths it later accepts", () => {
    const id = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
    const p = proofPath("payments", id, "ba7816bf8f01cfea414140de", "image/webp");
    expect(p).toBe(`payments/${id}-ba7816bf8f01.webp`);
    expect(isProofPath(p)).toBe(true);
    expect(isProofPath("payments/../secret.jpg")).toBe(false);
    expect(isProofPath("other/x.jpg")).toBe(false);
  });

  it("turns a data URL into a blob", async () => {
    const blob = dataUrlToBlob("data:image/jpeg;base64,/9j/4A==");
    expect(blob.type).toBe("image/jpeg");
    expect(sniffImage(new Uint8Array(await blob.arrayBuffer()))).toBe("image/jpeg");
  });
});
