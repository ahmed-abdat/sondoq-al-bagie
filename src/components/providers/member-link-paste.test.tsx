import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemberLinkPaste } from "./member-link-paste";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const TOKEN = "Qm9zc2EtdGVzdC10b2tlbi0wMTIzNDU2Nzg5YWJjZGVm_-x";
let host: HTMLDivElement;
let root: Root;
let assign: ReturnType<typeof vi.fn>;

function device(o: { standalone: boolean; member?: boolean; clipboard?: string }) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("standalone") ? o.standalone : false,
  }));
  document.cookie = `bq_member_on=${o.member ? "1" : "0"}`;
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { readText: async () => o.clipboard ?? "" },
  });
}

beforeEach(() => {
  assign = vi.fn();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { ...window.location, assign },
  });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
});

const render = () => act(async () => root.render(<MemberLinkPaste />));
const button = (name: string) =>
  [...host.querySelectorAll("button")].find((b) => b.textContent?.includes(name))!;

it("installed app without a link: pasting the WhatsApp message opens the link in the app", async () => {
  device({
    standalone: true,
    clipboard: `هذا رابطك الخاص في صندوق الرابطة: https://baqie.vercel.app/m/${TOKEN}`,
  });
  await render();
  expect(host.textContent).toContain("لديك رابط من اللجنة؟");
  await act(async () => button("الصق الرابط").click());
  expect(assign).toHaveBeenCalledWith(`/m/${TOKEN}`);
});

it("something else pasted: says so, goes nowhere", async () => {
  device({ standalone: true, clipboard: "مرحبا" });
  await render();
  await act(async () => button("الصق الرابط").click());
  expect(assign).not.toHaveBeenCalled();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("ليس رابطًا من اللجنة");
});

it("hidden in the browser tab, and once the device has a member link", async () => {
  device({ standalone: false });
  await render();
  expect(host.textContent).toBe("");
  device({ standalone: true, member: true });
  await render();
  expect(host.textContent).toBe("");
});
