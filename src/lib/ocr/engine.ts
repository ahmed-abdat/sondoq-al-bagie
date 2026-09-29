// Tesseract.js on the phone (ara+fra), self-hosted under /ocr (worker, wasm core, language data
// copied from node_modules by scripts/ocr-assets.mts). The library is imported dynamically, so
// it never enters the public bundle; the worker is shared and shut down after a minute idle.
import type { Worker } from "tesseract.js";
import { allowsBackgroundDownload, type NetworkInfo } from "@/lib/offline/data-saver";

const IDLE_MS = 60_000;

let worker: Promise<Worker> | null = null;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

function startWorker(): Promise<Worker> {
  return import("tesseract.js").then(({ createWorker }) =>
    createWorker(["ara", "fra"], 1, {
      workerPath: "/ocr/worker.min.js",
      corePath: "/ocr/core",
      langPath: "/ocr/lang",
      gzip: true,
      workerBlobURL: false,
    }),
  );
}

function getWorker(): Promise<Worker> {
  if (!worker) {
    worker = startWorker();
    // A failed start (offline, blocked asset) must not stick: try again next time.
    worker.catch(() => {
      worker = null;
    });
  }
  return worker;
}

function scheduleIdle() {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => void terminateOcr(), IDLE_MS);
}

/**
 * Call when the record-payment screen opens: downloads (once, then cached, about 8 MB) and starts
 * the engine. In data-saver mode or on 2G it waits for the first picked photo instead.
 */
export function warmOcr(): void {
  const conn = (navigator as Navigator & { connection?: NetworkInfo }).connection;
  if (!allowsBackgroundDownload(conn)) return;
  void getWorker().then(scheduleIdle, () => undefined);
}

/** Free the worker (e.g. when leaving the screen). Safe to call any time. */
export async function terminateOcr(): Promise<void> {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = null;
  const w = worker;
  worker = null;
  if (w) await w.then((x) => x.terminate()).catch(() => undefined);
}

/** Text of an image plus Tesseract's own 0–100 confidence. */
export async function recognizeText(image: Blob): Promise<{ text: string; confidence: number }> {
  if (idleTimer) clearTimeout(idleTimer);
  try {
    const w = await getWorker();
    const { data } = await w.recognize(image);
    return { text: data.text ?? "", confidence: data.confidence ?? 0 };
  } finally {
    scheduleIdle();
  }
}
