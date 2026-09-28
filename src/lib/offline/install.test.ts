import { describe, expect, it } from "vitest";
import { DISMISS_FOR_MS, detectPlatform, isDismissed, isIosSafari } from "./install";

const ANDROID =
  "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";

describe("detectPlatform", () => {
  it("detects Android and iOS (incl. iPadOS)", () => {
    expect(detectPlatform(ANDROID)).toBe("android");
    expect(detectPlatform(IPHONE)).toBe("ios");
    expect(detectPlatform(IPAD_DESKTOP, 5)).toBe("ios");
    expect(detectPlatform(IPAD_DESKTOP, 0)).toBe("other");
  });
});

describe("isIosSafari", () => {
  it("is false inside Chrome for iOS or in-app browsers", () => {
    expect(isIosSafari(IPHONE)).toBe(true);
    expect(isIosSafari(IPHONE.replace("Version/18.0", "CriOS/140.0"))).toBe(false);
    expect(isIosSafari(`${IPHONE} [FBAN/FBIOS]`)).toBe(false);
  });
});

describe("isDismissed", () => {
  const now = 1_800_000_000_000;
  it("hides the prompt for two weeks after «ليس الآن»", () => {
    expect(isDismissed(String(now - 1000), now)).toBe(true);
    expect(isDismissed(String(now - DISMISS_FOR_MS - 1), now)).toBe(false);
    expect(isDismissed(null, now)).toBe(false);
    expect(isDismissed("garbage", now)).toBe(false);
  });
});
