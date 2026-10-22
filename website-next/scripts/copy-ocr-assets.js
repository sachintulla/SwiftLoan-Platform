// Copies the OCR engine + English model from node_modules into public/ocr so the PAN photo is read
// in the browser from our own origin (no third-party CDN, and the image never leaves the device).
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'public', 'ocr');
const files = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'eng.traineddata.gz'],
];

fs.mkdirSync(out, { recursive: true });
for (const [from, to] of files) {
  const src = path.join(root, from);
  if (!fs.existsSync(src)) {
    console.error(`copy-ocr-assets: missing ${from} — run npm install`);
    process.exit(1);
  }
  fs.copyFileSync(src, path.join(out, to));
}
console.log(`copy-ocr-assets: ${files.length} files → public/ocr`);
