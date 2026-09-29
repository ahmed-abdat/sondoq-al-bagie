import { describe, expect, it } from "vitest";
import {
  bannerAllowedOn,
  chromeIntentUrl,
  DISMISS_FOR_MS,
  detectPlatform,
  installMode,
  isDismissed,
  isIosSafari,
  isSnoozed,
  offersInstallDialog,
  parseBackoff,
  recordVisitDay,
  shouldInvite,
  snooze,
} from "./install";

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

describe("installMode", () => {
  const base = { standalone: false, hasPrompt: false };
  it("installed wins", () => {
    expect(installMode({ ...base, userAgent: ANDROID, standalone: true })).toBe("installed");
    expect(installMode({ ...base, userAgent: ANDROID, installed: true })).toBe("installed");
  });
  it("Android: native dialog when the browser gave one, else menu steps", () => {
    expect(installMode({ ...base, userAgent: ANDROID, hasPrompt: true })).toBe("native");
    expect(installMode({ ...base, userAgent: ANDROID })).toBe("android");
    expect(installMode({ ...base, userAgent: `${ANDROID} SamsungBrowser/27.0` })).toBe("samsung");
  });
  it("in-app browsers: open in Chrome / Safari", () => {
    const wv = ANDROID.replace("(Linux; Android 10; K)", "(Linux; Android 10; K; wv)");
    expect(installMode({ ...base, userAgent: wv, hasPrompt: true })).toBe("in-app");
    expect(installMode({ ...base, userAgent: `${ANDROID} [FB_IAB/FB4A;FBAV/400.0]` })).toBe(
      "in-app",
    );
    expect(installMode({ ...base, userAgent: `${IPHONE} Instagram 300` })).toBe("in-app");
  });
  it("iPhone: Safari steps, or open in Safari first", () => {
    expect(installMode({ ...base, userAgent: IPHONE })).toBe("ios");
    expect(installMode({ ...base, userAgent: IPHONE.replace("Version/18.0", "CriOS/140.0") })).toBe(
      "ios-other",
    );
  });
  it("desktop", () => {
    expect(installMode({ ...base, userAgent: IPAD_DESKTOP })).toBe("desktop");
    expect(installMode({ ...base, userAgent: IPAD_DESKTOP, hasPrompt: true })).toBe("native");
  });
});

it("chromeIntentUrl opens the same page in Chrome", () => {
  expect(chromeIntentUrl("https://x.app/members?q=1")).toBe(
    "intent://x.app/members?q=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fx.app%2Fmembers%3Fq%3D1;end",
  );
});

describe("when to invite", () => {
  const now = 1_800_000_000_000;
  it("records distinct visit days, last five", () => {
    expect(recordVisitDay(null, "2026-09-28")).toBe("2026-09-28");
    expect(recordVisitDay("2026-09-28", "2026-09-28")).toBe("2026-09-28");
    expect(recordVisitDay("2026-09-28", "2026-09-29")).toBe("2026-09-28,2026-09-29");
    expect(recordVisitDay("a,1,2,3,4,5", "x")).toBe("");
    expect(
      recordVisitDay("2026-01-01,2026-01-02,2026-01-03,2026-01-04,2026-01-05", "2026-01-06"),
    ).toBe("2026-01-02,2026-01-03,2026-01-04,2026-01-05,2026-01-06");
  });
  it("not on the first day unless engaged; never within two weeks of «ليس الآن»", () => {
    const one = "2026-09-28";
    const two = "2026-09-27,2026-09-28";
    expect(shouldInvite({ visitDays: one, engaged: false, dismissedAt: null, now })).toBe(false);
    expect(shouldInvite({ visitDays: one, engaged: true, dismissedAt: null, now })).toBe(true);
    expect(shouldInvite({ visitDays: two, engaged: false, dismissedAt: null, now })).toBe(true);
    expect(shouldInvite({ visitDays: two, engaged: true, dismissedAt: String(now - 1), now })).toBe(
      false,
    );
  });
});

describe("backoff after «✕»", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const t0 = 1_800_000_000_000;
  it("waits 1, 3, 7, 14, then 30 days, capped", () => {
    let stored: string | null = null;
    let now = t0;
    const waits: number[] = [];
    for (let i = 0; i < 7; i++) {
      stored = snooze(stored, now);
      const { nextAt } = parseBackoff(stored);
      waits.push((nextAt - now) / DAY);
      now = nextAt;
    }
    expect(waits).toEqual([1, 3, 7, 14, 30, 30, 30]);
    expect(parseBackoff(stored).count).toBe(7);
  });
  it("snoozed until the next date, then back", () => {
    const s = snooze(null, t0);
    expect(isSnoozed(s, t0 + DAY - 1)).toBe(true);
    expect(isSnoozed(s, t0 + DAY)).toBe(false);
    expect(isSnoozed(null, t0)).toBe(false);
    expect(parseBackoff("garbage")).toEqual({ count: 0, nextAt: 0 });
  });
  it("gates the invite", () => {
    const base = { visitDays: "2026-09-27,2026-09-28", engaged: false, now: t0 };
    expect(shouldInvite(base)).toBe(true);
    expect(shouldInvite({ ...base, backoff: snooze(null, t0) })).toBe(false);
    expect(shouldInvite({ ...base, backoff: snooze(null, t0), now: t0 + DAY })).toBe(true);
    expect(shouldInvite({ ...base, dismissedAt: String(t0 - 1) })).toBe(false); // old key
    expect(shouldInvite({ visitDays: "2026-09-28", engaged: false, sessions: 2, now: t0 })).toBe(
      true,
    );
    expect(shouldInvite({ visitDays: "2026-09-28", engaged: false, sessions: 1, now: t0 })).toBe(
      false,
    );
  });
  it("never on receipt checks or sign-in", () => {
    expect(bannerAllowedOn("/")).toBe(true);
    expect(bannerAllowedOn("/members")).toBe(true);
    expect(bannerAllowedOn("/report")).toBe(false);
    expect(bannerAllowedOn("/reports")).toBe(true);
    expect(bannerAllowedOn("/r/BQ-1")).toBe(false);
    expect(bannerAllowedOn("/login")).toBe(false);
  });
});

describe("offersInstallDialog", () => {
  const ua = {
    chromeAndroid:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
    edgeAndroid:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36 EdgA/140.0",
    desktopChrome:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
    samsung:
      "Mozilla/5.0 (Linux; Android 14; SM-A546B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36",
    firefoxAndroid: "Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0",
    whatsapp:
      "Mozilla/5.0 (Linux; Android 14; Pixel 7; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/140.0 Mobile Safari/537.36 WhatsApp/2.24",
    iosChrome:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/140.0 Mobile/15E148 Safari/604.1",
  };
  it("Chrome and Edge give their own dialog; Samsung, Firefox, in-app and iPhone do not wait for it", () => {
    expect(offersInstallDialog(ua.chromeAndroid)).toBe(true);
    expect(offersInstallDialog(ua.edgeAndroid)).toBe(true);
    expect(offersInstallDialog(ua.desktopChrome)).toBe(true);
    for (const u of [ua.samsung, ua.firefoxAndroid, ua.whatsapp, ua.iosChrome])
      expect(offersInstallDialog(u)).toBe(false);
  });
});
