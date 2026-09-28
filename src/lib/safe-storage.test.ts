import { afterEach, describe, expect, it, vi } from "vitest";
import { safeStorage } from "./safe-storage";

afterEach(() => vi.restoreAllMocks());

describe("safeStorage", () => {
  it("round-trips through localStorage", () => {
    safeStorage.setItem("k", "v");
    expect(window.localStorage.getItem("k")).toBe("v");
    expect(safeStorage.getItem("k")).toBe("v");
    safeStorage.removeItem("k");
    expect(safeStorage.getItem("k")).toBeNull();
  });

  it("falls back to memory when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    safeStorage.setItem("x", "1");
    expect(safeStorage.getItem("x")).toBe("1");
  });
});
