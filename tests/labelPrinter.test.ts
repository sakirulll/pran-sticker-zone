// Checks for the data sent straight to a label printer. These need no server:
//   node --test tests/labelPrinter.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { packDots, tsplJob } from "../src/labelPrinter.ts";

test("dots are packed eight to a byte, left dot first, with black as a cleared bit", () => {
  // Two rows of ten dots: the first has dots 0 and 9 black, the second is all black.
  const row = (blackAt: number[]) => Array.from({ length: 10 }, (_unused, x) => blackAt.includes(x));
  const picture = packDots([...row([0, 9]), ...row([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])], 10, 2);
  assert.equal(picture.widthBytes, 2);
  assert.equal(picture.height, 2);
  // Row 1: 0111 1111, 1011 1111 (dot 9 black; the six dots past the edge stay white).
  // Row 2: 0000 0000, 0011 1111.
  assert.deepEqual([...picture.data], [0x7f, 0xbf, 0x00, 0x3f]);
});

test("an empty picture is all white", () => {
  assert.deepEqual([...packDots(new Array(16).fill(false), 8, 2).data], [0xff, 0xff]);
});

test("a print job names the label size, carries the picture untouched, and asks for the copies", () => {
  const picture = packDots(new Array(16 * 3).fill(false).map((_unused, i) => i % 5 === 0), 16, 3);
  const job = tsplJob(picture, { widthMm: 50, heightMm: 25, gapMm: 2, copies: 3 });
  const text = Buffer.from(job).toString("latin1");
  const head = "SIZE 50 mm,25 mm\r\nGAP 2 mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nCLS\r\nBITMAP 0,0,2,3,0,";
  assert.equal(text.slice(0, head.length), head);
  assert.deepEqual([...job.slice(head.length, head.length + 6)], [...picture.data]);
  assert.equal(text.slice(head.length + 6), "\r\nPRINT 3,1\r\n");
  assert.equal(job.length, head.length + 6 + "\r\nPRINT 3,1\r\n".length);
});

test("a continuous roll has no gap, and at least one copy is always printed", () => {
  const text = Buffer.from(tsplJob(packDots([true], 1, 1), { widthMm: 25, heightMm: 50, gapMm: 0, copies: 0 })).toString("latin1");
  assert.match(text, /^SIZE 25 mm,50 mm\r\nGAP 0 mm,0 mm\r\n/);
  assert.match(text, /\r\nPRINT 1,1\r\n$/);
});
