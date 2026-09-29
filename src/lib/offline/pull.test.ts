import { describe, expect, it } from "vitest";
import {
  canStartPull,
  inHorizontalScroller,
  isVerticalPull,
  PULL_MAX,
  PULL_THRESHOLD,
  pullDistance,
  pullProgress,
} from "./pull";

describe("pullDistance", () => {
  it("is 0 when pushing up and grows with the finger", () => {
    expect(pullDistance(-20)).toBe(0);
    expect(pullDistance(0)).toBe(0);
    expect(pullDistance(50)).toBeGreaterThan(0);
    expect(pullDistance(100)).toBeGreaterThan(pullDistance(50));
  });
  it("resists (moves less than the finger) and never passes the max", () => {
    expect(pullDistance(100)).toBeLessThan(100);
    expect(pullDistance(10_000)).toBeLessThan(PULL_MAX);
  });
  it("reaches the threshold with a comfortable finger travel (~100–160px)", () => {
    const needed = [...Array(400).keys()].find((raw) => pullDistance(raw) >= PULL_THRESHOLD)!;
    expect(needed).toBeGreaterThan(90);
    expect(needed).toBeLessThan(170);
  });
});

it("pullProgress is clamped to 0..1", () => {
  expect(pullProgress(0)).toBe(0);
  expect(pullProgress(PULL_THRESHOLD / 2)).toBe(0.5);
  expect(pullProgress(PULL_THRESHOLD * 3)).toBe(1);
});

it("isVerticalPull waits for a few px, then needs a mostly downward move", () => {
  expect(isVerticalPull(2, 3)).toBeNull();
  expect(isVerticalPull(3, 20)).toBe(true);
  expect(isVerticalPull(30, 20)).toBe(false);
  expect(isVerticalPull(0, -20)).toBe(false);
});

describe("canStartPull", () => {
  function setup(html: string) {
    document.body.innerHTML = html;
    return document;
  }
  const noScroll = () => ({ overflowX: "visible" }) as CSSStyleDeclaration;
  const base = { standalone: true, scrollY: 0, getStyle: noScroll };

  it("only in the installed app, at the top of the page", () => {
    const doc = setup('<main><p id="t">x</p></main>');
    const target = doc.getElementById("t");
    expect(canStartPull({ ...base, doc, target })).toBe(true);
    expect(canStartPull({ ...base, doc, target, standalone: false })).toBe(false);
    expect(canStartPull({ ...base, doc, target, scrollY: 1 })).toBe(false);
  });

  it("not while a sheet/dialog/drawer is open, nor from inputs", () => {
    let doc = setup('<main><p id="t">x</p></main><div role="dialog">sheet</div>');
    expect(canStartPull({ ...base, doc, target: doc.getElementById("t") })).toBe(false);
    doc = setup('<main><p id="t">x</p></main><div aria-modal="true">d</div>');
    expect(canStartPull({ ...base, doc, target: doc.getElementById("t") })).toBe(false);
    doc = setup('<main><input id="t" /></main>');
    expect(canStartPull({ ...base, doc, target: doc.getElementById("t") })).toBe(false);
  });

  it("not from a horizontally scrolling strip", () => {
    const doc = setup('<main><div id="strip"><button id="t">chip</button></div></main>');
    const strip = doc.getElementById("strip")!;
    Object.defineProperty(strip, "scrollWidth", { value: 800 });
    Object.defineProperty(strip, "clientWidth", { value: 390 });
    const getStyle = (el: Element) =>
      ({ overflowX: el === strip ? "auto" : "visible" }) as CSSStyleDeclaration;
    const target = doc.getElementById("t");
    expect(inHorizontalScroller(target, getStyle)).toBe(true);
    expect(canStartPull({ ...base, doc, target, getStyle })).toBe(false);
  });
});
