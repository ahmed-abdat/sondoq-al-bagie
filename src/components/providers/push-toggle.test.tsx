import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  closeStaleNotifications,
  pushState,
  subscribePush,
  unsubscribePush,
  urlBase64ToUint8Array,
} from "@/lib/push";
import { PushToggle } from "./push-toggle";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ANDROID =
  "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36";
const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/** A phone with a service worker and a push service we control. */
function phone(o: {
  permission?: NotificationPermission;
  answer?: NotificationPermission;
  subscribed?: boolean;
  ua?: string;
  standalone?: boolean;
}) {
  const subscription = {
    endpoint: "https://push.example/abc",
    toJSON: () => ({ keys: { p256dh: "P", auth: "A" } }),
    unsubscribe: vi.fn(async () => true),
  };
  let current = o.subscribed ? subscription : null;
  const pushManager = {
    getSubscription: vi.fn(async () => current),
    subscribe: vi.fn(async () => (current = subscription)),
  };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ pushManager }) },
  });
  Object.defineProperty(navigator, "userAgent", { configurable: true, value: o.ua ?? ANDROID });
  vi.stubGlobal("PushManager", function PushManager() {});
  const N = {
    permission: o.permission ?? "default",
    requestPermission: vi.fn(async () => (N.permission = o.answer ?? "granted")),
  };
  vi.stubGlobal("Notification", N);
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("standalone") ? !!o.standalone : false,
    addEventListener() {},
    removeEventListener() {},
  }));
  return { pushManager, subscription, N };
}

beforeEach(() =>
  vi.stubEnv(
    "NEXT_PUBLIC_VAPID_PUBLIC_KEY",
    "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
  ),
);
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("decodes the VAPID key (65-byte P-256 point)", () => {
  const k = urlBase64ToUint8Array(
    "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U",
  );
  expect(k).toHaveLength(65);
  expect(k[0]).toBe(4);
});

describe("pushState", () => {
  it("off / on / denied", async () => {
    phone({});
    expect(await pushState()).toBe("off");
    phone({ permission: "granted", subscribed: true });
    expect(await pushState()).toBe("on");
    phone({ permission: "denied" });
    expect(await pushState()).toBe("denied");
  });
  it("iPhone in Safari: install first; installed: works", async () => {
    phone({ ua: IPHONE });
    expect(await pushState()).toBe("install-first");
    phone({ ua: IPHONE, standalone: true });
    expect(await pushState()).toBe("off");
  });
  it("no VAPID key or no PushManager: unsupported", async () => {
    phone({});
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    expect(await pushState()).toBe("unsupported");
  });
});

describe("subscribe / unsubscribe", () => {
  it("asks permission, subscribes with the key, hands the subscription to save", async () => {
    const { pushManager, N } = phone({});
    const save = vi.fn(async () => ({ ok: true }));
    expect(await subscribePush(save)).toBe("on");
    expect(N.requestPermission).toHaveBeenCalledOnce();
    expect(pushManager.subscribe).toHaveBeenCalledWith(
      expect.objectContaining({ userVisibleOnly: true }),
    );
    expect(save).toHaveBeenCalledWith({
      endpoint: "https://push.example/abc",
      keys: { p256dh: "P", auth: "A" },
    });
  });
  it("refused: nothing subscribed", async () => {
    const { pushManager } = phone({ answer: "denied" });
    const save = vi.fn(async () => ({ ok: true }));
    expect(await subscribePush(save)).toBe("denied");
    expect(pushManager.subscribe).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  it("server refused: undo the browser subscription", async () => {
    const { subscription } = phone({});
    expect(await subscribePush(async () => ({ ok: false }))).toBe("error");
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
  it("off: removes on the server, then in the browser", async () => {
    const { subscription } = phone({ permission: "granted", subscribed: true });
    const remove = vi.fn(async () => ({ ok: true }));
    expect(await unsubscribePush(remove)).toBe("off");
    expect(remove).toHaveBeenCalledWith("https://push.example/abc");
    expect(subscription.unsubscribe).toHaveBeenCalled();
  });
});

describe("<PushToggle/>", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  const render = async (el: React.ReactElement) => {
    await act(async () => root.render(el));
    await act(async () => {}); // pushState settles
  };
  const sw = () => host.querySelector('[role="switch"]') as HTMLButtonElement;
  const ok = async () => ({ ok: true });

  it("never asks for permission by itself; a tap turns it on", async () => {
    const { N } = phone({});
    const save = vi.fn(ok);
    await render(<PushToggle save={save} remove={ok} />);
    expect(N.requestPermission).not.toHaveBeenCalled();
    expect(sw().getAttribute("aria-checked")).toBe("false");
    expect(sw().disabled).toBe(false);
    await act(async () => sw().click());
    expect(N.requestPermission).toHaveBeenCalledOnce();
    expect(save).toHaveBeenCalledOnce();
    expect(sw().getAttribute("aria-checked")).toBe("true");
    expect(host.textContent).toContain("يصلك تنبيه على هذا الهاتف");
  });

  it("denied: disabled, says how to allow", async () => {
    phone({ permission: "denied" });
    await render(<PushToggle save={ok} remove={ok} />);
    expect(sw().disabled).toBe(true);
    expect(host.textContent).toContain("فعّلها من إعدادات المتصفح");
  });

  it("iPhone in Safari: install first", async () => {
    phone({ ua: IPHONE });
    await render(<PushToggle save={ok} remove={ok} />);
    expect(sw().disabled).toBe(true);
    expect(host.textContent).toContain("ثبّت التطبيق أولًا لتصلك الإشعارات");
  });

  it("server error: stays off and says so", async () => {
    phone({});
    await render(<PushToggle save={async () => ({ ok: false })} remove={ok} />);
    await act(async () => sw().click());
    expect(sw().getAttribute("aria-checked")).toBe("false");
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("تعذّر");
  });
});

it("closes notifications of payments no longer pending, keeps the rest", async () => {
  const n = (tag: string) => ({ tag, close: vi.fn() });
  const list = [n("pending-1"), n("pending-2"), n("other")];
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { ready: Promise.resolve({ getNotifications: async () => list }) },
  });
  expect(await closeStaleNotifications(["2"])).toBe(1);
  expect(list[0].close).toHaveBeenCalled();
  expect(list[1].close).not.toHaveBeenCalled();
  expect(list[2].close).not.toHaveBeenCalled();
});
