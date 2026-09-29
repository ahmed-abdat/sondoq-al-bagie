import { expect, it } from "vitest";
import { clientIp, createFailLimiter } from "./fail-limiter";

it("blocks after max failures in the window, then lets go", () => {
  const l = createFailLimiter(3, 1000);
  for (let i = 0; i < 3; i++) {
    expect(l.blocked("a", 100)).toBe(false);
    l.fail("a", 100 + i);
  }
  expect(l.blocked("a", 200)).toBe(true);
  expect(l.blocked("b", 200)).toBe(false);
  expect(l.blocked("a", 1_200)).toBe(false);
});

it("forgets the oldest keys beyond the cap", () => {
  const l = createFailLimiter(1, 1000, 2);
  l.fail("a", 0);
  l.fail("b", 0);
  l.fail("c", 0);
  expect(l.blocked("a", 1)).toBe(false);
  expect(l.blocked("c", 1)).toBe(true);
});

it("reads the client IP", () => {
  expect(clientIp(new Headers({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }))).toBe("1.2.3.4");
  expect(clientIp(new Headers({ "x-real-ip": "5.6.7.8" }))).toBe("5.6.7.8");
  expect(clientIp(new Headers())).toBe("unknown");
});
