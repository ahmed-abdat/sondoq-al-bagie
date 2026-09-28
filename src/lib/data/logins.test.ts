import { describe, expect, it } from "vitest";
import { displayLogin, generatePassword, parseLogin } from "./logins";

describe("logins", () => {
  it("maps phones in any common form to one internal address", () => {
    for (const v of ["36123456", "+222 36 12 34 56", "0022236123456", "٣٦١٢٣٤٥٦", "22236123456"]) {
      expect(parseLogin(v)).toEqual({
        kind: "phone",
        authEmail: "22236123456@phone.sondoq.invalid",
        display: "+22236123456",
      });
    }
  });

  it("accepts emails (lowercased) and refuses bad input and the internal domain", () => {
    expect(parseLogin(" Ahmed@Example.com ")).toEqual({
      kind: "email",
      authEmail: "ahmed@example.com",
      display: "ahmed@example.com",
    });
    expect(parseLogin("12345")).toBeNull();
    expect(parseLogin("56123456")).toBeNull(); // not a 2/3/4 mobile prefix
    expect(parseLogin("x@phone.sondoq.invalid")).toBeNull();
    expect(parseLogin("not an email@")).toBeNull();
  });

  it("shows phone logins as +222…", () => {
    expect(displayLogin("22236123456@phone.sondoq.invalid")).toBe("+22236123456");
    expect(displayLogin("a@b.co")).toBe("a@b.co");
  });

  it("generates 12-character passwords without look-alike characters", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(p).toMatch(/^[a-hj-km-np-z2-9]{12}$/);
      expect((p.match(/\d/g) ?? []).length).toBeGreaterThanOrEqual(2);
      seen.add(p);
    }
    expect(seen.size).toBe(200);
  });
});
