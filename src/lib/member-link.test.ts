import { expect, it } from "vitest";
import { memberLinkPath, memberTokenFrom } from "./member-link";

const T = "Qm9zc2EtdGVzdC10b2tlbi0wMTIzNDU2Nzg5YWJjZGVm_-x";

it("finds the token in a link, a WhatsApp message, or on its own", () => {
  expect(memberTokenFrom(`https://baqie.vercel.app/m/${T}`)).toBe(T);
  expect(memberTokenFrom(`  https://baqie.vercel.app/m/${T}?utm=wa  `)).toBe(T);
  expect(memberTokenFrom(`هذا رابطك الخاص في صندوق الرابطة: https://baqie.vercel.app/m/${T}`)).toBe(
    T,
  );
  expect(memberTokenFrom(`«https://baqie.vercel.app/m/${T}»`)).toBe(T);
  expect(memberTokenFrom(T)).toBe(T);
  expect(memberTokenFrom("https://baqie.vercel.app/m/demo")).toBe("demo");
});

it("rejects anything else", () => {
  expect(memberTokenFrom("")).toBeNull();
  expect(memberTokenFrom("https://baqie.vercel.app/members")).toBeNull();
  expect(memberTokenFrom("مرحبا")).toBeNull();
  expect(memberTokenFrom("short")).toBeNull();
  expect(memberTokenFrom("https://x/m/<script>")).toBeNull();
});

it("builds the path", () => {
  expect(memberLinkPath(T)).toBe(`/m/${T}`);
});

it("reads the member flag cookie", async () => {
  const { hasMemberFlag } = await import("./member-link");
  expect(hasMemberFlag("a=1; bq_member_on=1; b=2")).toBe(true);
  expect(hasMemberFlag("bq_member_on=0")).toBe(false);
  expect(hasMemberFlag("")).toBe(false);
});
