import { describe, expect, it } from "vitest";
import { enhancePixels, upscaleFactor } from "./preprocess";

const px = (...grays: number[]) => new Uint8ClampedArray(grays.flatMap((g) => [g, g, g, 255]));

describe("preprocess", () => {
  it("stretches a low-contrast light image to full range", () => {
    const p = px(...Array(50).fill(200), ...Array(50).fill(150));
    enhancePixels(p);
    expect(p[0]).toBe(255);
    expect(p[50 * 4]).toBe(0);
  });

  it("inverts a dark-mode screenshot so text becomes dark on light", () => {
    const p = px(...Array(90).fill(20), ...Array(10).fill(230)); // dark background, light text
    enhancePixels(p);
    expect(p[0]).toBe(255); // background now white
    expect(p[95 * 4]).toBe(0); // text now black
  });

  it("upscales only small images", () => {
    expect(upscaleFactor(540)).toBe(2);
    expect(upscaleFactor(300)).toBe(2.5);
    expect(upscaleFactor(1080)).toBe(1);
  });
});
