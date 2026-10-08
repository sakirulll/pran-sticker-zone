// Checks for the data sent to a receipt printer. These need no server:
//   node --test tests/receiptPrinter.test.ts

import assert from "node:assert/strict";
import { test } from "node:test";
import { packDots } from "../src/labelPrinter.ts";
import { escposJob, tsplReceiptJob } from "../src/receiptPrinter.ts";

// A picture 16 dots wide and `rows` high with one black dot at the start of each row.
const picture = (rows: number) => packDots(Array.from({ length: 16 * rows }, (_unused, i) => i % 16 === 0), 16, rows);

test("an ESC/POS job resets the printer, sends the picture with black as a set bit, then feeds and cuts", () => {
  const job = [...escposJob(picture(2))];
  assert.deepEqual(job.slice(0, 2), [0x1b, 0x40]);
  // GS v 0, normal size, 2 bytes wide, 2 dots high.
  assert.deepEqual(job.slice(2, 10), [0x1d, 0x76, 0x30, 0x00, 2, 0, 2, 0]);
  // Each row: the first dot black, the rest white. The picture keeps white as 1; the printer wants black as 1.
  assert.deepEqual(job.slice(10, 14), [0x80, 0x00, 0x80, 0x00]);
  assert.deepEqual(job.slice(14), [0x1b, 0x64, 0x02, 0x1d, 0x56, 0x42, 0x00]);
});

test("a long receipt goes in bands, each with its own height, and nothing is lost between them", () => {
  const job = [...escposJob(picture(250), 96)];
  const bands: number[] = [];
  let at = 2;
  let data = 0;
  while (job[at] === 0x1d && job[at + 1] === 0x76) {
    const rows = job[at + 6] + job[at + 7] * 256;
    assert.equal(job[at + 4] + job[at + 5] * 256, 2, "every band is the full width");
    bands.push(rows);
    for (let row = 0; row < rows; row++) assert.deepEqual(job.slice(at + 8 + row * 2, at + 10 + row * 2), [0x80, 0x00]);
    data += rows * 2;
    at += 8 + rows * 2;
  }
  assert.deepEqual(bands, [96, 96, 58]);
  assert.equal(data, 250 * 2);
  assert.deepEqual(job.slice(at), [0x1b, 0x64, 0x02, 0x1d, 0x56, 0x42, 0x00]);
});

test("a height over 255 dots in one band is written low byte first", () => {
  const job = [...escposJob(picture(300), 300)];
  assert.deepEqual(job.slice(2, 10), [0x1d, 0x76, 0x30, 0x00, 2, 0, 300 & 0xff, 300 >> 8]);
});

test("a TSPL receipt job gives the paper size in millimetres with no gap, and the picture as it is", () => {
  const source = packDots(new Array(384 * 80).fill(false), 384, 80);
  const job = tsplReceiptJob(source, 8);
  const text = Buffer.from(job).toString("latin1");
  const head = "SIZE 48 mm,10 mm\r\nGAP 0 mm,0 mm\r\nDIRECTION 1\r\nREFERENCE 0,0\r\nCLS\r\nBITMAP 0,0,48,80,0,";
  assert.equal(text.slice(0, head.length), head);
  assert.equal(job.length, head.length + 48 * 80 + "\r\nPRINT 1,1\r\n".length);
  assert.ok(job.slice(head.length, head.length + 48 * 80).every((byte) => byte === 0xff), "a blank picture is all white");
  assert.match(text, /\r\nPRINT 1,1\r\n$/);
});
