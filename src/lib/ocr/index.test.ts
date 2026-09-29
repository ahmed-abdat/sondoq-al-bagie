import { beforeEach, describe, expect, it, vi } from "vitest";
import * as F from "./fixtures";

const recognize = vi.fn();
const terminate = vi.fn(async () => ({}));
const createWorker = vi.fn(async () => ({ recognize, terminate }));
vi.mock("tesseract.js", () => ({ createWorker }));
vi.mock("./preprocess", () => ({ preprocessImage: async (b: Blob) => b }));

const { readReceipt, terminateOcr, warmOcr } = await import("./index");

const photo = new Blob([new Uint8Array([0xff, 0xd8, 0xff])], { type: "image/jpeg" });
const opts = { accounts: F.ACCOUNTS, now: new Date("2026-09-29T12:00:00Z") };
const text = (t: string) => ({ data: { text: t, confidence: 80 } });

beforeEach(async () => {
  await terminateOcr();
  recognize.mockReset();
  createWorker.mockClear();
});

describe("readReceipt", () => {
  it("self-hosts the engine with the tested options", async () => {
    recognize.mockResolvedValue(text(F.BANKILY));
    await readReceipt(photo, opts);
    expect(createWorker).toHaveBeenCalledWith(["ara", "fra"], 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/core",
      langPath: "/ocr/lang",
      gzip: true,
      workerBlobURL: false,
    });
  });

  it("returns MRO amounts and passes everything on a clean read, without a second pass", async () => {
    recognize.mockResolvedValue(text(F.SEDAD));
    const r = await readReceipt(photo, { ...opts, expectedMro: 15000 });
    expect(r).toMatchObject({
      method: "sedad",
      amountMru: 1500,
      amountMro: 15000,
      txnRef: "TR07258252750",
      recipientOk: true,
      confidence: 1,
      secondPass: false,
    });
    expect(recognize).toHaveBeenCalledTimes(1);
  });

  it("reads again on a cleaned image when checks fail and keeps the good fields", async () => {
    recognize
      .mockResolvedValueOnce(text(F.MASRVI_BAD_FIRST_PASS))
      .mockResolvedValueOnce(text(F.MASRVI));
    const r = await readReceipt(photo, { ...opts, expectedMro: 5000 });
    expect(r.secondPass).toBe(true);
    expect(r).toMatchObject({ amountMro: 5000, txnRef: "266837993", confidence: 1 });
    expect(r.raw).toContain("---");
  });

  it("marks fields to check when nothing can be read", async () => {
    recognize.mockResolvedValue(text(F.NOT_A_RECEIPT));
    const r = await readReceipt(photo, opts);
    expect(r.method).toBeNull();
    expect(r.confidence).toBe(0);
    expect(r.checks).toEqual({
      method: false,
      amount: false,
      txnRef: false,
      date: false,
      recipient: false,
    });
  });

  it("data saver: no warm-up download; the first photo starts the engine", async () => {
    Object.defineProperty(navigator, "connection", {
      configurable: true,
      value: { saveData: true },
    });
    createWorker.mockClear();
    warmOcr();
    expect(createWorker).not.toHaveBeenCalled();
    recognize.mockResolvedValue(text(F.BANKILY));
    await readReceipt(photo, opts);
    expect(createWorker).toHaveBeenCalledTimes(1);
    await terminateOcr();
    Object.defineProperty(navigator, "connection", { configurable: true, value: undefined });
  });

  it("warms one shared worker and frees it", async () => {
    warmOcr();
    warmOcr();
    recognize.mockResolvedValue(text(F.BANKILY));
    await readReceipt(photo, opts);
    expect(createWorker).toHaveBeenCalledTimes(1);
    await terminateOcr();
    expect(terminate).toHaveBeenCalled();
  });
});
