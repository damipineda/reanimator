// OCR helpers for reading gauge values from a screenshot of the ORIGINAL
// SWF (which exposes no JS bridge - this is the only way to read its
// internal numbers without modifying the SWF). Ported from the Phase 0
// spike at work/lunar-lander/compare/ocr-regions.mjs - crop boxes,
// upscale factor and Tesseract parameters are unchanged, since they were
// calibrated against this exact SWF's exact layout (see that file's
// original header for the calibration method: find-boxes.mjs +
// calibrate.mjs + sweep.mjs).
//
// LIMITS of this method (report these, don't hide them - see
// docs/KIRO_NOTES.md and the verifier HTML report's own "OCR limits"
// section):
// - OCR on a small, non-standard vector font at ~12px size is NOT 100%
//   reliable; digits can be misread (e.g. a thin "1" vs "I", or a
//   partially-clipped "-" sign).
// - The SWF itself only ever displays 1 decimal place on speed/numeric
//   fields, so no comparison through this method can be more precise
//   than that, regardless of how precisely the rebuild's own internal
//   state is known.
// - Crop boxes are fixed pixel rectangles calibrated against ONE
//   screenshot at ONE moment; valid as long as the SWF's layout doesn't
//   reposition a field (it doesn't - positions are set once in init()).
// - A character whitelist is applied per-field (digits/sign/decimal
//   point only, except for the score field which has real letters).

import { createWorker } from 'tesseract.js';
import { PNG } from 'pngjs';
import fs from 'node:fs';

// Coordinates found by scanning for white input-box rectangles
// (see work/lunar-lander/compare/find-boxes.mjs), not estimated by eye.
export const CROPS = {
  altitude: { x: 691, y: 109, w: 58, h: 24 },
  range: { x: 695, y: 148, w: 48, h: 24 },
  vY: { x: 714, y: 187, w: 62, h: 26 },
  vX: { x: 715, y: 224, w: 61, h: 26 },
  thrust: { x: 714, y: 262, w: 62, h: 32 },
  fuel: { x: 670, y: 292, w: 44, h: 22 },
  score: { x: 561, y: 575, w: 70, h: 16 },
  // landingSpeedReport_mc.message1_txt - shows "keyNotFound<speed> m/s"
  // (the original's own localization bug - see
  // src/rewrite/reference/behavior-spec.md section 5b). Only the number
  // is needed; a regex extracts it from whatever OCR returns.
  landingMessage: { x: 225, y: 195, w: 275, h: 28 },
};

export function extractNumber(ocrText) {
  const m = ocrText.match(/-?\d+\.?\d*/);
  return m ? parseFloat(m[0]) : null;
}

export function cropPNG(srcPath, box) {
  const src = PNG.sync.read(fs.readFileSync(srcPath));
  const dst = new PNG({ width: box.w, height: box.h });
  PNG.bitblt(src, dst, box.x, box.y, box.w, box.h, 0, 0);
  return dst;
}

let worker = null;
export async function getWorker() {
  if (!worker) {
    worker = await createWorker('eng');
    // PSM 3 (full automatic page segmentation) at 2x upscale gave exact
    // matches during Phase 0 calibration; tesseract.js's actual default
    // is NOT PSM 3, so it must be set explicitly.
    await worker.setParameters({ tessedit_pageseg_mode: '3' });
  }
  return worker;
}

// Nearest-neighbor upscale. Small vector-font text (~12-14px) is
// unreliable for Tesseract at native size; upscaling 2x measurably
// improved recognition during Phase 0 calibration.
function upscale(png, factor) {
  const out = new PNG({ width: png.width * factor, height: png.height * factor });
  for (let y = 0; y < out.height; y++) {
    for (let x = 0; x < out.width; x++) {
      const sx = Math.floor(x / factor);
      const sy = Math.floor(y / factor);
      const si = (png.width * sy + sx) << 2;
      const di = (out.width * y + x) << 2;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

export const NUMERIC_WHITELIST = '0123456789.-+';

export async function ocrCrop(screenshotPath, box, whitelist = null) {
  const png = upscale(cropPNG(screenshotPath, box), 2);
  const buf = PNG.sync.write(png);
  const w = await getWorker();
  await w.setParameters({ tessedit_char_whitelist: whitelist || '' });
  const { data } = await w.recognize(buf);
  return data.text.trim();
}

export async function readAllGauges(screenshotPath) {
  const out = {};
  for (const [name, box] of Object.entries(CROPS)) {
    const whitelist = name === 'score' ? null : NUMERIC_WHITELIST;
    out[name] = await ocrCrop(screenshotPath, box, whitelist);
  }
  return out;
}

export async function closeWorker() {
  if (worker) {
    await worker.terminate();
    worker = null;
  }
}
