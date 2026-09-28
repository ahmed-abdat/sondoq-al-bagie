import { describe, expect, it } from "vitest";
import { dataUrlBytes, dataUrlToBlob, fitWithin } from "./compress-image";

describe("fitWithin", () => {
  it("scales the longest side down, never up", () => {
    expect(fitWithin(4000, 3000, 1280)).toEqual({ width: 1280, height: 960 });
    expect(fitWithin(3000, 4000, 1280)).toEqual({ width: 960, height: 1280 });
    expect(fitWithin(800, 600, 1280)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(0, 600, 1280)).toEqual({ width: 0, height: 0 });
  });
});

describe("data URLs", () => {
  it("counts decoded bytes", () => {
    expect(dataUrlBytes("data:image/jpeg;base64,AAAA")).toBe(3);
    expect(dataUrlBytes("data:image/jpeg;base64,AA==")).toBe(1);
  });
  it("converts to a typed Blob", () => {
    const blob = dataUrlToBlob("data:image/jpeg;base64,AAAA");
    expect(blob.type).toBe("image/jpeg");
    expect(blob.size).toBe(3);
  });
});
