import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { beforeEach, expect, it, vi } from "vitest";

const toast = vi.fn();
vi.mock("sonner", () => ({ toast: (...a: unknown[]) => toast(...a) }));

const { reportActionError } = await import("./sw-update");

beforeEach(() => {
  toast.mockReset();
  const update = vi.fn(async () => {});
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { getRegistration: async () => ({ update, waiting: null, installing: null }) },
  });
});

it("an action from an older app version: offers the update", async () => {
  expect(reportActionError(new UnrecognizedActionError("gone"))).toBe(true);
  await vi.waitFor(() => expect(toast).toHaveBeenCalledOnce());
  const [title, opts] = toast.mock.calls[0] as [string, { id: string; action: { label: string } }];
  expect(title).toBe("نسخة جديدة من التطبيق متاحة");
  expect(opts).toMatchObject({ id: "stale-app", action: { label: "تحديث" } });
});

it("any other failure: left to the caller", async () => {
  expect(reportActionError(new Error("network"))).toBe(false);
  expect(reportActionError({ ok: false })).toBe(false);
  await new Promise((r) => setTimeout(r, 10));
  expect(toast).not.toHaveBeenCalled();
});
