import { expect, it } from "vitest";
import { jpegsToPdf } from "./pdf";

const img = (n: number) => ({ jpeg: new Uint8Array(n).fill(0xab), w: 10, h: 14 });

it("writes a PDF whose xref points at every object", () => {
  const bytes = jpegsToPdf([img(100), img(50)], { title: "تقرير" });
  const s = new TextDecoder("latin1").decode(bytes);
  expect(s.startsWith("%PDF-1.4\n")).toBe(true);
  expect(s.trimEnd().endsWith("%%EOF")).toBe(true);
  expect(s).toContain("/Count 2");
  expect(s).toContain("/Filter /DCTDecode /Length 100");
  expect(s).toContain("<FEFF062A06420631068A0631>".replace("068A", "064A"));

  const startxref = Number(s.match(/startxref\n(\d+)/)![1]);
  expect(s.slice(startxref, startxref + 4)).toBe("xref");
  const [, count] = s
    .slice(startxref)
    .match(/xref\n0 (\d+)/)!
    .map(Number);
  expect(count).toBe(4 + 2 * 3);
  const offsets = [...s.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  offsets.forEach((o, i) => expect(s.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
});

it("refuses an empty document", () => {
  expect(() => jpegsToPdf([])).toThrow();
});
