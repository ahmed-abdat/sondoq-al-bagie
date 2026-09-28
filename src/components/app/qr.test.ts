import { describe, expect, it } from "vitest";
import { qrMatrix } from "./qr";

describe("qrMatrix", () => {
  it("picks the smallest version and draws the finder patterns", () => {
    const m = qrMatrix("https://sondoq.example/r/BQ-7F3K-0231");
    expect(m.length).toBe(29); // 37 bytes → version 3 (17 + 4·3)
    const finder = (x: number, y: number) =>
      [0, 1, 2, 3, 4, 5, 6].map((i) => m[y][x + i]).join(",");
    expect(finder(0, 0)).toBe("true,true,true,true,true,true,true");
    expect(m[1].slice(0, 7)).toEqual([true, false, false, false, false, false, true]);
    expect(m[3].slice(0, 7)).toEqual([true, false, true, true, true, false, true]);
    expect(m[0].slice(m.length - 7).every(Boolean)).toBe(true);
  });
  it("is deterministic and rejects long text", () => {
    expect(qrMatrix("abc")).toEqual(qrMatrix("abc"));
    expect(qrMatrix("abc").length).toBe(21);
    expect(() => qrMatrix("x".repeat(120))).toThrow();
  });
});
