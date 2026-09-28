import jsQR from "jsqr";
import { describe, expect, it } from "vitest";
import { qrMatrix } from "./qr";

/** Renders the matrix to RGBA pixels (4px per module, 4-module quiet zone) and decodes it. */
function decode(m: boolean[][]): string | undefined {
  const scale = 4;
  const n = m.length + 8;
  const size = n * scale;
  const px = new Uint8ClampedArray(size * size * 4).fill(255);
  m.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (!dark) return;
      for (let dy = 0; dy < scale; dy++)
        for (let dx = 0; dx < scale; dx++) {
          const i = (((y + 4) * scale + dy) * size + (x + 4) * scale + dx) * 4;
          px[i] = px[i + 1] = px[i + 2] = 0;
        }
    }),
  );
  return jsQR(px, size, size)?.data;
}

describe("qrMatrix", () => {
  it.each([
    "BQ-7K2M-0231",
    "https://sondoq-al-bagie.vercel.app/r/BQ-7K2M-0231",
    "https://a-much-longer-preview-host-name-for-testing.vercel.app/r/BQ-7K2M-0231",
  ])("round-trips %s through a real decoder", (text) => {
    expect(decode(qrMatrix(text))).toBe(text);
  });
  it("rejects text that does not fit version 5", () => {
    expect(() => qrMatrix("x".repeat(107))).toThrow();
  });
});
