// PAN-card photo → PAN number, read in the browser (tesseract.js, self-hosted from /ocr).
// The image never leaves the device; only the typed-in PAN is later sent for verification, as before.

const PAN_HOLDER_CODES = 'ABCFGHJLPT';
const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

// OCR mixes up look-alike glyphs. A PAN has a fixed shape (5 letters, 4 digits, 1 letter), so each
// position only accepts one kind and we map the common confusions to it.
const TO_LETTER: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B', '2': 'Z', '6': 'G' };
const TO_DIGIT: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', S: '5', B: '8', Z: '2', G: '6' };

function fixWindow(w: string): string | null {
  let out = '';
  for (let i = 0; i < 10; i++) {
    const c = w[i];
    const wantDigit = i >= 5 && i <= 8;
    if (wantDigit) {
      const d = /[0-9]/.test(c) ? c : TO_DIGIT[c];
      if (!d) return null;
      out += d;
    } else {
      const l = /[A-Z]/.test(c) ? c : TO_LETTER[c];
      if (!l) return null;
      out += l;
    }
  }
  return PAN_RE.test(out) && PAN_HOLDER_CODES.includes(out[3]) ? out : null;
}

/**
 * The PAN found in raw OCR text, or null. Exact matches win over repaired ones, so a clean read is
 * never "corrected" into a different number. The 4th letter must be a real holder-type code.
 */
export function extractPan(text: string): string | null {
  if (!text) return null;
  const up = text.toUpperCase();
  for (const m of up.match(/[A-Z]{5}\s?[0-9]{4}\s?[A-Z]/g) ?? []) {
    const s = m.replace(/\s/g, '');
    if (PAN_HOLDER_CODES.includes(s[3])) return s;
  }
  // Repair pass over each line's alphanumerics (other lines hold the name, DOB, "INCOME TAX DEPARTMENT").
  for (const line of up.split(/\r?\n/)) {
    const s = line.replace(/[^A-Z0-9]/g, '');
    for (let i = 0; i + 10 <= s.length; i++) {
      const fixed = fixWindow(s.slice(i, i + 10));
      if (fixed) return fixed;
    }
  }
  return null;
}

export const MAX_PAN_IMAGE_BYTES = 10 * 1024 * 1024;

export type PanScanResult =
  | { pan: string }
  | { pan: null; reason: 'not_image' | 'too_big' | 'not_found' | 'error' };

/** Reads a PAN card photo on-device. The OCR engine is only downloaded when a photo is chosen. */
export async function scanPanFromImage(file: File): Promise<PanScanResult> {
  if (!file.type.startsWith('image/')) return { pan: null, reason: 'not_image' };
  if (file.size > MAX_PAN_IMAGE_BYTES) return { pan: null, reason: 'too_big' };
  try {
    const { createWorker } = await import('tesseract.js');
    const worker = await createWorker('eng', 1, {
      workerPath: '/ocr/worker.min.js',
      corePath: '/ocr/',
      langPath: '/ocr/',
      gzip: true,
    });
    try {
      const { data } = await worker.recognize(file);
      const pan = extractPan(data.text);
      return pan ? { pan } : { pan: null, reason: 'not_found' };
    } finally {
      await worker.terminate();
    }
  } catch {
    return { pan: null, reason: 'error' };
  }
}
