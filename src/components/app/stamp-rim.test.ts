import { expect, it } from "vitest";
import { RIM_BOTTOM, RIM_TOP } from "./stamp-rim";

/** Every point of a rim path, as distance from the stamp's centre (100, 100) and side. */
const points = (d: string) => {
  const n = d.match(/-?\d*\.?\d+/g)!.map(Number);
  return Array.from({ length: n.length / 2 }, (_, i) => ({ x: n[2 * i], y: n[2 * i + 1] }));
};

it("rim texts sit between the inner ring (r63) and the thin ring (r89.5), on their half", () => {
  for (const [d, top] of [
    [RIM_TOP, true],
    [RIM_BOTTOM, false],
  ] as const) {
    expect(d).toMatch(/^M[\d.\s]+/);
    for (const p of points(d)) {
      const r = Math.hypot(p.x - 100, p.y - 100);
      expect(r).toBeGreaterThan(63);
      expect(r).toBeLessThan(89.5);
      expect(top ? p.y < 100 : p.y > 100).toBe(true);
    }
  }
});
