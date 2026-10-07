// Checks for the barcode maker. These need no server:  node --test tests/barcode.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { canEncode, code128Modules, code128Svg } from "../src/barcode.ts";

test("every symbol is 11 modules wide, the stop 13, and no two are the same", () => {
  const seen = new Set<string>();
  for (let value = 0; value < 95; value++) {
    const character = String.fromCharCode(value + 32);
    // "Xc" = start, X, checksum, stop; take the 11 modules of the data character.
    const symbol = code128Modules(character)!.slice(11, 22);
    assert.equal(symbol.length, 11);
    assert.match(symbol, /^1.*0$/, "a symbol starts with a bar and ends with a space");
    assert.equal(seen.has(symbol), false, `symbol for "${character}" repeats another`);
    seen.add(symbol);
  }
  assert.equal(code128Modules("A")!.length, 11 * 3 + 13);
});

test("known barcodes come out exactly", () => {
  // Reference values from an independent Code 128 encoder (JsBarcode, code set B),
  // which agreed with this one on 199 samples covering every character.
  const known: Record<string, string> = {
    "BS-001": "11010010000100010110001101110100010011011100100111011001001110110010011100110110010001001100011101011",
    "Item 12/A (x)": "1101001000011000100010100111101001011001000011110111010110110011001001110011011001110010101110011001010001100011011001100100011001001111001001011001001000111000101101100011101011",
  };
  for (const [text, modules] of Object.entries(known)) assert.equal(code128Modules(text), modules);
});

test("a code of digits only is packed two digits to a symbol, making it much narrower", () => {
  // Reference value from JsBarcode, code set C.
  assert.equal(code128Modules("123456789004"), "11010011100101100111001000101100011100010110110000101001101111011010010001100100110010001100011101011");
  assert.equal(code128Modules("123456789004")!.length, 101);
  // An odd number of digits, or any other character, cannot be paired and stays in set B.
  assert.equal(code128Modules("12345")!.length, 11 * (5 + 2) + 13);
  assert.equal(code128Modules("1234-5")!.length, 11 * (6 + 2) + 13);
});

test("only text a scanner can read is accepted", () => {
  assert.equal(canEncode("BS-001"), true);
  assert.equal(canEncode("Item 12/A (x)"), true);
  assert.equal(canEncode(""), false);
  assert.equal(canEncode("স্টিকার"), false);
  assert.equal(canEncode("x".repeat(41)), false);
  assert.equal(code128Modules("স্টিকার"), null);
  assert.equal(code128Svg("স্টিকার"), "");
});

test("the picture has one bar per run and a quiet zone on both sides", () => {
  const svg = code128Svg("BS-001", 40);
  const modules = code128Modules("BS-001")!;
  assert.equal((svg.match(/<rect /g) || []).length, (modules.match(/1+/g) || []).length);
  assert.match(svg, new RegExp(`viewBox="0 0 ${modules.length + 20} 40"`));
  assert.match(svg, /<rect x="10" /);
});
