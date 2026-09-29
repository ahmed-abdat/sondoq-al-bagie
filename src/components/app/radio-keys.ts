// Custom chip radio groups behave like native radios (audit B06): one Tab stop per group (the
// checked chip, or the first when none is), arrow keys move and choose, Home/End jump. RTL-aware:
// in Arabic the next chip is to the left.
import type { KeyboardEvent } from "react";

/** tabIndex for chip `i`: 0 for the group's one Tab stop, -1 for the rest. */
export const radioTab = (checked: boolean, i: number, anyChecked: boolean) =>
  checked || (!anyChecked && i === 0) ? 0 : -1;

/** The index a key moves to from `i` among `n` chips (wrapping), or null for other keys. */
export function nextRadio(i: number, n: number, key: string, rtl: boolean): number | null {
  if (n <= 0) return null;
  const fwd = key === "ArrowDown" || key === (rtl ? "ArrowLeft" : "ArrowRight");
  const back = key === "ArrowUp" || key === (rtl ? "ArrowRight" : "ArrowLeft");
  if (fwd) return (i + 1) % n;
  if (back) return (i - 1 + n) % n;
  if (key === "Home") return 0;
  if (key === "End") return n - 1;
  return null;
}

/** onKeyDown for the role="radiogroup" element: focus and click (choose) the next chip. */
export function radioKeys(e: KeyboardEvent<HTMLElement>) {
  const radios = [
    ...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]:not([disabled])'),
  ];
  const i = radios.indexOf(e.target as HTMLElement);
  if (i < 0) return;
  const rtl = getComputedStyle(e.currentTarget).direction === "rtl";
  const j = nextRadio(i, radios.length, e.key, rtl);
  if (j === null) return;
  e.preventDefault();
  radios[j].focus();
  if (radios[j].getAttribute("aria-checked") !== "true") radios[j].click();
}
