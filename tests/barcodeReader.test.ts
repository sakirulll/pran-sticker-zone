// Checks that barcodes this app prints can be read back from a picture, by a
// reader written independently of the code that draws them. These need no server:
//   node --test tests/barcodeReader.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { code128Modules } from "../src/barcode.ts";
import { makeReader } from "../src/barcodeReader.ts";

// A grey picture with the barcode for `text` across the middle, as a camera
// might see it: `scale` dots a module, with uneven light and grain if asked.
function photograph(text: string, scale: number, options: { noise?: number; shade?: boolean; upsideDown?: boolean } = {}) {
  const modules = code128Modules(text)!;
  const quiet = 12 * scale;
  const width = modules.length * scale + quiet * 2;
  const height = 120;
  const pixels = new Uint8ClampedArray(width * height * 4);
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const column = options.upsideDown ? width - 1 - x : x;
      const inBars = y > 20 && y < 100 && column >= quiet && column < width - quiet;
      const black = inBars && modules[Math.floor((column - quiet) / scale)] === "1";
      // Paper that is brighter on one side than the other, and ink that is not quite black.
      const paper = options.shade ? 150 + (90 * x) / width : 235;
      const value = (black ? paper * 0.25 : paper) + (options.noise ? (random() - 0.5) * options.noise : 0);
      const at = (y * width + x) * 4;
      pixels[at] = pixels[at + 1] = pixels[at + 2] = value;
      pixels[at + 3] = 255;
    }
  }
  return { pixels, width, height };
}

test("barcodes this app prints are read back exactly, letters and digits alike", async () => {
  const read = await makeReader();
  for (const text of ["123456789004", "BS-001", "E2E-001", "Item 12/A", "0001", "PRAN-STICKER-ZONE-0001"]) {
    const { pixels, width, height } = photograph(text, 3);
    assert.equal(read(pixels, width, height), text);
  }
});

test("a small, grainy, unevenly lit or upside-down barcode is still read", async () => {
  const read = await makeReader();
  const cases: [string, ReturnType<typeof photograph>][] = [
    ["two dots a bar", photograph("123456789004", 2)],
    // Grain of the size a phone camera gives in a dim shop.
    ["grain", photograph("123456789004", 3, { noise: 30 })],
    ["uneven light", photograph("BS-001", 3, { shade: true })],
    ["uneven light and grain", photograph("BS-001", 4, { shade: true, noise: 30 })],
    ["upside down", photograph("BS-001", 3, { upsideDown: true })],
  ];
  for (const [name, { pixels, width, height }] of cases) {
    assert.ok(["123456789004", "BS-001"].includes(read(pixels, width, height)), name);
  }
});

test("a picture with no barcode gives nothing, and the reader carries on working afterwards", async () => {
  const read = await makeReader();
  const blank = new Uint8ClampedArray(320 * 120 * 4).fill(230);
  assert.equal(read(blank, 320, 120), "");
  const stripes = new Uint8ClampedArray(320 * 120 * 4);
  for (let i = 0; i < 320 * 120; i++) stripes[i * 4] = stripes[i * 4 + 1] = stripes[i * 4 + 2] = Math.floor((i % 320) / 9) % 2 ? 20 : 230;
  assert.equal(read(stripes, 320, 120), "");
  const { pixels, width, height } = photograph("BS-001", 3);
  assert.equal(read(pixels, width, height), "BS-001");
});
