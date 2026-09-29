import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { setPendingCount } from "@/components/app/pending-count";
import { AppBadgeSync } from "./app-badge";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

let host: HTMLDivElement;
let root: Root;
let badge: { setAppBadge: ReturnType<typeof vi.fn>; clearAppBadge: ReturnType<typeof vi.fn> };
beforeEach(() => {
  badge = { setAppBadge: vi.fn(async () => {}), clearAppBadge: vi.fn(async () => {}) };
  Object.assign(navigator, badge);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  refresh.mockReset();
  vi.useRealTimers();
});

it("confirmers: the icon shows the pending count and follows it live", async () => {
  await act(async () => root.render(<AppBadgeSync canConfirm fallback={3} />));
  expect(badge.setAppBadge).toHaveBeenLastCalledWith(3);
  await act(async () => setPendingCount(2));
  expect(badge.setAppBadge).toHaveBeenLastCalledWith(2);
  await act(async () => setPendingCount(0));
  expect(badge.clearAppBadge).toHaveBeenCalled();
});

it("members who cannot confirm: cleared", async () => {
  await act(async () => root.render(<AppBadgeSync canConfirm={false} fallback={5} />));
  expect(badge.setAppBadge).not.toHaveBeenCalled();
  expect(badge.clearAppBadge).toHaveBeenCalled();
});

it("back in the foreground: refreshes the count from the server, at most every 30 s", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  await act(async () => root.render(<AppBadgeSync canConfirm fallback={1} />));
  window.dispatchEvent(new Event("focus"));
  expect(refresh).not.toHaveBeenCalled();
  vi.setSystemTime(Date.now() + 31_000);
  window.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledOnce();
  window.dispatchEvent(new Event("focus"));
  expect(refresh).toHaveBeenCalledOnce();
});
