import { describe, expect, it } from "vitest";
import { allowsBackgroundDownload } from "./data-saver";

describe("allowsBackgroundDownload", () => {
  it.each([
    [undefined, true],
    [{}, true],
    [{ effectiveType: "4g" }, true],
    [{ effectiveType: "3g" }, true],
    [{ effectiveType: "2g" }, false],
    [{ effectiveType: "slow-2g" }, false],
    [{ saveData: true, effectiveType: "4g" }, false],
  ])("%j → %s", (conn, ok) => expect(allowsBackgroundDownload(conn)).toBe(ok));
});
