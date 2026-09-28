/**
 * Copies the on-device OCR files (Tesseract.js worker, WASM core, Arabic + French models) into
 * public/ocr/ so they are served by us, not a CDN (jsdelivr was blocked in field tests).
 * Runs on postinstall, so it also runs on Vercel builds. public/ocr/ is gitignored.
 *
 * Paths used by the OCR module: workerPath "/ocr/worker.min.js", corePath "/ocr/core",
 * langPath "/ocr/lang" (gzip: true).
 * Only the LSTM cores are copied (the models are LSTM-only); the .wasm.js files embed the wasm.
 */
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const pkgDir = (name: string, from?: string) =>
  dirname(require.resolve(`${name}/package.json`, from ? { paths: [from] } : undefined));

const OUT = "public/ocr";
const tesseract = pkgDir("tesseract.js");
const core = pkgDir("tesseract.js-core", tesseract); // a dependency of tesseract.js (not hoisted by pnpm)

const files: [string, string][] = [
  [join(tesseract, "dist/worker.min.js"), "worker.min.js"],
  // getCore() picks one of these depending on the phone's WASM SIMD support.
  ...["relaxedsimd-lstm", "simd-lstm", "lstm"].map((v): [string, string] => [
    join(core, `tesseract-core-${v}.wasm.js`),
    `core/tesseract-core-${v}.wasm.js`,
  ]),
  ...["ara", "fra"].map((l): [string, string] => [
    join(pkgDir(`@tesseract.js-data/${l}`), "4.0.0_best_int", `${l}.traineddata.gz`),
    `lang/${l}.traineddata.gz`,
  ]),
];

rmSync(OUT, { recursive: true, force: true });
for (const [src, rel] of files) {
  const dest = join(OUT, rel);
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
console.log(`ocr assets: ${files.length} files → ${OUT}/`);
